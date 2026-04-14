#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::get_license_admin_config,
            commands::get_licensing_backend_status,
            commands::proxy_licensing_admin_request,
            commands::generate_license,
            commands::validate_license,
            commands::save_license_record,
            commands::load_license_catalog,
            commands::remove_license_catalog_records
        ])
        .run(tauri::generate_context!())
        .expect("error while running license-admin-ui");
}
