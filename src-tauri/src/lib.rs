#[tauri::command]
fn get_qr_secret() -> Result<String, String> {
    option_env!("FITSTOP_QR_SECRET")
        .filter(|secret| !secret.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| "QR_SECRET is not configured".to_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![get_qr_secret])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
