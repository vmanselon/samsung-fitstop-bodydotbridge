mod bdot;

use tauri::Manager;

#[tauri::command]
fn get_qr_secret() -> Result<String, String> {
    std::env::var("QR_SECRET")
        .ok()
        .or_else(|| bdot::COMPILED_QR_SECRET.map(str::to_owned))
        .map(|secret| secret.trim().to_owned())
        .filter(|secret| !secret.is_empty())
        .ok_or_else(|| "QR_SECRET is not configured".to_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            let kiosk_client_id_path = app.path().app_data_dir()?.join("kiosk-client-id.txt");
            app.manage(bdot::BdotState::from_env(kiosk_client_id_path));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_qr_secret,
            bdot::get_latest_measurement,
            bdot::get_bdot_api_enabled,
            bdot::set_bdot_api_enabled,
            bdot::get_kiosk_client_id,
            bdot::set_kiosk_client_id
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
