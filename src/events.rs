use crate::protocol::ServerEvent;

#[derive(Clone, Debug, PartialEq)]
pub enum ConnStatus {
    Offline,
    Connecting,
    Connected,
    Reconnecting(u32),
    Failed(String),
}

impl ConnStatus {
    pub fn label(&self) -> String {
        match self {
            ConnStatus::Offline => "Offline".into(),
            ConnStatus::Connecting => "Connecting…".into(),
            ConnStatus::Connected => "Connected".into(),
            ConnStatus::Reconnecting(attempt) => format!("Reconnecting ({attempt}/5)…"),
            ConnStatus::Failed(_) => "Connection failed".into(),
        }
    }

    pub fn connected(&self) -> bool {
        matches!(self, ConnStatus::Connected)
    }
}

#[derive(Debug)]
pub enum ClientEvent {
    Status(ConnStatus),
    Server(ServerEvent),
    Local(String),
}

#[derive(Debug)]
pub enum HostEvent {
    Status(String),
    Log(String),
    Users(Vec<String>),
    Invite(String),
    Cloudflared { version: String, path: String },
    Download { fraction: f32, label: String },
    Error(String),
    Stopped(String),
}
