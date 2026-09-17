fn main() {
    println!("cargo:rerun-if-env-changed=QR_SECRET");
    if let Ok(secret) = std::env::var("QR_SECRET") {
        println!("cargo:rustc-env=FITSTOP_QR_SECRET={secret}");
    }
    tauri_build::build()
}
