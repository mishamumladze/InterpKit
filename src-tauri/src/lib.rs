use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use tauri::{Manager, RunEvent};

const CAPTURE_SCRIPT: &str = include_str!("../../captions/capture.py");
const CAPTION_WS_PORT: u16 = 8765;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct CaptionProcess(Mutex<Option<Child>>);

fn hidden_command(program: &str) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn find_python() -> Option<(String, Vec<String>)> {
    let candidates: [(&str, Vec<&str>); 3] = [
        ("python", vec![]),
        ("py", vec!["-3"]),
        ("python3", vec![]),
    ];

    for (program, args) in candidates {
        let status = hidden_command(program)
            .args(&args)
            .arg("--version")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();

        if matches!(status, Ok(status) if status.success()) {
            return Some((
                program.to_string(),
                args.iter().map(|arg| (*arg).to_string()).collect(),
            ));
        }
    }

    None
}

fn check_python_dependencies(program: &str, args: &[String]) -> Result<(), String> {
    let output = hidden_command(program)
        .args(args)
        .arg("-c")
        .arg("import comtypes, websockets")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("Could not check Python packages: {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    let details = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if details.is_empty() {
        Err("Python is missing required packages. Run: pip install comtypes websockets".to_string())
    } else {
        Err(format!(
            "Python is missing required packages. Run: pip install comtypes websockets\n\n{details}"
        ))
    }
}

fn write_capture_script(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?
        .join("captions");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;

    let path = directory.join("capture.py");
    let needs_write = std::fs::read_to_string(&path)
        .map(|existing| existing != CAPTURE_SCRIPT)
        .unwrap_or(true);

    if needs_write {
        std::fs::write(&path, CAPTURE_SCRIPT).map_err(|error| error.to_string())?;
    }

    Ok(path)
}

#[tauri::command]
fn start_captions(
    app: tauri::AppHandle,
    state: tauri::State<'_, CaptionProcess>,
) -> Result<String, String> {
    let mut process = state
        .0
        .lock()
        .map_err(|_| "Caption process lock poisoned".to_string())?;

    let running = match process.as_mut() {
        Some(child) => match child.try_wait() {
            Ok(None) => true,
            Ok(Some(_)) => false,
            Err(error) => {
                return Err(format!("Could not check the caption process: {error}"));
            }
        },
        None => false,
    };

    if running {
        return Ok("running".to_string());
    }
    *process = None;

    if std::net::TcpStream::connect(("127.0.0.1", CAPTION_WS_PORT)).is_ok() {
        return Ok("already-running".to_string());
    }

    let (program, args) = find_python().ok_or_else(|| {
        "Python 3 was not found. Install Python 3 and run: pip install comtypes websockets"
            .to_string()
    })?;
    check_python_dependencies(&program, &args)?;

    let script = write_capture_script(&app)?;
    let child = hidden_command(&program)
        .args(&args)
        .arg(&script)
        .arg("--no-web")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Could not start the caption service: {error}"))?;

    *process = Some(child);
    Ok("started".to_string())
}

#[tauri::command]
fn stop_captions(state: tauri::State<'_, CaptionProcess>) -> Result<String, String> {
    let mut process = state
        .0
        .lock()
        .map_err(|_| "Caption process lock poisoned".to_string())?;

    if let Some(mut child) = process.take() {
        let _ = child.kill();
        let _ = child.wait();
        Ok("stopped".to_string())
    } else {
        Ok("not-running".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(CaptionProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            greet,
            start_captions,
            stop_captions
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                let state = app_handle.state::<CaptionProcess>();
                if let Ok(mut process) = state.0.lock() {
                    if let Some(mut child) = process.take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        });
}
