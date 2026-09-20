use std::{env, fs, path::PathBuf};

fn dotenv_value(contents: &str, key: &str) -> Option<String> {
    contents.lines().find_map(|line| {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            return None;
        }
        let line = line.strip_prefix("export ").unwrap_or(line);
        let (candidate, raw_value) = line.split_once('=')?;
        if candidate.trim() != key {
            return None;
        }
        let value = raw_value.trim();
        let value = value
            .strip_prefix('"')
            .and_then(|value| value.strip_suffix('"'))
            .or_else(|| {
                value
                    .strip_prefix('\'')
                    .and_then(|value| value.strip_suffix('\''))
            })
            .unwrap_or(value);
        (!value.is_empty()).then(|| value.to_owned())
    })
}

fn native_config_source(key: &str, dotenv: &str) -> String {
    let value = env::var(key)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| dotenv_value(dotenv, key));
    match value {
        Some(value) => format!("Some({value:?})"),
        None => "None".to_owned(),
    }
}

fn main() {
    println!("cargo:rerun-if-env-changed=QR_SECRET");
    println!("cargo:rerun-if-env-changed=BDOT_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=BDOT_CLIENT_SECRET");
    println!("cargo:rerun-if-changed=../.env");

    let dotenv = fs::read_to_string("../.env").unwrap_or_default();
    let qr_secret = env::var("QR_SECRET")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| dotenv_value(&dotenv, "QR_SECRET"));
    let compiled_qr_secret = match qr_secret {
        Some(value) => format!("Some({value:?})"),
        None => "None".to_owned(),
    };
    let native_config = format!(
        "pub const COMPILED_BDOT_CLIENT_ID: Option<&str> = {};\n\
         pub const COMPILED_BDOT_CLIENT_SECRET: Option<&str> = {};\n\
         pub(crate) const COMPILED_QR_SECRET: Option<&str> = {};\n",
        native_config_source("BDOT_CLIENT_ID", &dotenv),
        native_config_source("BDOT_CLIENT_SECRET", &dotenv),
        compiled_qr_secret,
    );
    let out_dir = PathBuf::from(env::var_os("OUT_DIR").expect("Cargo did not provide OUT_DIR"));
    fs::write(out_dir.join("bdot_config.rs"), native_config)
        .expect("failed to write native Bodydot configuration");
    tauri_build::build()
}
