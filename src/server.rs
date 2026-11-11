use std::collections::{HashMap, VecDeque};
use std::sync::Arc;

use axum::extract::ws::{Message as WsMessage, WebSocket, WebSocketUpgrade};
use axum::extract::{Json, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use parking_lot::Mutex;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, mpsc, oneshot};

use crate::events::HostEvent;
use crate::protocol::*;

#[derive(Clone)]
pub struct ServerHandle {
    inner: Arc<Mutex<Inner>>,
    bus: broadcast::Sender<Arc<str>>,
    shutdown: Arc<Mutex<Option<oneshot::Sender<()>>>>,
    ui: mpsc::UnboundedSender<HostEvent>,
}

struct Inner {
    history: VecDeque<Message>,
    clients: HashMap<String, Client>,
    settings: HostSettings,
}

struct Client {
    tx: mpsc::UnboundedSender<Direct>,
}

enum Direct {
    Text(String),
    Close,
}

impl Inner {
    fn new(settings: HostSettings) -> Self {
        Self {
            history: VecDeque::new(),
            clients: HashMap::new(),
            settings,
        }
    }

    fn find_client(&self, name: &str) -> Option<String> {
        self.clients
            .keys()
            .find(|existing| existing.eq_ignore_ascii_case(name))
            .cloned()
    }

    fn users(&self) -> Vec<String> {
        let mut names: Vec<String> = self.clients.keys().cloned().collect();
        names.sort_by_key(|name| name.to_ascii_lowercase());
        names
    }
}

const PROFANITY: [&str; 32] = [
    "asshole", "bastard", "bitch", "bollocks", "bullshit", "cunt", "dickhead", "douchebag",
    "faggot", "fuck", "goddamn", "jackass", "motherfucker", "nigga", "nigger", "piss", "prick",
    "pussy", "retard", "shit", "slut", "twat", "wanker", "whore", "cocksucker", "dipshit",
    "dumbass", "fucker", "fucking", "shithead", "shitty", "sonofabitch",
];

pub fn start(
    runtime: &tokio::runtime::Runtime,
    port: u16,
    settings: HostSettings,
    ui: mpsc::UnboundedSender<HostEvent>,
) -> ServerHandle {
    let inner = Arc::new(Mutex::new(Inner::new(settings)));
    let (bus, _) = broadcast::channel(1024);
    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let handle = ServerHandle {
        inner: inner.clone(),
        bus: bus.clone(),
        shutdown: Arc::new(Mutex::new(Some(shutdown_tx))),
        ui: ui.clone(),
    };
    let state = AppState {
        inner,
        bus,
        ui: ui.clone(),
    };
    runtime.spawn(async move {
        let listener = match TcpListener::bind(("127.0.0.1", port)).await {
            Ok(listener) => listener,
            Err(error) => {
                let reason = if error.kind() == std::io::ErrorKind::AddrInUse {
                    format!(
                        "Port {port} is already in use, possibly by another TerrorLink.                          Close it or pick another port in Settings."
                    )
                } else {
                    format!("Could not open port {port}: {error}")
                };
                let _ = ui.send(HostEvent::Stopped(reason));
                return;
            }
        };
        let _ = ui.send(HostEvent::Status(format!(
            "Server listening on 127.0.0.1:{port}"
        )));
        let router = Router::new()
            .route("/health", get(health))
            .route("/api/message", post(api_message))
            .route("/ws", get(ws_handler))
            .route("/", get(ws_handler))
            .with_state(state);
        let server = axum::serve(listener, router).with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
        });
        if let Err(error) = server.await {
            let _ = ui.send(HostEvent::Stopped(format!("The chat server stopped: {error}")));
            return;
        }
        let _ = ui.send(HostEvent::Status("Server stopped".into()));
    });
    handle
}

impl ServerHandle {
    pub fn set_settings(&self, settings: HostSettings) {
        let mut changes = Vec::new();
        {
            let mut inner = self.inner.lock();
            if inner.settings.allow_embeds != settings.allow_embeds {
                changes.push(format!(
                    "Embeds {}",
                    if settings.allow_embeds {
                        "enabled"
                    } else {
                        "disabled"
                    }
                ));
            }
            if inner.settings.allow_attachments != settings.allow_attachments {
                changes.push(format!(
                    "Attachments {}",
                    if settings.allow_attachments {
                        "enabled"
                    } else {
                        "disabled"
                    }
                ));
            }
            if inner.settings.chat_filter != settings.chat_filter {
                changes.push(format!(
                    "Chat filter {}",
                    if settings.chat_filter {
                        "enabled"
                    } else {
                        "disabled"
                    }
                ));
            }
            inner.settings = settings.clone();
        }
        bcast(&self.bus, json!({"type": "host-settings", "data": settings}));
        if !changes.is_empty() {
            self.push_system(&format!("Host: {}", changes.join(", ")));
        }
    }

    pub fn send_system(&self, text: &str) {
        let text = clamp_text(text);
        if text.trim().is_empty() {
            return;
        }
        self.push_system(&format!("Host: {text}"));
    }

    pub fn kick(&self, username: &str) {
        let removed = {
            let mut inner = self.inner.lock();
            let Some(name) = inner.find_client(username) else {
                return;
            };
            let client = inner.clients.remove(&name);
            if let Some(client) = client {
                let _ = client.tx.send(Direct::Text(
                    json!({"type": "kicked", "message": "You have been kicked by the host."})
                        .to_string(),
                ));
                let _ = client.tx.send(Direct::Close);
            }
            name
        };
        let users = self.inner.lock().users();
        bcast(&self.bus, json!({"type": "users", "data": users.clone()}));
        self.push_system(&format!("{removed} disconnected"));
        let _ = self.ui.send(HostEvent::Users(users));
    }

    pub fn shutdown(&self) {
        if let Some(sender) = self.shutdown.lock().take() {
            let _ = sender.send(());
        }
        let clients: Vec<Client> = {
            let mut inner = self.inner.lock();
            inner.clients.drain().map(|(_, client)| client).collect()
        };
        for client in clients {
            let _ = client.tx.send(Direct::Close);
        }
    }

    fn push_system(&self, text: &str) {
        let entry = Message {
            id: uuid::Uuid::new_v4().to_string(),
            kind: "system".into(),
            from: "system".into(),
            text: text.to_string(),
            ts: now_ms(),
            ..Default::default()
        };
        let mut inner = self.inner.lock();
        push_entry(&mut inner, &self.bus, entry);
    }
}

#[derive(Clone)]
struct AppState {
    inner: Arc<Mutex<Inner>>,
    bus: broadcast::Sender<Arc<str>>,
    ui: mpsc::UnboundedSender<HostEvent>,
}

#[derive(Deserialize)]
struct WsQuery {
    #[serde(default)]
    username: String,
    #[serde(default)]
    version: String,
}

async fn health() -> impl IntoResponse {
    Json(json!({
        "ok": true,
        "name": "TerrorLink Chat Server",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

async fn api_message(State(state): State<AppState>, Json(body): Json<Value>) -> Response {
    let text = clamp_text(body["text"].as_str().unwrap_or(""));
    if text.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "text required"})),
        )
            .into_response();
    }
    let from = sanitize_username(body["from"].as_str().unwrap_or("http"));
    let entry = Message {
        id: uuid::Uuid::new_v4().to_string(),
        kind: "text".into(),
        from: if from.is_empty() { "http".into() } else { from },
        text,
        ts: now_ms(),
        ..Default::default()
    };
    {
        let mut inner = state.inner.lock();
        push_entry(&mut inner, &state.bus, entry.clone());
    }
    Json(json!({"ok": true, "message": entry})).into_response()
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(query): Query<WsQuery>,
) -> Response {
    ws.max_message_size(32 * 1024 * 1024)
        .max_frame_size(32 * 1024 * 1024)
        .on_upgrade(move |socket| handle_socket(socket, query, state))
        .into_response()
}

async fn handle_socket(socket: WebSocket, query: WsQuery, state: AppState) {
    let (mut sink, mut stream) = socket.split();
    let requested = query.username;
    let username = sanitize_username(&requested);
    let version = query.version.trim().to_string();

    if username.is_empty() {
        send_value(
            &mut sink,
            json!({"type": "error", "message": "Missing username query parameter"}),
        )
        .await;
        let _ = sink.close().await;
        return;
    }
    if requested.trim().chars().count() > MAX_USERNAME_LEN {
        send_value(
            &mut sink,
            json!({"type": "error", "message": format!("Username must be {MAX_USERNAME_LEN} characters or fewer.")}),
        )
        .await;
        let _ = sink.close().await;
        return;
    }
    if version != env!("CARGO_PKG_VERSION") {
        send_value(&mut sink, json!({"type": "error", "message": VERSION_MISMATCH})).await;
        let _ = sink.close().await;
        return;
    }

    let (direct_tx, mut direct_rx) = mpsc::unbounded_channel();
    let already_online = state.inner.lock().find_client(&username).is_some();
    if already_online {
        send_value(
            &mut sink,
            json!({"type": "error", "message": "Same user already exists within this server."}),
        )
        .await;
        let _ = sink.close().await;
        return;
    }
    state
        .inner
        .lock()
        .clients
        .insert(username.clone(), Client { tx: direct_tx.clone() });

    let mut bus_rx = state.bus.subscribe();

    send_value(
        &mut sink,
        json!({"type": "server-version", "version": env!("CARGO_PKG_VERSION")}),
    )
    .await;

    let (history, settings) = {
        let inner = state.inner.lock();
        (inner.history.iter().cloned().collect::<Vec<_>>(), inner.settings.clone())
    };
    send_value(&mut sink, json!({"type": "history", "data": history})).await;
    send_value(&mut sink, json!({"type": "host-settings", "data": settings})).await;

    let users = {
        let mut inner = state.inner.lock();
        let entry = Message {
            id: uuid::Uuid::new_v4().to_string(),
            kind: "system".into(),
            from: "system".into(),
            text: format!("{username} connected"),
            system: Some(SystemInfo {
                user: username.clone(),
                status: "online".into(),
            }),
            ts: now_ms(),
            ..Default::default()
        };
        push_entry(&mut inner, &state.bus, entry);
        inner.users()
    };
    bcast(&state.bus, json!({"type": "users", "data": users.clone()}));
    let _ = state.ui.send(HostEvent::Users(users));

    let mut rate_started = std::time::Instant::now();
    let mut rate_count = 0u32;

    loop {
        tokio::select! {
            direct = direct_rx.recv() => {
                match direct {
                    Some(Direct::Text(text)) => {
                        if sink.send(WsMessage::Text(text)).await.is_err() {
                            break;
                        }
                    }
                    Some(Direct::Close) | None => {
                        let _ = sink.close().await;
                        break;
                    }
                }
            }
            broadcast = bus_rx.recv() => {
                match broadcast {
                    Ok(text) => {
                        if sink.send(WsMessage::Text(text.to_string())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
            incoming = stream.next() => {
                match incoming {
                    Some(Ok(WsMessage::Text(text))) => {
                        if text.len() > 32 * 1024 * 1024 {
                            send_value(&mut sink, json!({"type": "error", "message": "Message too large."})).await;
                            break;
                        }
                        if rate_started.elapsed() > std::time::Duration::from_secs(10) {
                            rate_started = std::time::Instant::now();
                            rate_count = 0;
                        }
                        rate_count += 1;
                        if rate_count > 120 {
                            send_value(&mut sink, json!({"type": "error", "message": "Too many messages too quickly."})).await;
                            continue;
                        }
                        handle_request(&state, &username, &text, &direct_tx).await;
                    }
                    Some(Ok(WsMessage::Ping(payload))) => {
                        let _ = sink.send(WsMessage::Pong(payload)).await;
                    }
                    Some(Ok(WsMessage::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
        }
    }

    let removed = {
        let mut inner = state.inner.lock();
        match inner.clients.get(&username) {
            Some(client) if client.tx.same_channel(&direct_tx) => {
                inner.clients.remove(&username);
                true
            }
            _ => false,
        }
    };

    if removed {
        let entry = Message {
            id: uuid::Uuid::new_v4().to_string(),
            kind: "system".into(),
            from: "system".into(),
            text: format!("{username} disconnected"),
            system: Some(SystemInfo {
                user: username.clone(),
                status: "offline".into(),
            }),
            ts: now_ms(),
            ..Default::default()
        };
        let users = {
            let mut inner = state.inner.lock();
            push_entry(&mut inner, &state.bus, entry);
            inner.users()
        };
        bcast(&state.bus, json!({"type": "users", "data": users.clone()}));
        let _ = state.ui.send(HostEvent::Users(users));
    }
}

async fn send_value<S>(sink: &mut S, value: Value) -> bool
where
    S: SinkExt<WsMessage> + Unpin,
{
    sink.send(WsMessage::Text(value.to_string())).await.is_ok()
}

async fn handle_request(
    state: &AppState,
    username: &str,
    raw: &str,
    direct: &mpsc::UnboundedSender<Direct>,
) {
    let request: ClientRequest = match serde_json::from_str(raw) {
        Ok(request) => request,
        Err(_) => {
            send_direct(direct, json!({"type": "error", "message": "invalid payload"}));
            return;
        }
    };

    match request {
        ClientRequest::Message {
            text,
            client_id,
            attachment,
            reply_to,
        } => {
            let settings = state.inner.lock().settings.clone();
            let normalized = match attachment {
                Some(raw_attachment) => {
                    if !settings.allow_attachments {
                        send_direct(
                            direct,
                            json!({"type": "error", "message": "Attachments are currently disabled by the host."}),
                        );
                        return;
                    }
                    match normalize_attachment(&raw_attachment) {
                        Some(attachment) => Some(attachment),
                        None => {
                            send_direct(
                                direct,
                                json!({"type": "error", "message": "Invalid attachment payload."}),
                            );
                            return;
                        }
                    }
                }
                None => None,
            };
            let mut body = clamp_text(&text);
            if body.trim().is_empty() && normalized.is_none() {
                return;
            }
            if settings.chat_filter {
                body = filter_text(&body);
            }
            let entry = Message {
                id: client_id
                    .filter(|id| !id.trim().is_empty())
                    .map(|id| id.chars().take(80).collect())
                    .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
                kind: if normalized.is_some() {
                    "attachment".into()
                } else {
                    "text".into()
                },
                from: username.to_string(),
                text: body,
                attachment: normalized,
                ts: now_ms(),
                ..Default::default()
            };
            let mut inner = state.inner.lock();
            let entry = Message {
                reply_to: build_reply(&inner.history, reply_to.as_deref()),
                ..entry
            };
            push_entry(&mut inner, &state.bus, entry);
        }
        ClientRequest::Attachment {
            attachment,
            caption,
            client_id,
        } => {
            let settings = state.inner.lock().settings.clone();
            if !settings.allow_attachments {
                send_direct(
                    direct,
                    json!({"type": "error", "message": "Attachments are currently disabled by the host."}),
                );
                return;
            }
            let Some(attachment) = normalize_attachment(&attachment) else {
                send_direct(
                    direct,
                    json!({"type": "error", "message": "Invalid attachment payload."}),
                );
                return;
            };
            let mut body = clamp_text(&caption);
            if settings.chat_filter {
                body = filter_text(&body);
            }
            let entry = Message {
                id: client_id
                    .filter(|id| !id.trim().is_empty())
                    .map(|id| id.chars().take(80).collect())
                    .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
                kind: "attachment".into(),
                from: username.to_string(),
                text: body,
                attachment: Some(attachment),
                ts: now_ms(),
                ..Default::default()
            };
            let mut inner = state.inner.lock();
            push_entry(&mut inner, &state.bus, entry);
        }
        ClientRequest::EightBall { question } => {
            let question = clamp_text(question.trim()).replace('\n', " ");
            if question.is_empty() {
                send_direct(
                    direct,
                    json!({"type": "error", "message": "Ask a question for the 8-ball."}),
                );
                return;
            }
            let entry = Message {
                id: uuid::Uuid::new_v4().to_string(),
                kind: "result".into(),
                from: "Magic8Ball".into(),
                text: format!("🎱 Magic 8-Ball\n{username} asks: *{question}*\n**{}**", answer_eight_ball()),
                ts: now_ms(),
                ..Default::default()
            };
            let mut inner = state.inner.lock();
            push_entry(&mut inner, &state.bus, entry);
        }
        ClientRequest::Coinflip { message } => {
            let side = if rand::random::<bool>() { "Heads" } else { "Tails" };
            let message = clamp_text(message.trim()).replace('\n', " ");
            let detail = if message.is_empty() {
                format!("{username} flipped a coin")
            } else {
                format!("{username} flips for *{message}*")
            };
            let entry = Message {
                id: uuid::Uuid::new_v4().to_string(),
                kind: "result".into(),
                from: "Coinflip".into(),
                text: format!("🪙 Coin flip\n{detail}\n**{side}**"),
                ts: now_ms(),
                ..Default::default()
            };
            let mut inner = state.inner.lock();
            push_entry(&mut inner, &state.bus, entry);
        }
        ClientRequest::Ping { ts } => {
            send_direct(direct, json!({"type": "pong", "ts": ts}));
        }
        ClientRequest::List => {
            let users = state.inner.lock().users();
            send_direct(direct, json!({"type": "users", "data": users}));
        }
    }
}

fn send_direct(direct: &mpsc::UnboundedSender<Direct>, value: Value) {
    let _ = direct.send(Direct::Text(value.to_string()));
}

fn bcast(bus: &broadcast::Sender<Arc<str>>, value: Value) {
    let payload: Arc<str> = Arc::from(value.to_string());
    let _ = bus.send(payload);
}

fn push_entry(inner: &mut Inner, bus: &broadcast::Sender<Arc<str>>, mut entry: Message) {
    if entry.id.trim().is_empty() {
        entry.id = uuid::Uuid::new_v4().to_string();
    }
    entry.id = entry.id.chars().take(80).collect();
    if entry.ts == 0 {
        entry.ts = now_ms();
    }
    inner.history.push_back(entry.clone());
    while inner.history.len() > MAX_HISTORY {
        inner.history.pop_front();
    }
    let kind = if entry.kind == "system" {
        "system"
    } else {
        "message"
    };
    bcast(bus, json!({"type": kind, "data": entry}));
}

fn filter_text(text: &str) -> String {
    let mut output = text.to_string();
    for word in PROFANITY {
        output = replace_ci(&output, word, "█");
    }
    output
}

fn replace_ci(haystack: &str, needle: &str, replacement: &str) -> String {
    let lower = haystack.to_lowercase();
    if !lower.contains(needle) {
        return haystack.to_string();
    }
    let mut result = String::with_capacity(haystack.len());
    let mut last = 0usize;
    let mut search = 0usize;
    while let Some(found) = lower[search..].find(needle) {
        let start = search + found;
        let end = start + needle.len();
        if !haystack.is_char_boundary(start) || !haystack.is_char_boundary(end) {
            search = start + 1;
            continue;
        }
        result.push_str(&haystack[last..start]);
        result.push_str(replacement);
        last = end;
        search = end;
    }
    result.push_str(&haystack[last..]);
    result
}
