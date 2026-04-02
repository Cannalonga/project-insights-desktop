#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod logger;
mod license_public_key;
mod license_storage;
mod mpp_conversion;
mod pdf_export;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            logger::append_processing_log,
            logger::append_operational_log,
            logger::export_processing_log_for_user,
            logger::export_operational_log_for_user,
            license_storage::load_license_content,
            license_storage::save_license_content,
            license_storage::verify_license_signature,
            mpp_conversion::convert_mpp_to_mspdi,
            pdf_export::export_executive_pdf
        ])
        .run(tauri::generate_context!())
        .expect("error while running CannaConverter 2.0");
}
