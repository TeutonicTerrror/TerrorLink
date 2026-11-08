use rand::seq::SliceRandom;
use serde::{Deserialize, Serialize};

pub const MAX_USERNAME_LEN: usize = 15;
pub const MAX_TEXT_LEN: usize = 4000;
pub const MAX_ATTACHMENT_BYTES: usize = 20 * 1024 * 1024;
pub const MAX_HISTORY: usize = 500;
pub const VERSION_MISMATCH: &str = "Terror Link versions not compatible. Try updating your Terror Link";

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    #[serde(default)]
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mime: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub status: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub from: String,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub attachment: Option<Attachment>,
    #[serde(default)]
    pub system: Option<SystemInfo>,
    #[serde(default)]
    pub ts: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HostSettings {
    pub allow_embeds: bool,
    pub allow_attachments: bool,
    pub chat_filter: bool,
}

impl Default for HostSettings {
    fn default() -> Self {
        Self {
            allow_embeds: true,
            allow_attachments: true,
            chat_filter: false,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum ServerEvent {
    ServerVersion {
        #[serde(default)]
        #[allow(dead_code)]
        version: String,
    },
    History {
        #[serde(default)]
        data: Vec<Message>,
    },
    HostSettings {
        #[serde(default)]
        data: HostSettings,
    },
    Message {
        data: Message,
    },
    System {
        data: Message,
    },
    Users {
        #[serde(default)]
        data: Vec<String>,
    },
    Error {
        #[serde(default)]
        message: String,
    },
    Pong {
        #[serde(default)]
        ts: i64,
    },
    Kicked {
        #[serde(default)]
        message: String,
    },
}

#[derive(Clone, Debug)]
pub enum ClientCommand {
    Connect { url: String, username: String },
    Disconnect,
    Send {
        text: String,
        attachment: Option<Attachment>,
    },
    EightBall { question: String },
    Ping,
    Coinflip,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ClientRequest {
    Message {
        #[serde(default)]
        text: String,
        #[serde(default, rename = "clientId")]
        client_id: Option<String>,
        #[serde(default)]
        attachment: Option<Attachment>,
    },
    Attachment {
        attachment: Attachment,
        #[serde(default)]
        caption: String,
        #[serde(default, rename = "clientId")]
        client_id: Option<String>,
    },
    Coinflip,
    #[serde(rename = "8ball")]
    EightBall {
        #[serde(default)]
        question: String,
    },
    Ping {
        #[serde(default)]
        ts: i64,
    },
    List,
}

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn sanitize_username(name: &str) -> String {
    name.trim().chars().take(MAX_USERNAME_LEN).collect()
}

pub fn clamp_text(text: &str) -> String {
    text.chars().take(MAX_TEXT_LEN).collect()
}

const EIGHT_BALL: [&str; 20] = [
    "It is certain.",
    "It is decidedly so.",
    "Without a doubt.",
    "Yes -- definitely.",
    "You may rely on it.",
    "As I see it, yes.",
    "Most likely.",
    "Outlook good.",
    "Yes.",
    "Signs point to yes.",
    "Reply hazy, try again.",
    "Ask again later.",
    "Better not tell you now.",
    "Cannot predict now.",
    "Concentrate and ask again.",
    "Don't count on it.",
    "My reply is no.",
    "My sources say no.",
    "Outlook not so good.",
    "Very doubtful.",
];

pub fn answer_eight_ball() -> &'static str {
    EIGHT_BALL
        .choose(&mut rand::thread_rng())
        .copied()
        .unwrap_or("Reply hazy, try again.")
}

pub fn normalize_attachment(raw: &Attachment) -> Option<Attachment> {
    let kind = raw.kind.to_ascii_lowercase();
    if !matches!(kind.as_str(), "image" | "gif" | "file") {
        return None;
    }
    let mut attachment = Attachment {
        kind,
        name: raw.name.as_ref().map(|name| name.chars().take(80).collect()),
        ..Default::default()
    };
    if let Some(url) = raw.url.as_ref().map(|value| value.trim().to_string()) {
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return None;
        }
        attachment.url = Some(url.chars().take(1024).collect());
        return Some(attachment);
    }
    if let Some(data) = raw.data.as_ref().map(|value| value.trim().to_string()) {
        let encoded_limit = MAX_ATTACHMENT_BYTES / 3 * 4 + 4096;
        if !data.starts_with("data:") || data.len() > encoded_limit {
            return None;
        }
        attachment.data = Some(data);
        attachment.mime = raw.mime.as_ref().map(|mime| mime.chars().take(120).collect());
        return Some(attachment);
    }
    None
}
