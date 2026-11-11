use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::sync::mpsc::{self, UnboundedReceiver, UnboundedSender};
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use url::Url;

use crate::events::{ClientEvent, ConnStatus};
use crate::protocol::{now_ms, ClientCommand, ServerEvent, VERSION_MISMATCH};

const MAX_ATTEMPTS: u32 = 5;

type Target = (String, String);

pub fn spawn(
    runtime: &tokio::runtime::Runtime,
    ui: UnboundedSender<ClientEvent>,
) -> UnboundedSender<ClientCommand> {
    let (commands, mut receiver) = mpsc::unbounded_channel();
    runtime.spawn(async move {
        let mut next: Option<Target> = None;
        loop {
            let (url, username) = match next.take() {
                Some(target) => target,
                None => match receiver.recv().await {
                    Some(ClientCommand::Connect { url, username }) => (url, username),
                    Some(_) => continue,
                    None => return,
                },
            };
            next = run(url, username, &mut receiver, &ui).await;
        }
    });
    commands
}

pub fn build_url(invite: &str, username: &str) -> Result<String, String> {
    let mut url = base_url(invite)?;
    if url.path().is_empty() || url.path() == "/" {
        url.set_path("/ws");
    }
    url.query_pairs_mut()
        .append_pair("username", username)
        .append_pair("version", env!("CARGO_PKG_VERSION"));
    Ok(url.to_string())
}

fn base_url(invite: &str) -> Result<Url, String> {
    let raw = invite.trim();
    if raw.is_empty() {
        return Err("Enter an invite link".into());
    }
    let with_scheme = if raw.starts_with("ws://")
        || raw.starts_with("wss://")
        || raw.starts_with("http://")
        || raw.starts_with("https://")
    {
        raw.to_string()
    } else {
        format!("wss://{raw}")
    };
    let mut url = Url::parse(&with_scheme).map_err(|_| "That invite link isn't valid".to_string())?;
    match url.scheme() {
        "http" => {
            let _ = url.set_scheme("ws");
        }
        "https" => {
            let _ = url.set_scheme("wss");
        }
        "ws" | "wss" => {}
        _ => return Err("Invite links must start with ws://, wss://, http:// or https://".into()),
    }
    if url.host_str().map(str::is_empty).unwrap_or(true) {
        return Err("That invite link has no host".into());
    }
    let local = matches!(
        url.host_str(),
        Some("127.0.0.1") | Some("localhost") | Some("[::1]") | Some("::1")
    );
    if url.port().is_none() && local {
        let _ = url.set_port(Some(8080));
    }
    url.set_fragment(None);
    url.set_query(None);
    Ok(url)
}

fn host_label(url: &Url) -> String {
    match (url.host_str(), url.port()) {
        (Some(host), Some(port)) => format!("{host}:{port}"),
        (Some(host), None) => host.to_string(),
        _ => "the host".into(),
    }
}

async fn preflight(invite: &str) -> Result<(), String> {
    let mut url = base_url(invite)?;
    let host = host_label(&url);
    let scheme = if url.scheme() == "wss" { "https" } else { "http" };
    let _ = url.set_scheme(scheme);
    url.set_path("/health");

    let client = reqwest::Client::builder()
        .user_agent(format!("TerrorLink/{}", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|error| format!("Could not start the connection check: {error}"))?;
    let response = match client.get(url.as_str()).send().await {
        Ok(response) => response,
        Err(error) if error.is_timeout() => {
            return Err(format!("{host} took too long to answer. The host may be offline."))
        }
        Err(error) if error.is_connect() => {
            return Err(format!(
                "Can't reach {host}. Check the link, or the host may have stopped hosting."
            ))
        }
        Err(_) => return Err(format!("Can't reach {host}. Check the invite link.")),
    };
    let status = response.status();
    if matches!(status.as_u16(), 502 | 503 | 504 | 521 | 522 | 523 | 530) {
        return Err("That invite link has expired or the host is offline.".into());
    }
    if !status.is_success() {
        return Err(format!(
            "{host} isn't a TerrorLink server (HTTP {}).",
            status.as_u16()
        ));
    }
    let body: Value = response
        .json()
        .await
        .map_err(|_| format!("{host} isn't a TerrorLink server."))?;
    let name = body["name"].as_str().unwrap_or_default();
    if !name.contains("TerrorLink") {
        return Err(format!("{host} isn't a TerrorLink server."));
    }
    let version = body["version"].as_str().unwrap_or_default();
    if !version.is_empty() && version != env!("CARGO_PKG_VERSION") {
        return Err(format!(
            "{VERSION_MISMATCH} (host runs {version}, you run {}).",
            env!("CARGO_PKG_VERSION")
        ));
    }
    Ok(())
}

fn fail(ui: &UnboundedSender<ClientEvent>, reason: String) {
    let _ = ui.send(ClientEvent::Status(ConnStatus::Failed(reason)));
}

async fn run(
    invite: String,
    username: String,
    commands: &mut UnboundedReceiver<ClientCommand>,
    ui: &UnboundedSender<ClientEvent>,
) -> Option<Target> {
    let url = match build_url(&invite, &username) {
        Ok(url) => url,
        Err(error) => {
            fail(ui, error);
            return None;
        }
    };
    let _ = ui.send(ClientEvent::Status(ConnStatus::Connecting));

    let check = preflight(&invite);
    tokio::pin!(check);
    loop {
        tokio::select! {
            result = &mut check => {
                if let Err(reason) = result {
                    fail(ui, reason);
                    return None;
                }
                break;
            }
            command = commands.recv() => match command {
                Some(ClientCommand::Disconnect) | None => {
                    let _ = ui.send(ClientEvent::Status(ConnStatus::Offline));
                    return None;
                }
                Some(ClientCommand::Connect { url, username }) => return Some((url, username)),
                Some(_) => {}
            }
        }
    }

    let mut attempt = 0u32;
    let mut connected_once = false;
    loop {
        if attempt > 0 {
            let _ = ui.send(ClientEvent::Status(ConnStatus::Reconnecting(attempt)));
        }
        let socket_config = WebSocketConfig {
            max_message_size: Some(32 * 1024 * 1024),
            max_frame_size: Some(32 * 1024 * 1024),
            ..Default::default()
        };
        let connect = tokio::time::timeout(
            Duration::from_secs(12),
            tokio_tungstenite::connect_async_with_config(url.as_str(), Some(socket_config), false),
        )
        .await;

        match connect {
            Ok(Ok((socket, _response))) => {
                attempt = 0;
                connected_once = true;
                let _ = ui.send(ClientEvent::Status(ConnStatus::Connected));
                match session(socket, commands, ui).await {
                    SessionEnd::Intentional => {
                        let _ = ui.send(ClientEvent::Status(ConnStatus::Offline));
                        return None;
                    }
                    SessionEnd::Switch(target) => return Some(target),
                    SessionEnd::Rejected(reason) => {
                        fail(ui, reason);
                        return None;
                    }
                    SessionEnd::Lost => {
                        let _ = ui.send(ClientEvent::Local("Connection lost. Reconnecting…".into()));
                    }
                }
            }
            Ok(Err(error)) if !connected_once => {
                fail(ui, format!("Couldn't open the chat connection: {error}"));
                return None;
            }
            Err(_) if !connected_once => {
                fail(ui, "The chat connection timed out.".into());
                return None;
            }
            _ => {}
        }

        attempt += 1;
        if attempt > MAX_ATTEMPTS {
            let _ = ui.send(ClientEvent::Local(format!(
                "Failed to reconnect after {MAX_ATTEMPTS} attempts. Press Connect to try again."
            )));
            fail(ui, "Lost connection to the host.".into());
            return None;
        }

        let _ = ui.send(ClientEvent::Status(ConnStatus::Reconnecting(attempt)));
        let delay = Duration::from_millis((1000u64 << (attempt - 1).min(4)).min(30_000));
        let timer = tokio::time::sleep(delay);
        tokio::pin!(timer);
        loop {
            tokio::select! {
                _ = &mut timer => break,
                command = commands.recv() => match command {
                    Some(ClientCommand::Disconnect) | None => {
                        let _ = ui.send(ClientEvent::Status(ConnStatus::Offline));
                        return None;
                    }
                    Some(ClientCommand::Connect { url, username }) => return Some((url, username)),
                    Some(_) => {}
                }
            }
        }
    }
}

fn expand_shortcodes(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find(':') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        let emoji = after
            .find(':')
            .map(|end| &after[..end])
            .filter(|code| !code.is_empty() && !code.contains(char::is_whitespace))
            .and_then(|code| emojis::get_by_shortcode(code).map(|e| (code.len(), e)));
        match emoji {
            Some((len, e)) => {
                out.push_str(e.as_str());
                rest = &after[len + 1..];
            }
            None => {
                out.push(':');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    #[test]
    fn expands_known_shortcodes_only() {
        assert_eq!(super::expand_shortcodes("hi :smile:!"), "hi 😄!");
        assert_eq!(super::expand_shortcodes("at 12:30:thumbsup:"), "at 12:30👍");
        assert_eq!(super::expand_shortcodes(":nope: https://x.y"), ":nope: https://x.y");
    }
}

enum SessionEnd {
    Intentional,
    Lost,
    Switch(Target),
    Rejected(String),
}

type Socket = tokio_tungstenite::WebSocketStream<
    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
>;

async fn session(
    mut socket: Socket,
    commands: &mut UnboundedReceiver<ClientCommand>,
    ui: &UnboundedSender<ClientEvent>,
) -> SessionEnd {
    let mut ticker = tokio::time::interval(Duration::from_secs(30));
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    ticker.tick().await;
    let mut joined = false;
    let mut last_error: Option<String> = None;

    loop {
        tokio::select! {
            command = commands.recv() => {
                let Some(command) = command else {
                    let _ = socket.close(None).await;
                    return SessionEnd::Intentional;
                };
                match command {
                    ClientCommand::Disconnect => {
                        let _ = socket.close(None).await;
                        return SessionEnd::Intentional;
                    }
                    ClientCommand::Connect { url, username } => {
                        let _ = socket.close(None).await;
                        return SessionEnd::Switch((url, username));
                    }
                    ClientCommand::Send {
                        text,
                        attachment,
                        reply_to,
                    } => {
                        let client_id = uuid::Uuid::new_v4().to_string();
                        let mut payload = json!({
                            "type": "message",
                            "text": expand_shortcodes(&text),
                            "clientId": client_id
                        });
                        if let Some(attachment) = attachment {
                            payload["attachment"] = serde_json::to_value(attachment).unwrap_or_else(|_| json!(null));
                        }
                        if let Some(reply_to) = reply_to {
                            payload["replyTo"] = json!(reply_to);
                        }
                        if socket.send(WsMessage::Text(payload.to_string())).await.is_err() {
                            return SessionEnd::Lost;
                        }
                    }
                    ClientCommand::EightBall { question } => {
                        let payload = json!({"type": "8ball", "question": question});
                        if socket.send(WsMessage::Text(payload.to_string())).await.is_err() {
                            return SessionEnd::Lost;
                        }
                    }
                    ClientCommand::Coinflip { message } => {
                        let payload = json!({"type": "coinflip", "message": message});
                        if socket.send(WsMessage::Text(payload.to_string())).await.is_err() {
                            return SessionEnd::Lost;
                        }
                    }
                    ClientCommand::Ping => {
                        let payload = json!({"type": "ping", "ts": now_ms()});
                        if socket.send(WsMessage::Text(payload.to_string())).await.is_err() {
                            return SessionEnd::Lost;
                        }
                    }
                }
            }
            incoming = socket.next() => {
                match incoming {
                    Some(Ok(WsMessage::Text(text))) => {
                        match serde_json::from_str::<ServerEvent>(&text) {
                            Ok(ServerEvent::Kicked { message }) => {
                                let _ = ui.send(ClientEvent::Server(ServerEvent::Kicked { message }));
                                let _ = socket.close(None).await;
                                return SessionEnd::Intentional;
                            }
                            Ok(ServerEvent::Error { message }) if !joined => {
                                last_error = Some(message);
                            }
                            Ok(event) => {
                                if matches!(event, ServerEvent::History { .. }) {
                                    joined = true;
                                }
                                let _ = ui.send(ClientEvent::Server(event));
                            }
                            Err(_) => {}
                        }
                    }
                    Some(Ok(WsMessage::Ping(payload))) => {
                        let _ = socket.send(WsMessage::Pong(payload)).await;
                    }
                    Some(Ok(WsMessage::Close(_))) | None | Some(Err(_)) => {
                        if joined {
                            return SessionEnd::Lost;
                        }
                        return SessionEnd::Rejected(last_error.take().unwrap_or_else(|| {
                            "The host closed the connection before you could join.".into()
                        }));
                    }
                    _ => {}
                }
            }
            _ = ticker.tick() => {
                if socket.send(WsMessage::Ping(Vec::new())).await.is_err() {
                    return SessionEnd::Lost;
                }
            }
        }
    }
}
