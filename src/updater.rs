use std::path::PathBuf;
use std::time::Duration;

use sha2::{Digest, Sha256};

const RELEASE_BASE: &str = "https://github.com/TeutonicTerrror/TerrorLink/releases/latest/download";

#[derive(Debug, PartialEq)]
pub struct Manifest {
    pub version: String,
    pub url: String,
    pub sha256: String,
}

pub fn parse_manifest(raw: &str) -> Option<Manifest> {
    let field = |key: &str| {
        raw.lines()
            .find_map(|line| {
                let (name, value) = line.split_once(':')?;
                (name.trim() == key).then(|| value.trim().trim_matches(['"', '\'']).to_string())
            })
            .filter(|value| !value.is_empty())
    };
    Some(Manifest {
        version: field("version")?,
        url: field("url").unwrap_or_else(|| format!("{RELEASE_BASE}/terrorlink.exe")),
        sha256: field("sha256").unwrap_or_default(),
    })
}

pub fn is_newer(candidate: &str, current: &str) -> bool {
    let parse = |version: &str| {
        let mut parts: Vec<u64> = version
            .trim()
            .trim_start_matches('v')
            .split(['.', '-', '+'])
            .take(3)
            .map(|part| part.parse().unwrap_or(0))
            .collect();
        parts.resize(3, 0);
        parts
    };
    parse(candidate) > parse(current)
}

fn exe_sibling(extension: &str) -> Option<PathBuf> {
    std::env::current_exe().ok().map(|exe| exe.with_extension(extension))
}

pub fn remove_leftovers() {
    for extension in ["old", "new"] {
        if let Some(path) = exe_sibling(extension) {
            let _ = std::fs::remove_file(path);
        }
    }
}

pub fn restart() -> bool {
    std::env::current_exe()
        .and_then(|exe| std::process::Command::new(exe).spawn())
        .is_ok()
}

pub async fn check_and_install() -> Result<Option<String>, String> {
    let current = env!("CARGO_PKG_VERSION");
    let client = reqwest::Client::builder()
        .user_agent(format!("TerrorLink/{current}"))
        .build()
        .map_err(|error| error.to_string())?;
    let raw = client
        .get(format!("{RELEASE_BASE}/version.yml"))
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .and_then(|response| response.error_for_status())
        .map_err(|error| format!("could not fetch version.yml: {error}"))?
        .text()
        .await
        .map_err(|error| format!("could not read version.yml: {error}"))?;
    let manifest = parse_manifest(&raw).ok_or("version.yml needs a version")?;
    if !is_newer(&manifest.version, current) {
        return Ok(None);
    }
    let bytes = client
        .get(&manifest.url)
        .timeout(Duration::from_secs(600))
        .send()
        .await
        .and_then(|response| response.error_for_status())
        .map_err(|error| format!("download failed: {error}"))?
        .bytes()
        .await
        .map_err(|error| format!("download failed: {error}"))?;
    if !bytes.starts_with(b"MZ") {
        return Err("the download is not a Windows program".into());
    }
    if !manifest.sha256.is_empty() && !hex::encode(Sha256::digest(&bytes)).eq_ignore_ascii_case(&manifest.sha256) {
        return Err("the download failed its SHA-256 check".into());
    }
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    let staged = exe.with_extension("new");
    let old = exe.with_extension("old");
    tokio::fs::write(&staged, &bytes)
        .await
        .map_err(|error| format!("could not save the update: {error}"))?;
    let _ = std::fs::remove_file(&old);
    std::fs::rename(&exe, &old).map_err(|error| format!("could not replace the program: {error}"))?;
    if let Err(error) = std::fs::rename(&staged, &exe) {
        let _ = std::fs::rename(&old, &exe);
        return Err(format!("could not install the update: {error}"));
    }
    Ok(Some(manifest.version))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_manifest() {
        let raw = "version: \"2.1.0\"\nurl: https://example.com/a.exe\nsha256:\n";
        assert_eq!(
            parse_manifest(raw),
            Some(Manifest {
                version: "2.1.0".into(),
                url: "https://example.com/a.exe".into(),
                sha256: String::new(),
            })
        );
        assert_eq!(parse_manifest("url: x"), None);
        assert_eq!(
            parse_manifest("version: 2.1.0").map(|m| m.url),
            Some(format!("{RELEASE_BASE}/terrorlink.exe"))
        );
    }

    #[test]
    fn compares_versions() {
        assert!(is_newer("2.0.1", "2.0.0"));
        assert!(is_newer("v2.10.0", "2.9.9"));
        assert!(!is_newer("2.0.0", "2.0.0"));
        assert!(!is_newer("1.9", "2.0.0"));
    }
}
