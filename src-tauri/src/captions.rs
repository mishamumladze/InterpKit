use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use uiautomation::types::{ControlType, Handle, TreeScope, UIProperty};
use uiautomation::variants::Variant;
use uiautomation::UIAutomation;
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::FindWindowW;

const POLL_INTERVAL: Duration = Duration::from_millis(250);
const SNAPSHOT_LIMIT: usize = 8000;
const OVERLAP_LIMIT: usize = 20000;
const MIN_OVERLAP: usize = 8;

#[derive(Clone, Serialize)]
pub struct CaptionSnapshot {
    pub running: bool,
    pub state: String,
    pub message: Option<String>,
    pub text: String,
}

#[derive(Clone, Serialize)]
struct CaptionStatusPayload {
    state: String,
    message: Option<String>,
}

struct SharedState {
    status: Mutex<(String, Option<String>)>,
    text: Mutex<String>,
}

impl SharedState {
    fn new() -> Self {
        Self {
            status: Mutex::new(("stopped".to_string(), None)),
            text: Mutex::new(String::new()),
        }
    }
}

#[derive(Default)]
struct CaptureState {
    stop: Option<Arc<AtomicBool>>,
    handle: Option<JoinHandle<()>>,
}

pub struct CaptionCapture {
    state: Mutex<CaptureState>,
    shared: Arc<SharedState>,
}

impl CaptionCapture {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(CaptureState::default()),
            shared: Arc::new(SharedState::new()),
        }
    }

    pub fn start(&self, app: AppHandle) -> Result<String, String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "Caption state lock poisoned".to_string())?;

        if let Some(handle) = state.handle.as_ref() {
            if !handle.is_finished() {
                return Ok("running".to_string());
            }
        }

        if let Some(handle) = state.handle.take() {
            let _ = handle.join();
        }
        state.stop = None;

        if let Ok(mut status) = self.shared.status.lock() {
            *status = ("starting".to_string(), None);
        }
        if let Ok(mut text) = self.shared.text.lock() {
            text.clear();
        }

        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = Arc::clone(&stop);
        let shared = Arc::clone(&self.shared);

        let handle = thread::Builder::new()
            .name("interpkit-captions".to_string())
            .spawn(move || run_capture(app, thread_stop, shared))
            .map_err(|error| format!("Could not start the caption thread: {error}"))?;

        state.stop = Some(stop);
        state.handle = Some(handle);
        Ok("started".to_string())
    }

    pub fn stop(&self) -> Result<String, String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "Caption state lock poisoned".to_string())?;

        let was_running = state
            .handle
            .as_ref()
            .map(|handle| !handle.is_finished())
            .unwrap_or(false);

        if let Some(stop) = state.stop.take() {
            stop.store(true, Ordering::SeqCst);
        }
        if let Some(handle) = state.handle.take() {
            let _ = handle.join();
        }

        if let Ok(mut status) = self.shared.status.lock() {
            *status = ("stopped".to_string(), None);
        }

        Ok(if was_running {
            "stopped".to_string()
        } else {
            "not-running".to_string()
        })
    }

    pub fn snapshot(&self) -> Result<CaptionSnapshot, String> {
        let running = {
            let state = self
                .state
                .lock()
                .map_err(|_| "Caption state lock poisoned".to_string())?;
            state
                .handle
                .as_ref()
                .map(|handle| !handle.is_finished())
                .unwrap_or(false)
        };

        let (state, message) = self
            .shared
            .status
            .lock()
            .map_err(|_| "Caption state lock poisoned".to_string())?
            .clone();
        let text = self
            .shared
            .text
            .lock()
            .map_err(|_| "Caption state lock poisoned".to_string())?
            .clone();

        Ok(CaptionSnapshot {
            running,
            state,
            message,
            text,
        })
    }
}

fn emit_status(
    app: &AppHandle,
    shared: &SharedState,
    state: &str,
    message: Option<String>,
) {
    if let Ok(mut status) = shared.status.lock() {
        *status = (state.to_string(), message.clone());
    }

    let _ = app.emit(
        "captions:status",
        CaptionStatusPayload {
            state: state.to_string(),
            message,
        },
    );
}

fn run_capture(app: AppHandle, stop: Arc<AtomicBool>, shared: Arc<SharedState>) {
    emit_status(&app, &shared, "starting", None);

    let automation = match UIAutomation::new() {
        Ok(automation) => automation,
        Err(error) => {
            emit_status(
                &app,
                &shared,
                "error",
                Some(format!("Could not initialize UI Automation: {error}")),
            );
            return;
        }
    };

    let mut transcript = String::new();
    let mut last_text = String::new();
    let mut last_status = "starting";

    while !stop.load(Ordering::SeqCst) {
        let hwnd = match unsafe {
            FindWindowW(w!("LiveCaptionsDesktopWindow"), PCWSTR::null())
        } {
            Ok(hwnd) if !hwnd.0.is_null() => hwnd,
            _ => {
                if last_status != "waiting" {
                    last_status = "waiting";
                    emit_status(
                        &app,
                        &shared,
                        "waiting",
                        Some("Open Windows Live Captions with Win + Ctrl + L.".to_string()),
                    );
                }
                thread::sleep(POLL_INTERVAL);
                continue;
            }
        };

        if last_status != "running" {
            last_status = "running";
            emit_status(&app, &shared, "running", None);
        }

        if let Some(snapshot) = read_caption_text(&automation, hwnd) {
            let merged = merge_transcript(&transcript, &snapshot);
            if merged != last_text {
                transcript = merged.clone();
                last_text = merged.clone();

                if let Ok(mut text) = shared.text.lock() {
                    *text = merged.clone();
                }
                let _ = app.emit("captions:text", &merged);
            }
        }

        thread::sleep(POLL_INTERVAL);
    }

    emit_status(&app, &shared, "stopped", None);
}

fn read_caption_text(automation: &UIAutomation, hwnd: HWND) -> Option<String> {
    let root = automation.element_from_handle(Handle::from(hwnd)).ok()?;

    for automation_id in ["CaptionsTextBlock", "CaptionsScrollViewer"] {
        let condition = automation
            .create_property_condition(
                UIProperty::AutomationId,
                Variant::from(automation_id),
                None,
            )
            .ok()?;

        if let Ok(node) = root.find_first(TreeScope::Descendants, &condition) {
            if let Ok(text) = node.get_name() {
                if !text.is_empty() {
                    return Some(text);
                }
            }
        }
    }

    let condition = automation
        .create_property_condition(
            UIProperty::ControlType,
            Variant::from(ControlType::Text as i32),
            None,
        )
        .ok()?;

    if let Ok(nodes) = root.find_all(TreeScope::Descendants, &condition) {
        for node in nodes {
            if let Ok(text) = node.get_name() {
                if !text.trim().is_empty() {
                    return Some(text);
                }
            }
        }
    }

    None
}

fn trim_end(chars: &mut Vec<char>) {
    while matches!(chars.last(), Some(character) if character.is_whitespace()) {
        chars.pop();
    }
}

fn split_live_line(chars: &[char]) -> (&[char], &[char]) {
    match chars.iter().rposition(|character| *character == '\n') {
        Some(index) => (&chars[..index], &chars[index + 1..]),
        None => (&[], chars),
    }
}

fn contains_slice(haystack: &[char], needle: &[char]) -> bool {
    if needle.is_empty() {
        return true;
    }
    if needle.len() > haystack.len() {
        return false;
    }

    haystack.windows(needle.len()).any(|window| window == needle)
}

fn longest_overlap(transcript: &[char], update: &[char]) -> usize {
    let mut low = 0;
    let mut high = transcript.len().min(update.len());

    while low < high {
        let middle = (low + high + 1) / 2;
        let start = transcript.len() - middle;

        if contains_slice(update, &transcript[start..]) {
            low = middle;
        } else {
            high = middle - 1;
        }
    }

    low
}

fn merge_transcript(transcript: &str, update: &str) -> String {
    let mut update_chars: Vec<char> = update.replace("\r\n", "\n").chars().collect();
    trim_end(&mut update_chars);

    let mut transcript_chars: Vec<char> = transcript.chars().collect();
    trim_end(&mut transcript_chars);

    if transcript_chars.is_empty() {
        return update_chars.into_iter().collect();
    }
    if update_chars.is_empty() {
        return transcript_chars.into_iter().collect();
    }

    if update_chars.len() > SNAPSHOT_LIMIT {
        let start = update_chars.len() - SNAPSHOT_LIMIT;
        let tail = &update_chars[start..];
        update_chars = match tail.iter().position(|character| *character == '\n') {
            Some(index) => tail[index + 1..].to_vec(),
            None => tail.to_vec(),
        };
    }

    let (settled, _) = split_live_line(&transcript_chars);
    let (snapshot_settled, snapshot_live) = split_live_line(&update_chars);

    let mut body: Vec<char>;

    if settled.is_empty() {
        body = snapshot_settled.to_vec();
    } else {
        let tail_start = settled.len().saturating_sub(OVERLAP_LIMIT);
        let tail = &settled[tail_start..];
        let matched = longest_overlap(tail, snapshot_settled);

        if matched >= MIN_OVERLAP
            || (!snapshot_settled.is_empty() && matched == snapshot_settled.len())
        {
            let suffix_start = tail.len() - matched;
            let suffix = &tail[suffix_start..];
            let anchor = snapshot_settled
                .windows(matched)
                .rposition(|window| window == suffix)
                .unwrap_or(0);

            body = settled.to_vec();
            body.extend_from_slice(&snapshot_settled[anchor + matched..]);
        } else if !snapshot_settled.is_empty() {
            body = settled.to_vec();
            body.push('\n');
            body.extend_from_slice(snapshot_settled);
        } else {
            body = settled.to_vec();
        }
    }

    if !snapshot_live.is_empty() {
        body.push('\n');
        body.extend_from_slice(snapshot_live);
    }

    body.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::merge_transcript;

    #[test]
    fn merges_first_snapshot() {
        assert_eq!(merge_transcript("", "Hello\nWorld"), "Hello\nWorld");
    }

    #[test]
    fn merges_short_lines() {
        assert_eq!(
            merge_transcript("Hello", "Hello\nWorld"),
            "Hello\nWorld"
        );
        assert_eq!(
            merge_transcript("Hello\nWorld", "Hello\nWorld\nNext"),
            "Hello\nHello\nWorld\nNext"
        );
    }

    #[test]
    fn merges_rewritten_live_line() {
        assert_eq!(
            merge_transcript("Hello\nWorld", "Hello\nWorld!"),
            "Hello\nWorld!"
        );
        assert_eq!(
            merge_transcript(
                "Hello\nWorld\nNext",
                "Hello\nWorld\nNext line changed"
            ),
            "Hello\nWorld\nNext line changed"
        );
    }

    #[test]
    fn merges_unicode() {
        assert_eq!(
            merge_transcript("Hola\n¿Cómo estás?", "Hola\n¿Cómo estás?\nBien"),
            "Hola\nHola\n¿Cómo estás?\nBien"
        );
    }

    #[test]
    fn merges_rolling_window() {
        assert_eq!(
            merge_transcript("a\nb\nc\nd", "c\nd\ne"),
            "a\nb\nc\nc\nd\ne"
        );
    }
}
