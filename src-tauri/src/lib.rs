//! 知微 · 科研工作台 Tauri 壳（M2 P6）。
//!
//! 职责：
//! 1. 探测空闲端口（3001 起）→ 拉起后端进程（开发态 .venv python，发布态 resources 内
//!    backend-server.exe，均传 --port N）
//! 2. `backend_info` command：把端口下发给前端（api.ts 的 apiBase 据此拼 127.0.0.1:{port}）
//! 3. 退出联动：窗口关闭/进程退出时 kill 后端子进程（后端死亡不阻塞应用，前端已有
//!    "无法连接存储服务"降级提示）

use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::{Manager, RunEvent};

/// 后端进程句柄 + 实际端口（spawn 时确定；前端经 backend_info 读取）
struct BackendState(Mutex<Option<(Child, u16)>>);

/// 探测空闲端口：3001 起取第一个可绑定（释放后由后端接管，竞争概率极低可接受）
fn probe_port() -> u16 {
    (3001..=3010)
        .find(|port| TcpListener::bind(("127.0.0.1", *port)).is_ok())
        .unwrap_or(3001)
}

/// 拉起后端进程。日志走 P4 滚动文件（stdout/stderr 丢弃；console=False 的 exe 本无输出）
fn spawn_backend(app: &tauri::App, port: u16) -> std::io::Result<Child> {
    #[cfg(debug_assertions)]
    {
        // 开发态：backend/.venv/Scripts/python 跑 packaging/run_server.py
        let _ = app; // debug 态不需要 app（仅 release 用 resource_dir）
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
        let mut cmd = Command::new(root.join("backend/.venv/Scripts/python.exe"));
        cmd.arg(root.join("backend/packaging/run_server.py"))
            .arg("--port")
            .arg(port.to_string())
            .current_dir(root.join("backend"))
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        cmd.spawn()
    }
    #[cfg(not(debug_assertions))]
    {
        // 发布态：bundle resources 里的 onedir 产物（resources/backend-server/backend-server.exe）
        let exe = app
            .path()
            .resource_dir()?
            .join("backend-server/backend-server.exe");
        let mut cmd = Command::new(exe);
        cmd.arg("--port")
            .arg(port.to_string())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        cmd.spawn()
    }
}

/// 前端读取后端端口（api.ts 的 apiBase：Tauri 态 invoke('backend_info')）
#[tauri::command]
fn backend_info(state: tauri::State<BackendState>) -> Result<serde_json::Value, String> {
    let guard = state.0.lock().map_err(|_| "backend state poisoned".to_string())?;
    let port = guard.as_ref().map(|(_, p)| *p).unwrap_or(3001);
    Ok(serde_json::json!({ "port": port }))
}

/// 结束后端进程（退出联动：kill + 回收，防残留）
fn kill_backend(state: &BackendState) {
    if let Ok(mut guard) = state.0.lock() {
        if let Some((mut child, _)) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(BackendState(Mutex::new(None)))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // 探测端口 → 拉起后端 → 记录句柄与端口
            let port = probe_port();
            match spawn_backend(app, port) {
                Ok(child) => {
                    *app.state::<BackendState>().0.lock().unwrap() = Some((child, port));
                }
                Err(e) => {
                    eprintln!("后端进程启动失败（前端将显示无法连接存储服务）: {e}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![backend_info])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // 退出联动：窗口关闭（ExitRequested）或进程退出（Exit）时杀后端
            if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                let state = app.state::<BackendState>();
                kill_backend(&state);
            }
        });
}
