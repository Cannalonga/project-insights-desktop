#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::get_license_admin_config,
            commands::generate_license,
            commands::validate_license,
            commands::save_license_record,
            commands::load_license_catalog
        ])
        .run(tauri::generate_context!())
        .expect("error while running license-admin-ui");
}
