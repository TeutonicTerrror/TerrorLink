use std::fs;
use std::io::Write;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextMacro {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub text: String,
}

impl Default for TextMacro {
    fn default() -> Self {
        Self {
            key: String::new(),
            text: String::new(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Config {
    pub username: String,
    pub invite: String,
    pub toggle_key: String,
    pub focus_key: String,
    pub host_panel_key: String,
    pub settings_key: String,
    pub copy_invite_key: String,
    pub host_toggle_key: String,
    pub macros: Vec<TextMacro>,
    pub start_hidden: bool,
    pub always_on_top: bool,
    pub true_overlay: bool,
    pub macros_unfocused: bool,
    pub focus_when_hidden: bool,
    pub opacity: f32,
    pub image_expand: bool,
    pub port: u16,
    pub allow_embeds: bool,
    pub allow_attachments: bool,
    pub chat_filter: bool,
    pub window_width: f32,
    pub window_height: f32,
    pub layout_version: u32,
    pub chat_opacity: f32,
    pub bubble_opacity: f32,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            username: String::new(),
            invite: "ws://127.0.0.1:8080".into(),
            toggle_key: "]".into(),
            focus_key: "/".into(),
            host_panel_key: "Control+H".into(),
            settings_key: "Control+Shift+S".into(),
            copy_invite_key: "Control+I".into(),
            host_toggle_key: "Control+Shift+H".into(),
            macros: Vec::new(),
            start_hidden: false,
            always_on_top: true,
            true_overlay: false,
            macros_unfocused: false,
            focus_when_hidden: false,
            opacity: 1.0,
            image_expand: true,
            port: 8080,
            allow_embeds: true,
            allow_attachments: true,
            chat_filter: false,
            window_width: 500.0,
            window_height: 340.0,
            layout_version: 0,
            chat_opacity: 0.55,
            bubble_opacity: 1.0,
        }
    }
}

pub fn app_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("TerrorLink")
}

pub fn config_path() -> PathBuf {
    app_dir().join("config.json")
}

pub fn cloudflared_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("TerrorLink")
        .join("cloudflared")
}

pub fn log_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("TerrorLink Logs")
        .join("client.log")
}

pub fn append_log(line: &str) {
    let path = log_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let stamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
        let _ = writeln!(file, "[{stamp}] {line}");
    }
}

impl Config {
    pub fn load() -> Self {
        let path = config_path();
        let mut config = match fs::read_to_string(&path) {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or_else(|error| {
                append_log(&format!("config parse failed: {error}"));
                Config::default()
            }),
            Err(_) => Config::default(),
        };
        if config.layout_version < 2 {
            config.window_width = 500.0;
            config.window_height = 340.0;
            config.layout_version = 2;
        }
        config
    }

    pub fn save(&self) {
        let dir = app_dir();
        let _ = fs::create_dir_all(&dir);
        let path = config_path();
        let tmp = path.with_extension("json.tmp");
        if let Ok(raw) = serde_json::to_string_pretty(self) {
            if fs::write(&tmp, raw).is_ok() {
                let _ = fs::rename(&tmp, &path);
            }
        }
    }
}
