use std::borrow::Cow;

use gpui::{px, svg, AssetSource, Hsla, SharedString, Styled, Svg};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Icon {
    Close,
    Minimize,
    Settings,
    Broadcast,
    Paperclip,
    Send,
    Copy,
    LogOut,
    Check,
    Download,
    Link,
    Plug,
    Trash,
    Notes,
    Refresh,
    Reply,
}

impl Icon {
    fn path(self) -> &'static str {
        match self {
            Icon::Close => "icons/close.svg",
            Icon::Minimize => "icons/minimize.svg",
            Icon::Settings => "icons/settings.svg",
            Icon::Broadcast => "icons/broadcast.svg",
            Icon::Paperclip => "icons/paperclip.svg",
            Icon::Send => "icons/send.svg",
            Icon::Copy => "icons/copy.svg",
            Icon::LogOut => "icons/logout.svg",
            Icon::Check => "icons/check.svg",
            Icon::Download => "icons/download.svg",
            Icon::Link => "icons/link.svg",
            Icon::Plug => "icons/plug.svg",
            Icon::Trash => "icons/trash.svg",
            Icon::Notes => "icons/notes.svg",
            Icon::Refresh => "icons/refresh.svg",
            Icon::Reply => "icons/reply.svg",
        }
    }
}

pub fn icon(icon: Icon, size: f32, color: Hsla) -> Svg {
    svg()
        .path(SharedString::new_static(icon.path()))
        .size(px(size))
        .flex_none()
        .text_color(color)
}

const OPEN: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">"#;

fn source(path: &str) -> Option<String> {
    let body = match path {
        "icons/close.svg" => r#"<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>"#,
        "icons/minimize.svg" => r#"<path d="M6 12.5h12"/>"#,
        "icons/settings.svg" => {
            r#"<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>"#
        }
        "icons/broadcast.svg" => {
            r#"<circle cx="12" cy="12" r="1.6" fill="black"/><path d="M8.6 8.6a4.8 4.8 0 0 0 0 6.8M15.4 8.6a4.8 4.8 0 0 1 0 6.8M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>"#
        }
        "icons/paperclip.svg" => {
            r#"<path d="M20.4 11.6l-8.3 8.3a5.4 5.4 0 0 1-7.7-7.7l8.3-8.3a3.6 3.6 0 0 1 5.1 5.1l-8.3 8.3a1.8 1.8 0 0 1-2.6-2.6l7.7-7.6"/>"#
        }
        "icons/send.svg" => {
            r#"<path d="M4.5 12h13M12.5 6l6 6-6 6"/>"#
        }
        "icons/copy.svg" => {
            r#"<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/>"#
        }
        "icons/users.svg" => {
            r#"<circle cx="9" cy="8.5" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5a3.5 3.5 0 0 1 0 7M21 20a6 6 0 0 0-3.5-5.4"/>"#
        }
        "icons/logout.svg" => {
            r#"<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16.5L5.5 12 10 7.5M5.5 12H15"/>"#
        }
        "icons/check.svg" => r#"<path d="M5 12.5l4.5 4.5L19 7.5"/>"#,
        "icons/download.svg" => {
            r#"<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>"#
        }
        "icons/link.svg" => {
            r#"<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>"#
        }
        "icons/plug.svg" => {
            r#"<path d="M9 3v5M15 3v5M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0zM12 17v4"/>"#
        }
        "icons/notes.svg" => {
            r#"<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M9 8h6M9 12h6M9 16h4"/>"#
        }
        "icons/trash.svg" => {
            r#"<path d="M4.5 7h15M9.5 7V5h5v2M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12"/>"#
        }
        "icons/refresh.svg" => {
            r#"<path d="M20 11.5A8 8 0 0 0 6 6.5L4 8.5M4 4v4.5h4.5M4 12.5a8 8 0 0 0 14 5l2-2M20 20v-4.5h-4.5"/>"#
        }
        "icons/reply.svg" => {
            r#"<path d="M10 6L4.5 11.5 10 17M4.5 11.5H14a6 6 0 0 1 6 6V19"/>"#
        }
        "icons/keyboard.svg" => {
            r#"<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M7 10h.01M11 10h.01M15 10h.01M17 14H7"/>"#
        }
        _ => return None,
    };
    Some(format!("{OPEN}{body}</svg>"))
}

pub struct Assets;

impl AssetSource for Assets {
    fn load(&self, path: &str) -> anyhow::Result<Option<Cow<'static, [u8]>>> {
        Ok(source(path).map(|svg| Cow::Owned(svg.into_bytes())))
    }

    fn list(&self, _path: &str) -> anyhow::Result<Vec<SharedString>> {
        Ok(Vec::new())
    }
}
