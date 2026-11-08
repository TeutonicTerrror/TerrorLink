use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;

use futures_util::StreamExt;
use serde_json::Value;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc::{self, UnboundedSender};

use crate::config;
use crate::events::HostEvent;

const LATEST_URL: &str = "https://api.github.com/repos/cloudflare/cloudflared/releases/latest";

pub fn start(
    runtime: &tokio::runtime::Runtime,
    port: u16,
    ui: UnboundedSender<HostEvent>,
) -> UnboundedSender<()> {
    let (stop, mut stopped) = mpsc::unbounded_channel();
    runtime.spawn(async move {
        let _ = ui.send(HostEvent::Status(
            "Checking for the latest cloudflared".into(),
        ));
        let binary = match ensure_latest(&ui).await {
            Ok(binary) => binary,
            Err(error) => {
                let _ = ui.send(HostEvent::Stopped(format!("cloudflared is unavailable: {error}")));
                return;
            }
        };

        let _ = ui.send(HostEvent::Status("Starting cloudflared tunnel".into()));
        let mut command = Command::new(&binary);
        command
            .args([
                "tunnel",
                "--url",
                &format!("http://127.0.0.1:{port}"),
                "--no-autoupdate",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(windows)]
        {
            command.creation_flags(0x0800_0000);
        }

        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                let _ = ui.send(HostEvent::Stopped(format!(
                    "Could not start cloudflared: {error}"
                )));
                return;
            }
        };

        let (lines, mut output) = mpsc::unbounded_channel::<String>();
        if let Some(stderr) = child.stderr.take() {
            read_lines(stderr, lines.clone());
        }
        if let Some(stdout) = child.stdout.take() {
            read_lines(stdout, lines.clone());
        }
        drop(lines);

        let mut output_open = true;
        let mut announced = String::new();
        loop {
            tokio::select! {
                _ = stopped.recv() => {
                    let _ = child.kill().await;
                    let _ = ui.send(HostEvent::Log("[host] cloudflared stopped".into()));
                    return;
                }
                line = output.recv(), if output_open => {
                    match line {
                        Some(line) => {
                            let trimmed = line.trim();
                            if trimmed.is_empty() {
                                continue;
                            }
                            if let Some(url) = extract_url(trimmed) {
                                let url = if let Some(rest) = url.strip_prefix("https://") {
                                    format!("wss://{rest}")
                                } else if let Some(rest) = url.strip_prefix("http://") {
                                    format!("ws://{rest}")
                                } else {
                                    url
                                };
                                if announced != url {
                                    announced = url.clone();
                                    let _ = ui.send(HostEvent::Invite(url.clone()));
                                    let _ = ui.send(HostEvent::Status("Tunnel online. Share the invite link below.".into()));
                                    let _ = ui.send(HostEvent::Log(format!("[host] tunnel ready: {url}")));
                                }
                            } else if trimmed.to_ascii_lowercase().contains("error")
                                || trimmed.contains("ERR")
                            {
                                let _ = ui.send(HostEvent::Log(format!("[cloudflared] {trimmed}")));
                            }
                        }
                        None => {
                            output_open = false;
                        }
                    }
                }
                status = child.wait() => {
                    let reason = match status {
                        Ok(status) => format!("The tunnel closed unexpectedly ({status})."),
                        Err(error) => format!("The tunnel failed: {error}"),
                    };
                    let _ = ui.send(HostEvent::Stopped(reason));
                    return;
                }
            }
        }
    });
    stop
}

fn read_lines<R>(reader: R, lines: UnboundedSender<String>)
where
    R: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let mut reader = BufReader::new(reader).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            if !line.trim().is_empty() {
                let _ = lines.send(line);
            }
        }
    });
}

fn extract_url(line: &str) -> Option<String> {
    for token in line.split_whitespace() {
        if (token.starts_with("https://") || token.starts_with("http://"))
            && token.contains(".trycloudflare.com")
        {
            let clean = token
                .trim_matches(|c: char| {
                    !(c.is_ascii_alphanumeric() || matches!(c, ':' | '/' | '.' | '-' | '_'))
                })
                .to_string();
            if !clean.is_empty() {
                return Some(clean);
            }
        }
    }
    None
}

pub fn check_update(runtime: &tokio::runtime::Runtime, ui: UnboundedSender<HostEvent>) {
    runtime.spawn(async move {
        let _ = ui.send(HostEvent::Status(
            "Checking for the latest cloudflared".into(),
        ));
        match ensure_latest(&ui).await {
            Ok(_) => {
                let _ = ui.send(HostEvent::Status("cloudflared is up to date".into()));
            }
            Err(error) => {
                let _ = ui.send(HostEvent::Error(format!("cloudflared update failed: {error}")));
            }
        }
    });
}

async fn ensure_latest(ui: &UnboundedSender<HostEvent>) -> anyhow::Result<PathBuf> {
    let directory = config::cloudflared_dir();
    tokio::fs::create_dir_all(&directory).await?;
    let binary = directory.join("cloudflared.exe");
    let version_file = directory.join("version.txt");
    let cached_version = tokio::fs::read_to_string(&version_file)
        .await
        .ok()
        .map(|value| value.trim().to_string())
        .unwrap_or_default();

    let client = reqwest::Client::builder()
        .user_agent(format!("TerrorLink/{}", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(60))
        .build()?;

    let release = async {
        let response = client
            .get(LATEST_URL)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await?
            .error_for_status()?;
        let value: Value = response.json().await?;
        Ok::<Value, reqwest::Error>(value)
    }
    .await;

    let release = match release {
        Ok(value) => value,
        Err(_) => Value::Null,
    };

    if release.is_null() {
        if binary.exists() {
            let _ = ui.send(HostEvent::Log(
                "[host] cloudflared update check failed, using the cached binary".into(),
            ));
            let _ = ui.send(HostEvent::Cloudflared {
                version: if cached_version.is_empty() {
                    "cached".into()
                } else {
                    cached_version
                },
                path: binary.display().to_string(),
            });
            return Ok(binary);
        }
        anyhow::bail!("could not reach the cloudflared release feed");
    }

    let tag = release["tag_name"].as_str().unwrap_or("").to_string();
    let asset = release["assets"].as_array().and_then(|assets| {
        assets.iter().find(|asset| {
            asset["name"]
                .as_str()
                .map(|name| name.eq_ignore_ascii_case("cloudflared-windows-amd64.exe"))
                .unwrap_or(false)
        })
    });

    let Some(asset) = asset else {
        if binary.exists() {
            return Ok(binary);
        }
        anyhow::bail!("the latest release has no Windows amd64 binary");
    };

    if binary.exists() && !tag.is_empty() && cached_version == tag {
        let _ = ui.send(HostEvent::Cloudflared {
            version: tag,
            path: binary.display().to_string(),
        });
        return Ok(binary);
    }

    let url = asset["browser_download_url"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("release asset has no download URL"))?;
    let digest = asset["digest"]
        .as_str()
        .map(|value| value.trim_start_matches("sha256:").to_ascii_lowercase());

    let label = if tag.is_empty() {
        "Downloading cloudflared".to_string()
    } else {
        format!("Downloading cloudflared {tag}")
    };
    let _ = ui.send(HostEvent::Download {
        fraction: 0.0,
        label: label.clone(),
    });

    let response = client
        .get(url)
        .send()
        .await
        .and_then(|response| response.error_for_status())?;
    let total = response.content_length().unwrap_or(0);
    let temp = directory.join("cloudflared.exe.new");
    let mut file = tokio::fs::File::create(&temp).await?;
    let mut hasher = Sha256::new();
    let mut downloaded = 0u64;
    let mut reported = 0.0f32;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        hasher.update(&chunk);
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;
        if total > 0 {
            let fraction = downloaded as f32 / total as f32;
            if fraction - reported > 0.01 {
                reported = fraction;
                let _ = ui.send(HostEvent::Download {
                    fraction,
                    label: label.clone(),
                });
            }
        }
    }
    file.flush().await?;
    drop(file);

    let actual = hex::encode(hasher.finalize());
    if let Some(expected) = digest {
        if expected != actual {
            let _ = tokio::fs::remove_file(&temp).await;
            anyhow::bail!("downloaded cloudflared failed its SHA-256 check");
        }
    }

    if binary.exists() {
        let _ = tokio::fs::remove_file(&binary).await;
    }
    tokio::fs::rename(&temp, &binary).await?;
    let _ = tokio::fs::write(&version_file, tag.as_bytes()).await;
    let _ = ui.send(HostEvent::Download {
        fraction: 1.0,
        label: format!("cloudflared {tag} ready"),
    });
    let _ = ui.send(HostEvent::Cloudflared {
        version: if tag.is_empty() {
            "latest".into()
        } else {
            tag
        },
        path: binary.display().to_string(),
    });
    Ok(binary)
}
