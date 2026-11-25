#[cfg(target_os = "windows")]
mod captions;

#[cfg(not(target_os = "windows"))]
mod captions {
    use tauri::AppHandle;

    #[derive(Clone, serde::Serialize)]
    pub struct CaptionSnapshot {
        pub running: bool,
        pub state: String,
        pub message: Option<String>,
        pub text: String,
    }

    pub struct CaptionCapture;

    impl CaptionCapture {
        pub fn new() -> Self {
            Self
        }

        pub fn start(&self, _app: AppHandle) -> Result<String, String> {
            Err("Live Captions is only available on Windows 11".to_string())
        }

        pub fn stop(&self) -> Result<String, String> {
            Ok("not-running".to_string())
        }

        pub fn snapshot(&self) -> Result<CaptionSnapshot, String> {
            Ok(CaptionSnapshot {
                running: false,
                state: "stopped".to_string(),
                message: None,
                text: String::new(),
            })
        }
    }
}

use tauri::{Manager, RunEvent};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn start_captions(
    app: tauri::AppHandle,
    capture: tauri::State<'_, captions::CaptionCapture>,
) -> Result<String, String> {
    capture.start(app)
}

#[tauri::command]
fn stop_captions(
    capture: tauri::State<'_, captions::CaptionCapture>,
) -> Result<String, String> {
    capture.stop()
}

#[tauri::command]
fn captions_status(
    capture: tauri::State<'_, captions::CaptionCapture>,
) -> Result<captions::CaptionSnapshot, String> {
    capture.snapshot()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(captions::CaptionCapture::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            start_captions,
            stop_captions,
            captions_status
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                if let Some(capture) = app_handle.try_state::<captions::CaptionCapture>() {
                    let _ = capture.stop();
                }
            }
        });
}
