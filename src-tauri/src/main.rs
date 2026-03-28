#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod logger;
mod mpp_conversion;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            logger::append_processing_log,
            mpp_conversion::convert_mpp_to_mspdi
        ])
        .run(tauri::generate_context!())
        .expect("error while running CannaConverter 2.0");
}
