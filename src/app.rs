use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use base64::Engine;
use gpui::{
    actions, div, img, linear_color_stop, linear_gradient, prelude::*, px, relative, Animation,
    AnimationExt, AnyElement, App, ClickEvent, Context, Entity, ExternalPaths, FocusHandle,
    Focusable, FontWeight, Image, ImageFormat, KeyBinding, PathPromptOptions,
    ScrollHandle, SharedString, Task, Window,
};
use tokio::runtime::Runtime;
use tokio::sync::mpsc::{self, UnboundedReceiver, UnboundedSender};

use crate::client;
use crate::config::{self, Config};
use crate::events::{ClientEvent, ConnStatus, HostEvent};
use crate::platform::{self, KeyEvent, KeyHook, TrayAction};
use crate::protocol::{
    self, Attachment, ClientCommand, HostSettings, Message, ServerEvent, MAX_ATTACHMENT_BYTES,
    MAX_HISTORY, MAX_USERNAME_LEN,
};
use crate::server::{self, ServerHandle};
use crate::theme::{self, glow, name_color, shadow_lg, shadow_md, shadow_sm, theme};
use crate::tunnel;
use crate::ui::icons::{icon, Icon};
use crate::ui::text_input::{Submit, TextInput};
use crate::ui::{
    avatar, button, card, icon_button, key_cap, progress_bar, section_label, small_button,
    status_dot, toggle_row, ButtonKind,
};

actions!(terrorlink, [CloseModal]);

pub fn bind_keys(cx: &mut App) {
    cx.bind_keys([KeyBinding::new("escape", CloseModal, None)]);
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Page {
    Chat,
    Host,
    Settings,
    Notes,
    Changelog,
}

struct CachedImage {
    image: Arc<Image>,
    width: f32,
    height: f32,
}

#[derive(Default)]
struct OverlayState {
    enabled: bool,
    active: bool,
    buffer: String,
    select_all: bool,
    restore_hidden: bool,
}

#[derive(Default)]
struct KeyState {
    ctrl: bool,
    shift: bool,
    alt: bool,
    latched: HashSet<u32>,
}

struct Inputs {
    invite: Entity<TextInput>,
    username: Entity<TextInput>,
    composer: Entity<TextInput>,
    notes: Entity<TextInput>,
    broadcast: Entity<TextInput>,
    port: Entity<TextInput>,
    hotkeys: Vec<Entity<TextInput>>,
    macro_keys: Vec<Entity<TextInput>>,
    macro_texts: Vec<Entity<TextInput>>,
}

const HOTKEY_LABELS: [(&str, &str); 6] = [
    ("Show / hide window", "A bare key is ignored while you type in a text box"),
    ("Focus chat input", "Opens the overlay instead when overlay mode is on"),
    ("Host panel", ""),
    ("Settings", ""),
    ("Copy invite link", ""),
    ("Start / stop hosting", ""),
];

pub struct TerrorLinkApp {
    config: Config,
    runtime: Arc<Runtime>,
    hwnd: isize,
    focus: FocusHandle,
    host_tx: UnboundedSender<HostEvent>,
    client_tx: UnboundedSender<ClientCommand>,
    key_hook: Option<KeyHook>,
    tray: Option<platform::Tray>,
    status: ConnStatus,
    connected_to: String,
    messages: Vec<Message>,
    users: Vec<String>,
    host_settings: HostSettings,
    server: Option<ServerHandle>,
    tunnel_stop: Option<UnboundedSender<()>>,
    hosting: bool,
    invite: String,
    host_status: String,
    host_error: Option<String>,
    logs: Vec<String>,
    host_users: Vec<String>,
    cloudflared: Option<String>,
    download: Option<(f32, String)>,
    page: Page,
    pending_attachment: Option<Attachment>,
    images: HashMap<String, Option<CachedImage>>,
    toast: Option<(SharedString, u64)>,
    toast_seq: u64,
    expanded_image: Option<(Arc<Image>, f32, f32)>,
    changelog: Option<Result<(String, String), String>>,
    settings_note: Option<String>,
    visible: bool,
    key_state: KeyState,
    last_macro: Instant,
    overlay: OverlayState,
    logo: Option<Arc<Image>>,
    scroll: ScrollHandle,
    inputs: Inputs,
    _tasks: Vec<Task<()>>,
}

impl TerrorLinkApp {
    pub fn new(window: &mut Window, cx: &mut Context<Self>, config: Config, runtime: Arc<Runtime>) -> Self {
        let (host_tx, host_rx) = mpsc::unbounded_channel();
        let (client_event_tx, client_rx) = mpsc::unbounded_channel();
        let client_tx = client::spawn(&runtime, client_event_tx);
        let (key_tx, key_rx) = mpsc::unbounded_channel();
        let key_hook = platform::start_key_hook(key_tx);
        let (tray_tx, tray_rx) = mpsc::unbounded_channel();
        let tray = theme::render_logo_rgba(32).and_then(|rgba| platform::create_tray(rgba, 32, tray_tx));

        let mut config = config;
        while config.macros.len() < 5 {
            config.macros.push(Default::default());
        }
        config.macros.truncate(5);

        let hwnd = platform::hwnd_of(window);
        platform::round_corners(hwnd);
        window.set_window_title("TerrorLink");
        if config.always_on_top {
            platform::set_topmost(hwnd, true, true);
        }

        let inputs = {
            let mut text = |placeholder: &str, initial: String, max: usize, binding: bool| {
                let placeholder = placeholder.to_string();
                cx.new(|cx| {
                    let input = TextInput::new(window, cx, placeholder, initial).max_len(max);
                    if binding {
                        input.space_disables()
                    } else {
                        input
                    }
                })
            };
            let invite = text("wss://your-room.trycloudflare.com", config.invite.clone(), 512, false);
            let username = text("username", config.username.clone(), MAX_USERNAME_LEN, false);
            let port = text("8080", config.port.to_string(), 5, false);
            let hotkeys = [
                config.toggle_key.clone(),
                config.focus_key.clone(),
                config.host_panel_key.clone(),
                config.settings_key.clone(),
                config.copy_invite_key.clone(),
                config.host_toggle_key.clone(),
            ]
            .into_iter()
            .map(|value| text("Control+H", value, 40, true))
            .collect();
            let macro_keys = config
                .macros
                .iter()
                .map(|m| text("key", m.key.clone(), 1, true))
                .collect();
            let macro_texts = config
                .macros
                .iter()
                .map(|m| text("Text sent when the key is pressed", m.text.clone(), 500, false))
                .collect();
            let composer = cx.new(|cx| {
                TextInput::new(window, cx, "Message the room…", "")
                    .max_len(protocol::MAX_TEXT_LEN)
                    .bare()
                    .emoji()
                    .multiline()
            });
            let broadcast = cx.new(|cx| {
                TextInput::new(window, cx, "Broadcast a host message…", "")
                    .max_len(protocol::MAX_TEXT_LEN)
                    .emoji()
            });
            let notes = cx.new(|cx| {
                TextInput::new(window, cx, "Write anything…", "").notepad(14)
            });
            Inputs {
                notes,
                invite,
                username,
                composer,
                broadcast,
                port,
                hotkeys,
                macro_keys,
                macro_texts,
            }
        };

        let tasks = vec![
            Self::listen(window, cx, client_rx, Self::on_client_event),
            Self::listen(window, cx, host_rx, Self::on_host_event),
            Self::listen(window, cx, key_rx, Self::on_key_event),
            Self::listen(window, cx, tray_rx, Self::on_tray),
        ];

        let overlay = OverlayState {
            enabled: config.true_overlay,
            ..Default::default()
        };

        cx.observe_window_activation(window, |this, window, _| {
            if !window.is_window_active() {
                window.focus(&this.focus);
            }
        })
        .detach();

        let this = cx.entity().downgrade();
        window.on_window_should_close(cx, move |window, cx| {
            this.update(cx, |app, cx| app.hide(window, cx)).ok();
            false
        });

        let mut app = Self {
            config,
            runtime,
            hwnd,
            focus: cx.focus_handle(),
            host_tx,
            client_tx,
            key_hook,
            tray,
            status: ConnStatus::Offline,
            connected_to: String::new(),
            messages: Vec::new(),
            users: Vec::new(),
            host_settings: HostSettings::default(),
            server: None,
            tunnel_stop: None,
            hosting: false,
            invite: String::new(),
            host_status: "Idle".into(),
            host_error: None,
            logs: Vec::new(),
            host_users: Vec::new(),
            cloudflared: None,
            download: None,
            page: Page::Chat,
            pending_attachment: None,
            images: HashMap::new(),
            toast: None,
            toast_seq: 0,
            expanded_image: None,
            changelog: None,
            settings_note: None,
            visible: true,
            key_state: KeyState::default(),
            last_macro: Instant::now(),
            overlay,
            logo: theme::logo_image(64),
            scroll: ScrollHandle::new(),
            inputs,
            _tasks: tasks,
        };
        if app.key_hook.is_none() {
            app.push_log("[warn] global hotkeys unavailable (keyboard hook failed)");
        }
        if app.tray.is_none() {
            app.push_log("[warn] system tray unavailable");
        }
        if app.config.start_hidden && app.tray.is_some() {
            app.hide(window, cx);
        } else {
            window.focus(&app.inputs.invite.focus_handle(cx));
        }
        app
    }

    fn listen<E: 'static>(
        window: &mut Window,
        cx: &mut Context<Self>,
        mut rx: UnboundedReceiver<E>,
        handler: fn(&mut Self, E, &mut Window, &mut Context<Self>),
    ) -> Task<()> {
        cx.spawn_in(window, async move |this, cx| {
            while let Some(event) = rx.recv().await {
                let updated = this.update_in(cx, |app, window, cx| {
                    handler(app, event, window, cx);
                    cx.notify();
                });
                if updated.is_err() {
                    break;
                }
            }
        })
    }

    fn push_toast(&mut self, text: impl Into<SharedString>, cx: &mut Context<Self>) {
        self.toast_seq += 1;
        let id = self.toast_seq;
        self.toast = Some((text.into(), id));
        cx.notify();
        cx.spawn(async move |this, cx| {
            cx.background_executor().timer(Duration::from_secs(4)).await;
            this.update(cx, |app, cx| {
                if app.toast.as_ref().map(|(_, current)| *current) == Some(id) {
                    app.toast = None;
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }

    fn push_log(&mut self, line: impl Into<String>) {
        let line = line.into();
        config::append_log(&line);
        self.logs.push(line);
        if self.logs.len() > 300 {
            self.logs.remove(0);
        }
    }

    fn push_local(&mut self, text: impl Into<String>) {
        let message = Message {
            id: uuid::Uuid::new_v4().to_string(),
            kind: "system".into(),
            from: "system".into(),
            text: text.into(),
            ts: protocol::now_ms(),
            ..Default::default()
        };
        self.upsert_message(message);
    }

    fn at_bottom(&self) -> bool {
        let offset = self.scroll.offset();
        let max = self.scroll.max_offset();
        -offset.y >= max.height - px(48.)
    }

    fn upsert_message(&mut self, message: Message) {
        let stick = self.at_bottom();
        if let Some(existing) = self
            .messages
            .iter_mut()
            .find(|existing| !message.id.is_empty() && existing.id == message.id)
        {
            *existing = message;
        } else {
            self.messages.push(message);
            while self.messages.len() > MAX_HISTORY {
                let removed = self.messages.remove(0);
                self.images.remove(&removed.id);
            }
        }
        if stick {
            self.scroll.scroll_to_bottom();
        }
    }

    fn copy_text(&mut self, text: &str, cx: &mut Context<Self>) {
        cx.write_to_clipboard(gpui::ClipboardItem::new_string(text.to_string()));
        self.push_toast("Copied to clipboard", cx);
    }

    fn room_label(&self) -> String {
        if self.connected_to.is_empty() {
            return "Not connected".into();
        }
        let with_scheme = if self.connected_to.contains("://") {
            self.connected_to.clone()
        } else {
            format!("wss://{}", self.connected_to)
        };
        url::Url::parse(&with_scheme)
            .ok()
            .and_then(|url| {
                url.host_str().map(|host| match url.port() {
                    Some(port) => format!("{host}:{port}"),
                    None => host.to_string(),
                })
            })
            .unwrap_or_else(|| self.connected_to.clone())
    }

    fn input_text(&self, input: &Entity<TextInput>, cx: &App) -> String {
        input.read(cx).text()
    }

    fn hide(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.remember_size(window);
        self.overlay.active = false;
        self.overlay.buffer.clear();
        platform::set_key_capture(false);
        if self.tray.is_none() {
            window.minimize_window();
            return;
        }
        self.visible = false;
        platform::hide_window(self.hwnd);
        if let Some(tray) = &self.tray {
            tray.set_window_visible(false);
        }
        cx.notify();
    }

    fn show(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.visible = true;
        platform::show_window(self.hwnd, true, self.config.always_on_top);
        if let Some(tray) = &self.tray {
            tray.set_window_visible(true);
        }
        window.activate_window();
        cx.notify();
    }

    fn toggle_window(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.visible && platform::window_visible(self.hwnd) {
            self.hide(window, cx);
        } else {
            self.show(window, cx);
        }
    }

    fn remember_size(&mut self, window: &Window) {
        let size = window.bounds().size;
        let (width, height) = (f32::from(size.width), f32::from(size.height));
        if width > 200.0 && height > 150.0 {
            self.config.window_width = width;
            self.config.window_height = height;
        }
    }

    fn quit(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.remember_size(window);
        self.shutdown();
        cx.quit();
    }

    fn shutdown(&mut self) {
        if let Some(stop) = self.tunnel_stop.take() {
            let _ = stop.send(());
        }
        if let Some(server) = self.server.take() {
            server.shutdown();
        }
        if let Some(hook) = self.key_hook.take() {
            hook.stop();
        }
        platform::set_key_capture(false);
        self.config.save();
    }

    fn set_page(&mut self, page: Page, cx: &mut Context<Self>) {
        if self.page == Page::Settings && page != Page::Settings {
            self.save_settings(cx);
        }
        self.page = page;
        cx.notify();
    }

    fn open_changelog(&mut self, cx: &mut Context<Self>) {
        self.set_page(Page::Changelog, cx);
        if matches!(self.changelog, Some(Ok(_))) {
            return;
        }
        self.changelog = None;
        let request = self.runtime.spawn(fetch_release_notes());
        cx.spawn(async move |this, cx| {
            let result = request.await.unwrap_or_else(|_| Err("Could not load the release notes.".into()));
            this.update(cx, |app, cx| {
                app.changelog = Some(result);
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn open_page(&mut self, page: Page, window: &mut Window, cx: &mut Context<Self>) {
        self.set_page(page, cx);
        if page == Page::Settings {
            self.settings_note = None;
        }
        if !self.visible || !platform::window_visible(self.hwnd) {
            self.show(window, cx);
        }
        cx.notify();
    }

    fn close_modal(&mut self, _: &CloseModal, window: &mut Window, cx: &mut Context<Self>) {
        if self.expanded_image.take().is_some() {
            cx.notify();
        } else if self.overlay.active {
            self.deactivate_overlay(window, cx);
        } else if self.page != Page::Chat {
            self.set_page(Page::Chat, cx);
        }
    }

    fn on_tray(&mut self, action: TrayAction, window: &mut Window, cx: &mut Context<Self>) {
        match action {
            TrayAction::Click => self.show(window, cx),
            TrayAction::Toggle => self.toggle_window(window, cx),
            TrayAction::HostToggle => {
                if self.hosting {
                    self.stop_host(cx);
                } else {
                    self.start_host(cx);
                }
                self.open_page(Page::Host, window, cx);
            }
            TrayAction::Settings => self.open_page(Page::Settings, window, cx),
            TrayAction::Quit => self.quit(window, cx),
        }
    }

    fn on_client_event(&mut self, event: ClientEvent, window: &mut Window, cx: &mut Context<Self>) {
        match event {
            ClientEvent::Status(status) => {
                let was_connected = self.status.connected();
                if status.connected() && !was_connected {
                    window.focus(&self.inputs.composer.focus_handle(cx));
                }
                self.status = status;
            }
            ClientEvent::Local(text) => {
                self.push_local(text);
            }
            ClientEvent::Server(event) => self.apply_server_event(event, cx),
        }
    }

    fn apply_server_event(&mut self, event: ServerEvent, cx: &mut Context<Self>) {
        match event {
            ServerEvent::ServerVersion { .. } => {}
            ServerEvent::History { data } => {
                self.messages = data;
                self.images.clear();
                self.scroll.scroll_to_bottom();
            }
            ServerEvent::HostSettings { data } => self.host_settings = data,
            ServerEvent::Message { data } => {
                if data.from != self.config.username
                    && crate::ui::markdown::mentions(&data.text, &self.config.username)
                {
                    platform::play_mention_sound();
                }
                self.upsert_message(data);
            }
            ServerEvent::System { data } => self.upsert_message(data),
            ServerEvent::Users { data } => self.users = data,
            ServerEvent::Error { message } => self.push_local(message),
            ServerEvent::Pong { ts } => {
                let rtt = protocol::now_ms() - ts;
                self.push_toast(format!("Pong: {rtt} ms"), cx);
            }
            ServerEvent::Kicked { message } => {
                self.status = ConnStatus::Offline;
                let text = if message.is_empty() {
                    "You were kicked from the server.".to_string()
                } else {
                    message
                };
                self.push_toast(text.clone(), cx);
                self.push_local(text);
            }
        }
    }

    fn on_host_event(&mut self, event: HostEvent, _window: &mut Window, cx: &mut Context<Self>) {
        match event {
            HostEvent::Status(status) => {
                self.push_log(format!("[host] {status}"));
                if self.hosting {
                    self.host_status = status;
                }
            }
            HostEvent::Log(line) => self.push_log(line),
            HostEvent::Users(users) => self.host_users = users,
            HostEvent::Invite(url) => {
                self.invite = url.clone();
                self.host_error = None;
                self.download = None;
                self.push_log(format!("[host] invite ready: {url}"));
                self.push_toast("Invite link ready", cx);
            }
            HostEvent::Cloudflared { version, path } => {
                self.cloudflared = Some(version.clone());
                self.download = None;
                self.push_log(format!("[host] cloudflared {version} ({path})"));
            }
            HostEvent::Download { fraction, label } => {
                self.download = if fraction >= 1.0 { None } else { Some((fraction, label)) };
            }
            HostEvent::Error(error) => {
                self.host_error = Some(error.clone());
                self.push_log(format!("[error] {error}"));
            }
            HostEvent::Stopped(reason) => {
                self.push_log(format!("[error] {reason}"));
                if self.hosting {
                    self.stop_host(cx);
                    self.host_status = "Stopped".into();
                }
                self.host_error = Some(reason.clone());
                if self.page != Page::Host {
                    self.push_toast(reason, cx);
                }
            }
        }
    }

    fn on_key_event(&mut self, event: KeyEvent, window: &mut Window, cx: &mut Context<Self>) {
        self.key_state.ctrl = event.ctrl;
        self.key_state.shift = event.shift;
        self.key_state.alt = event.alt;
        if !event.down {
            self.key_state.latched.remove(&event.vk);
            return;
        }
        if self.key_state.latched.insert(event.vk) || self.overlay.active {
            let focused = self.visible && platform::is_foreground(self.hwnd);
            self.on_key(event.vk, focused, window, cx);
        }
    }

    fn on_key(&mut self, vk: u32, focused: bool, window: &mut Window, cx: &mut Context<Self>) {
        if self.overlay.enabled && self.overlay.active {
            self.overlay_key(vk, window, cx);
            return;
        }
        let (ctrl, shift, alt) = (self.key_state.ctrl, self.key_state.shift, self.key_state.alt);
        let fires = |binding: &str| {
            (!focused || binding_has_modifier(binding)) && binding_matches(binding, vk, ctrl, shift, alt)
        };

        let typing = focused && window.focused(cx).is_some_and(|f| f != self.focus);
        let toggle = &self.config.toggle_key;
        if (!typing || binding_has_modifier(toggle)) && binding_matches(toggle, vk, ctrl, shift, alt) {
            self.toggle_window(window, cx);
            return;
        }
        let shown = self.visible && platform::window_visible(self.hwnd) && !platform::is_minimized(self.hwnd);
        if !focused && binding_matches(&self.config.focus_key, vk, ctrl, shift, alt) {
            if !shown && !self.config.focus_when_hidden {
                return;
            }
            if self.overlay.enabled {
                self.activate_overlay(cx);
            } else {
                self.set_page(Page::Chat, cx);
                self.show(window, cx);
                window.focus(&self.inputs.composer.focus_handle(cx));
            }
            return;
        }
        if fires(&self.config.host_panel_key) {
            let page = if focused && self.page == Page::Host { Page::Chat } else { Page::Host };
            self.open_page(page, window, cx);
            return;
        }
        if fires(&self.config.settings_key) {
            let page = if focused && self.page == Page::Settings { Page::Chat } else { Page::Settings };
            self.open_page(page, window, cx);
            return;
        }
        if fires(&self.config.copy_invite_key) {
            let invite = self.invite.clone();
            if invite.is_empty() {
                self.push_toast("No invite link yet. Start hosting first.", cx);
            } else {
                self.copy_text(&invite, cx);
            }
            return;
        }
        if fires(&self.config.host_toggle_key) {
            if self.hosting {
                self.stop_host(cx);
                self.push_toast("Hosting stopped", cx);
            } else {
                self.start_host(cx);
                self.push_toast("Hosting started", cx);
            }
            return;
        }
        let macros_allowed = if focused { !typing } else { self.config.macros_unfocused };
        if macros_allowed && !ctrl && !alt {
            if let Some(text) = self.macro_text(vk) {
                if !self.status.connected() {
                    self.push_toast("Join a room to send macros", cx);
                } else if self.last_macro.elapsed() > Duration::from_millis(1500) {
                    self.last_macro = Instant::now();
                    let _ = self.client_tx.send(ClientCommand::Send {
                        text,
                        attachment: None,
                    });
                }
            }
        }
    }

    fn overlay_key(&mut self, vk: u32, window: &mut Window, cx: &mut Context<Self>) {
        let (ctrl, shift, alt) = (self.key_state.ctrl, self.key_state.shift, self.key_state.alt);
        if vk == 27 || binding_matches(&self.config.toggle_key, vk, ctrl, shift, alt) {
            self.deactivate_overlay(window, cx);
            return;
        }
        if vk == 13 {
            let text = self.overlay.buffer.trim().to_string();
            if !text.is_empty() {
                if !self.status.connected() {
                    self.push_toast("Not connected", cx);
                    return;
                }
                let _ = self.client_tx.send(ClientCommand::Send {
                    text,
                    attachment: None,
                });
            }
            self.deactivate_overlay(window, cx);
            return;
        }
        if vk == 8 {
            if self.overlay.select_all || ctrl {
                self.overlay.buffer.clear();
                self.overlay.select_all = false;
            } else {
                self.overlay.buffer.pop();
            }
            return;
        }
        if ctrl && vk == 65 {
            self.overlay.select_all = true;
            return;
        }
        if ctrl && vk == 86 {
            if let Some(text) = cx.read_from_clipboard().and_then(|item| item.text()) {
                if self.overlay.select_all {
                    self.overlay.buffer.clear();
                    self.overlay.select_all = false;
                }
                self.overlay.buffer.push_str(&text.replace(['\r', '\n'], " "));
            }
            return;
        }
        if ctrl || alt {
            return;
        }
        if let Some(base) = vk_char(vk) {
            if self.overlay.select_all {
                self.overlay.buffer.clear();
                self.overlay.select_all = false;
            }
            let character = if shift { shift_char(base) } else { base };
            self.overlay.buffer.push(character);
        }
    }

    fn macro_text(&self, vk: u32) -> Option<String> {
        let key = vk_char(vk)?.to_ascii_lowercase().to_string();
        self.config
            .macros
            .iter()
            .find(|entry| {
                let configured = entry.key.trim().to_ascii_lowercase();
                configured.len() == 1 && configured == key && !entry.text.trim().is_empty()
            })
            .map(|entry| entry.text.clone())
    }

    fn activate_overlay(&mut self, cx: &mut Context<Self>) {
        if !self.overlay.enabled {
            return;
        }
        self.overlay.restore_hidden = !self.visible || !platform::window_visible(self.hwnd);
        self.overlay.active = true;
        self.overlay.buffer.clear();
        self.overlay.select_all = false;
        platform::set_key_capture(true);
        platform::show_window(self.hwnd, false, true);
        self.visible = true;
        cx.notify();
    }

    fn deactivate_overlay(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let restore_hidden = self.overlay.restore_hidden;
        self.overlay.active = false;
        self.overlay.buffer.clear();
        self.overlay.select_all = false;
        self.overlay.restore_hidden = false;
        platform::set_key_capture(false);
        if restore_hidden {
            self.hide(window, cx);
        } else {
            platform::set_topmost(self.hwnd, self.config.always_on_top, true);
        }
        cx.notify();
    }

    fn start_host(&mut self, cx: &mut Context<Self>) {
        if self.hosting {
            return;
        }
        self.hosting = true;
        self.host_error = None;
        self.invite.clear();
        self.host_users.clear();
        self.logs.clear();
        self.download = None;
        self.host_status = "Starting…".into();
        if let Some(tray) = &self.tray {
            tray.set_hosting(true);
        }
        let settings = HostSettings {
            allow_embeds: self.config.allow_embeds,
            allow_attachments: self.config.allow_attachments,
            chat_filter: self.config.chat_filter,
        };
        self.host_settings = settings.clone();
        self.server = Some(server::start(&self.runtime, self.config.port, settings, self.host_tx.clone()));
        self.tunnel_stop = Some(tunnel::start(&self.runtime, self.config.port, self.host_tx.clone()));
        self.push_log(format!("[host] starting on port {}", self.config.port));
        cx.notify();
    }

    fn stop_host(&mut self, cx: &mut Context<Self>) {
        if !self.hosting {
            return;
        }
        if let Some(stop) = self.tunnel_stop.take() {
            let _ = stop.send(());
        }
        if let Some(server) = self.server.take() {
            server.shutdown();
        }
        self.hosting = false;
        self.invite.clear();
        self.host_users.clear();
        self.download = None;
        self.host_status = "Stopped".into();
        if let Some(tray) = &self.tray {
            tray.set_hosting(false);
        }
        self.push_log("[host] stopped");
        cx.notify();
    }

    fn connect(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let url = self.input_text(&self.inputs.invite, cx).trim().to_string();
        let username = self.input_text(&self.inputs.username, cx).trim().to_string();
        if url.is_empty() {
            self.push_toast("Paste an invite link first", cx);
            window.focus(&self.inputs.invite.focus_handle(cx));
            return;
        }
        if username.is_empty() {
            self.push_toast("Choose a username", cx);
            window.focus(&self.inputs.username.focus_handle(cx));
            return;
        }
        self.config.username = username.clone();
        self.config.invite = url.clone();
        self.config.save();
        self.connected_to = url.clone();
        self.messages.clear();
        self.images.clear();
        self.users.clear();
        self.status = ConnStatus::Connecting;
        let _ = self.client_tx.send(ClientCommand::Connect { url, username });
        self.page = Page::Chat;
        cx.notify();
    }

    fn join_local(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let local = format!("ws://127.0.0.1:{}", self.config.port);
        self.inputs.invite.update(cx, |input, cx| input.set_text(local, cx));
        if self.input_text(&self.inputs.username, cx).trim().is_empty() {
            self.inputs.username.update(cx, |input, cx| input.set_text("host", cx));
        }
        self.connect(window, cx);
    }

    fn disconnect(&mut self, cx: &mut Context<Self>) {
        let _ = self.client_tx.send(ClientCommand::Disconnect);
        let was_connected = self.status.connected();
        self.status = ConnStatus::Offline;
        self.users.clear();
        if was_connected {
            self.push_local("You left the room");
        }
        cx.notify();
    }

    fn handle_command(&mut self, text: &str, cx: &mut Context<Self>) {
        let trimmed = text.trim();
        if let Some(rest) = trimmed.strip_prefix("/8ball") {
            if rest.trim().is_empty() {
                self.push_toast("Usage: /8ball <question>", cx);
                return;
            }
            if !self.status.connected() {
                self.push_toast("Connect before asking the 8-ball", cx);
                return;
            }
            let _ = self.client_tx.send(ClientCommand::EightBall {
                question: rest.trim().to_string(),
            });
            return;
        }
        if trimmed == "/ping" {
            if self.status.connected() {
                let _ = self.client_tx.send(ClientCommand::Ping);
            } else {
                self.push_toast("Connect before pinging", cx);
            }
            return;
        }
        if trimmed == "/coinflip" || trimmed == "/flip" {
            if self.status.connected() {
                let _ = self.client_tx.send(ClientCommand::Coinflip);
            } else {
                self.push_toast("Connect before flipping a coin", cx);
            }
            return;
        }
        if trimmed == "/notes" {
            self.set_page(Page::Notes, cx);
            return;
        }
        self.push_toast("Unknown command. Try /8ball, /coinflip, /ping or /notes.", cx);
    }

    fn send_input(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let text = self.input_text(&self.inputs.composer, cx).trim().to_string();
        if text.is_empty() && self.pending_attachment.is_none() {
            return;
        }
        if text.starts_with('/') && self.pending_attachment.is_none() {
            self.handle_command(&text, cx);
            self.inputs.composer.update(cx, |input, cx| input.clear(cx));
            if self.page == Page::Notes {
                window.focus(&self.inputs.notes.focus_handle(cx));
            }
            return;
        }
        if !self.status.connected() {
            self.push_toast("Not connected", cx);
            return;
        }
        let attachment = self.pending_attachment.take();
        self.inputs.composer.update(cx, |input, cx| input.clear(cx));
        let _ = self.client_tx.send(ClientCommand::Send { text, attachment });
        self.scroll.scroll_to_bottom();
        window.focus(&self.inputs.composer.focus_handle(cx));
        cx.notify();
    }

    fn send_broadcast(&mut self, cx: &mut Context<Self>) {
        let text = self.input_text(&self.inputs.broadcast, cx).trim().to_string();
        if text.is_empty() {
            return;
        }
        match &self.server {
            Some(server) => {
                server.send_system(&text);
                self.inputs.broadcast.update(cx, |input, cx| input.clear(cx));
            }
            None => self.push_toast("Start hosting to broadcast", cx),
        }
    }

    fn pick_file(&mut self, cx: &mut Context<Self>) {
        let paths = cx.prompt_for_paths(PathPromptOptions {
            files: true,
            directories: false,
            multiple: false,
            prompt: Some("Attach".into()),
        });
        cx.spawn(async move |this, cx| {
            if let Ok(Ok(Some(paths))) = paths.await {
                if let Some(path) = paths.into_iter().next() {
                    this.update(cx, |app, cx| app.attach_path(path, cx)).ok();
                }
            }
        })
        .detach();
    }

    fn attach_path(&mut self, path: PathBuf, cx: &mut Context<Self>) {
        let too_big = std::fs::metadata(&path)
            .map(|metadata| metadata.len() as usize > MAX_ATTACHMENT_BYTES)
            .unwrap_or(false);
        if too_big {
            self.push_toast("Files must be 20 MB or smaller", cx);
            return;
        }
        let Ok(bytes) = std::fs::read(&path) else {
            self.push_toast("Could not read that file", cx);
            return;
        };
        if bytes.len() > MAX_ATTACHMENT_BYTES {
            self.push_toast("Files must be 20 MB or smaller", cx);
            return;
        }
        let name = path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| "attachment".into());
        let extension = path
            .extension()
            .map(|extension| extension.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default();
        let (kind, mime) = match extension.as_str() {
            "png" => ("image", "image/png"),
            "jpg" | "jpeg" => ("image", "image/jpeg"),
            "webp" => ("image", "image/webp"),
            "gif" => ("gif", "image/gif"),
            _ => ("file", "application/octet-stream"),
        };
        let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
        self.pending_attachment = Some(Attachment {
            kind: kind.into(),
            name: Some(name),
            data: Some(format!("data:{mime};base64,{encoded}")),
            mime: Some(mime.into()),
            url: None,
        });
        cx.notify();
    }

    fn save_attachment(&mut self, attachment: &Attachment, cx: &mut Context<Self>) {
        let Some((_, payload)) = attachment.data.as_ref().and_then(|data| data.split_once(',')) else {
            return;
        };
        let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(payload.trim()) else {
            self.push_toast("Could not decode attachment", cx);
            return;
        };
        let name = attachment.name.clone().unwrap_or_else(|| "attachment.bin".into());
        let safe: String = name
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | ' ') {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        let safe = if safe.trim().is_empty() { "attachment.bin".to_string() } else { safe };
        let directory = dirs::download_dir().unwrap_or_else(|| PathBuf::from("."));
        let path = directory.join(safe);
        match std::fs::write(&path, &bytes) {
            Ok(_) => self.push_toast(format!("Saved to {}", path.display()), cx),
            Err(error) => self.push_toast(format!("Save failed: {error}"), cx),
        }
    }

    fn ensure_images(&mut self) {
        for message in &self.messages {
            if message.attachment.is_none() || self.images.contains_key(&message.id) {
                continue;
            }
            let decoded = message.attachment.as_ref().and_then(decode_image);
            self.images.insert(message.id.clone(), decoded);
        }
    }

    fn set_room_setting(&mut self, update: impl FnOnce(&mut HostSettings), cx: &mut Context<Self>) {
        let mut settings = self.host_settings.clone();
        update(&mut settings);
        if let Some(server) = &self.server {
            server.set_settings(settings.clone());
        }
        self.config.allow_embeds = settings.allow_embeds;
        self.config.allow_attachments = settings.allow_attachments;
        self.config.chat_filter = settings.chat_filter;
        self.host_settings = settings;
        self.config.save();
        cx.notify();
    }

    fn save_settings(&mut self, cx: &mut Context<Self>) {
        let read = |input: &Entity<TextInput>| input.read(cx).text().trim().to_string();
        let hotkeys: Vec<String> = self.inputs.hotkeys.iter().map(read).collect();
        let macros: Vec<(String, String)> = self
            .inputs
            .macro_keys
            .iter()
            .zip(&self.inputs.macro_texts)
            .map(|(key, text)| (read(key), text.read(cx).text()))
            .collect();
        let port = read(&self.inputs.port);

        self.config.toggle_key = hotkeys[0].clone();
        self.config.focus_key = hotkeys[1].clone();
        self.config.host_panel_key = hotkeys[2].clone();
        self.config.settings_key = hotkeys[3].clone();
        self.config.copy_invite_key = hotkeys[4].clone();
        self.config.host_toggle_key = hotkeys[5].clone();
        for (entry, (key, text)) in self.config.macros.iter_mut().zip(macros) {
            entry.key = key;
            entry.text = text;
        }
        let mut note = "Settings saved".to_string();
        match port.parse::<u16>() {
            Ok(port) if port >= 1024 => self.config.port = port,
            _ => note = "Saved, but the port must be 1024 to 65535".into(),
        }
        let port_text = self.config.port.to_string();
        self.inputs.port.update(cx, |input, cx| input.set_text(port_text, cx));
        self.config.username = self.input_text(&self.inputs.username, cx).trim().to_string();
        self.config.invite = self.input_text(&self.inputs.invite, cx).trim().to_string();
        self.config.save();
        if self.hosting {
            note.push_str(". New port applies next time you host");
        }
        self.settings_note = Some(note);
        cx.notify();
    }

    fn set_always_on_top(&mut self, on: bool, cx: &mut Context<Self>) {
        self.config.always_on_top = on;
        platform::set_topmost(self.hwnd, on, true);
        self.config.save();
        cx.notify();
    }

    fn set_overlay_mode(&mut self, on: bool, window: &mut Window, cx: &mut Context<Self>) {
        self.config.true_overlay = on;
        self.overlay.enabled = on;
        if !on && self.overlay.active {
            self.deactivate_overlay(window, cx);
        }
        self.config.save();
        cx.notify();
    }
}

impl Focusable for TerrorLinkApp {
    fn focus_handle(&self, _: &App) -> FocusHandle {
        self.focus.clone()
    }
}

impl Render for TerrorLinkApp {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let t = theme();
        self.ensure_images();
        let root = div()
            .id("root")
            .key_context("TerrorLink")
            .track_focus(&self.focus)
            .on_action(cx.listener(Self::close_modal))
            .on_action(cx.listener(|this, _: &crate::ui::text_input::Escape, window, cx| {
                this.close_modal(&CloseModal, window, cx)
            }))
            .relative()
            .size_full()
            .flex()
            .flex_col()
            .overflow_hidden()
            .bg(linear_gradient(
                170.,
                linear_color_stop(t.bg_raised.opacity(self.config.opacity), 0.),
                linear_color_stop(t.bg.opacity(self.config.opacity), 0.55),
            ))
            .font_family("Segoe UI")
            .text_size(px(12.5))
            .text_color(t.text)
            .child(
                div()
                    .absolute()
                    .top(px(-70.))
                    .left(px(30.))
                    .w(px(220.))
                    .h(px(60.))
                    .rounded_full()
                    .shadow(glow(t.primary.opacity(0.28), 90.)),
            );

        if self.overlay.active {
            return root.child(self.render_overlay()).into_any_element();
        }

        let header = self.render_header(window, cx).into_any_element();
        let body = self.render_body(window, cx).into_any_element();
        let modal = (self.page != Page::Chat).then(|| self.render_modal(window, cx).into_any_element());
        root.on_drop(cx.listener(|this, paths: &ExternalPaths, _, cx| {
            if let Some(path) = paths.paths().first() {
                this.attach_path(path.clone(), cx);
            }
        }))
        .child(header)
        .child(body)
        .children(modal)
        .when_some(self.expanded_image.clone(), |d, (image, w, h)| {
            d.child(render_image_viewer(image, w, h, window, cx))
        })
        .when_some(self.toast.clone(), |d, (text, id)| d.child(render_toast(text, id)))
        .into_any_element()
    }
}

impl TerrorLinkApp {
    fn render_header(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let t = theme();
        let (status_color, pulse) = match &self.status {
            ConnStatus::Connected => (t.success, true),
            ConnStatus::Connecting | ConnStatus::Reconnecting(_) => (t.warning, false),
            ConnStatus::Failed(_) => (t.danger, false),
            ConnStatus::Offline => (t.text_faint, false),
        };
        let subtitle = if self.status.connected() {
            let online = self.users.len().max(1);
            format!("{} · {online} online", self.room_label())
        } else {
            self.status.label()
        };

        let hwnd = self.hwnd;
        let drag = div()
            .flex()
            .flex_1()
            .min_w(px(0.))
            .h_full()
            .items_center()
            .gap(px(9.))
            .on_mouse_down(gpui::MouseButton::Left, move |_, _, cx| {
                platform::begin_drag(hwnd);
                cx.stop_propagation();
            })
            .when_some(self.logo.clone(), |d, logo| {
                d.child(
                    div()
                        .flex_none()
                        .size(px(26.))
                        .rounded(px(7.))
                        .shadow(glow(t.primary.opacity(0.45), 10.))
                        .child(img(logo).size(px(26.)).rounded(px(7.))),
                )
            })
            .child(
                div()
                    .flex()
                    .flex_col()
                    .min_w(px(0.))
                    .child(
                        div()
                            .flex()
                            .items_baseline()
                            .gap(px(5.))
                            .line_height(px(16.))
                            .child(div().text_size(px(13.)).font_weight(FontWeight::SEMIBOLD).child("TerrorLink"))
                            .child(
                                div()
                                    .text_size(px(10.))
                                    .text_color(t.text_faint)
                                    .child(concat!("v", env!("CARGO_PKG_VERSION"))),
                            ),
                    )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(4.))
                            .min_w(px(0.))
                            .child(status_dot(status_color, pulse))
                            .child(
                                div()
                                    .truncate()
                                    .text_size(px(11.))
                                    .line_height(px(14.))
                                    .text_color(if matches!(self.status, ConnStatus::Failed(_)) {
                                        t.danger
                                    } else {
                                        t.text_muted
                                    })
                                    .child(subtitle),
                            ),
                    ),
            );

        let controls = div()
            .flex()
            .flex_none()
            .items_center()
            .gap(px(2.))
            .child(
                div()
                    .id("kofi")
                    .flex()
                    .flex_none()
                    .items_center()
                    .justify_center()
                    .size(px(28.))
                    .rounded(px(7.))
                    .cursor_pointer()
                    .hover(|s| s.bg(theme().surface_hover))
                    .child(img(kofi_logo()).w(px(18.)).h(px(15.)))
                    .on_click(|_, _, cx| cx.open_url("https://ko-fi.com/teutonic")),
            )
            .when(self.status.connected(), |d| {
                d.child(
                    icon_button("leave", Icon::LogOut, false, true)
                        .on_click(cx.listener(|this, _: &ClickEvent, _, cx| this.disconnect(cx))),
                )
            })
            .child(
                div()
                    .relative()
                    .child(
                        icon_button("host", Icon::Broadcast, self.page == Page::Host, false).on_click(
                            cx.listener(|this, _: &ClickEvent, window, cx| {
                                let page = if this.page == Page::Host { Page::Chat } else { Page::Host };
                                this.open_page(page, window, cx);
                            }),
                        ),
                    )
                    .when(self.hosting, |d| {
                        d.child(
                            div()
                                .absolute()
                                .top(px(4.))
                                .right(px(4.))
                                .size(px(6.))
                                .rounded_full()
                                .bg(t.success)
                                .border_1()
                                .border_color(t.bg_raised),
                        )
                    }),
            )
            .child(
                icon_button("settings", Icon::Settings, self.page == Page::Settings, false).on_click(
                    cx.listener(|this, _: &ClickEvent, window, cx| {
                        let page = if this.page == Page::Settings { Page::Chat } else { Page::Settings };
                        this.open_page(page, window, cx);
                    }),
                ),
            )
            .child(div().w(px(1.)).h(px(16.)).mx(px(4.)).bg(t.border))
            .child(
                icon_button("minimize", Icon::Minimize, false, false)
                    .on_click(cx.listener(|this, _: &ClickEvent, window, cx| this.hide(window, cx))),
            )
            .child(
                icon_button("close", Icon::Close, false, true)
                    .on_click(cx.listener(|this, _: &ClickEvent, window, cx| this.hide(window, cx))),
            );

        div()
            .flex()
            .flex_none()
            .items_center()
            .h(px(46.))
            .pl(px(12.))
            .pr(px(8.))
            .gap(px(8.))
            .border_b_1()
            .border_color(t.divider)
            .child(drag)
            .child(controls)
    }

    fn render_body(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if !matches!(self.status, ConnStatus::Connected | ConnStatus::Reconnecting(_)) {
            return div()
                .id("connect-screen")
                .flex()
                .flex_col()
                .flex_1()
                .min_h(px(0.))
                .items_center()
                .justify_center()
                .overflow_y_scroll()
                .px(px(20.))
                .py(px(12.))
                .child(self.render_connect(cx))
                .into_any_element();
        }
        let body = div().flex().flex_col().flex_1().min_h(px(0.)).gap(px(8.)).p(px(10.));
        body.child(self.render_messages(cx))
            .child(self.render_composer(window, cx))
            .into_any_element()
    }

    fn render_connect(&mut self, cx: &mut Context<Self>) -> impl IntoElement {
        let t = theme();
        let busy = matches!(self.status, ConnStatus::Connecting | ConnStatus::Reconnecting(_));
        let failure = match &self.status {
            ConnStatus::Failed(reason) => Some(reason.clone()),
            _ => None,
        };
        let divider = || div().flex_1().h(px(1.)).bg(t.border);
        div()
            .flex()
            .flex_none()
            .flex_col()
            .gap(px(8.))
            .w_full()
            .max_w(px(360.))
            .on_action(cx.listener(|this, _: &Submit, window, cx| this.connect(window, cx)))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap(px(2.))
                    .pb(px(4.))
                    .when_some(self.logo.clone(), |d, logo| {
                        d.child(
                            div()
                                .mb(px(6.))
                                .size(px(38.))
                                .rounded(px(10.))
                                .shadow(glow(t.primary.opacity(0.5), 18.))
                                .child(img(logo).size(px(38.)).rounded(px(10.))),
                        )
                    })
                    .child(
                        div()
                            .text_size(px(16.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .child("Join a room"),
                    )
                    .child(
                        div()
                            .text_size(px(11.5))
                            .text_color(t.text_muted)
                            .child("Paste the invite link your host shared"),
                    ),
            )
            .child(self.inputs.invite.clone())
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .child(div().flex_1().min_w(px(0.)).child(self.inputs.username.clone()))
                    .child(if busy {
                        button("connect", "Cancel", ButtonKind::Secondary, None)
                            .on_click(cx.listener(|this, _: &ClickEvent, _, cx| this.disconnect(cx)))
                    } else {
                        button("connect", "Connect", ButtonKind::Primary, Some(Icon::Plug))
                            .on_click(cx.listener(|this, _: &ClickEvent, window, cx| this.connect(window, cx)))
                    }),
            )
            .child(match failure {
                Some(reason) => div()
                    .px(px(8.))
                    .py(px(5.))
                    .rounded(px(7.))
                    .bg(t.danger_soft)
                    .text_size(px(11.))
                    .text_color(t.danger)
                    .child(reason),
                None => div()
                    .text_center()
                    .text_size(px(11.))
                    .text_color(t.text_faint)
                    .when(busy, |d| d.child("Connecting…")),
            })
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .text_size(px(10.5))
                    .text_color(t.text_faint)
                    .child(divider())
                    .child("or")
                    .child(divider()),
            )
            .child(
                button("host-instead", "Host your own room", ButtonKind::Secondary, Some(Icon::Broadcast))
                    .w_full()
                    .on_click(cx.listener(|this, _: &ClickEvent, window, cx| this.open_page(Page::Host, window, cx))),
            )
    }

    fn render_messages(&mut self, cx: &mut Context<Self>) -> impl IntoElement {
        let t = theme();
        let own_name = self.config.username.clone();
        let mut rows: Vec<AnyElement> = Vec::with_capacity(self.messages.len());
        for (index, message) in self.messages.iter().enumerate() {
            let prev = index.checked_sub(1).and_then(|i| self.messages.get(i));
            let next = self.messages.get(index + 1);
            rows.push(self.render_message(index, message, prev, next, &own_name, cx));
        }

        let empty = rows.is_empty();
        let (title, hint) = if self.status.connected() {
            ("No messages yet", "Say hello to the room")
        } else {
            ("You're not in a room", "Join with an invite link, or host your own")
        };
        div()
            .id("messages")
            .flex()
            .flex_col()
            .flex_1()
            .min_h(px(0.))
            .overflow_y_scroll()
            .track_scroll(&self.scroll)
            .rounded(px(12.))
            .bg(t.input_bg.opacity(0.55))
            .border_1()
            .border_color(t.divider)
            .px(px(10.))
            .py(px(8.))
            .when(empty, |d| {
                d.items_center().justify_center().child(
                    div()
                        .flex()
                        .flex_col()
                        .items_center()
                        .gap(px(6.))
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .justify_center()
                                .size(px(34.))
                                .rounded_full()
                                .bg(t.accent_soft)
                                .border_1()
                                .border_color(t.border_strong)
                                .child(icon(Icon::Link, 16., t.accent)),
                        )
                        .child(div().text_size(px(12.5)).text_color(t.text_muted).child(title))
                        .child(div().text_size(px(11.)).text_color(t.text_faint).child(hint)),
                )
            })
            .children(rows)
    }

    fn render_message(
        &self,
        index: usize,
        message: &Message,
        prev: Option<&Message>,
        next: Option<&Message>,
        own_name: &str,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let t = theme();
        if message.kind == "system" {
            return div()
                .flex()
                .justify_center()
                .py(px(4.))
                .child(
                    div()
                        .max_w(relative(0.9))
                        .px(px(10.))
                        .py(px(2.))
                        .rounded_full()
                        .bg(t.surface)
                        .border_1()
                        .border_color(t.divider)
                        .text_size(px(10.5))
                        .text_color(t.text_muted)
                        .child(message.text.clone()),
                )
                .into_any_element();
        }

        let same_group = |a: &Message, b: &Message| {
            a.kind != "system" && b.kind != "system" && a.from == b.from && (b.ts - a.ts).abs() < 5 * 60 * 1000
        };
        let first = prev.map(|p| !same_group(p, message)).unwrap_or(true);
        let last = next.map(|n| !same_group(message, n)).unwrap_or(true);
        let own = message.from == own_name;
        let mentioned = !own && crate::ui::markdown::mentions(&message.text, own_name);
        let time = format_time(message.ts);

        let attachment = message.attachment.clone().map(|attachment| {
            match self.images.get(&message.id).and_then(Option::as_ref) {
                Some(image) => {
                    let scale = (230.0 / image.width).min(170.0 / image.height).min(1.0);
                    let full = (image.image.clone(), image.width, image.height);
                    div()
                        .id(SharedString::from(format!("image-{index}")))
                        .when(self.config.image_expand, |d| {
                            d.cursor_pointer().on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                                this.expanded_image = Some(full.clone());
                                cx.notify();
                            }))
                        })
                        .child(
                            img(image.image.clone())
                                .w(px(image.width * scale))
                                .h(px(image.height * scale))
                                .rounded(px(8.)),
                        )
                        .into_any_element()
                }
                None => {
                    let name = attachment.name.clone().unwrap_or_else(|| "attachment".into());
                    let id = SharedString::from(format!("save-{index}"));
                    let action = if attachment.data.is_some() {
                        small_button(id, "Save", Some(Icon::Download), false)
                            .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                                this.save_attachment(&attachment, cx)
                            }))
                            .into_any_element()
                    } else if let Some(url) = attachment.url.clone() {
                        small_button(id, "Open", None, false)
                            .on_click(move |_, _, cx| cx.open_url(&url))
                            .into_any_element()
                    } else {
                        div().into_any_element()
                    };
                    div()
                        .flex()
                        .items_center()
                        .gap(px(6.))
                        .px(px(7.))
                        .py(px(5.))
                        .rounded(px(8.))
                        .bg(gpui::black().opacity(0.25))
                        .border_1()
                        .border_color(t.border)
                        .child(icon(Icon::Paperclip, 12., t.text_muted))
                        .child(div().truncate().max_w(px(160.)).text_size(px(11.5)).child(name))
                        .child(action)
                        .into_any_element()
                }
            }
        });

        let has_text = !message.text.is_empty();
        let bubble = div()
            .flex()
            .flex_col()
            .gap(px(4.))
            .max_w(relative(0.8))
            .px(px(10.))
            .py(px(6.))
            .rounded(px(14.))
            .text_size(px(12.5))
            .line_height(px(17.))
            .map(|d| {
                if own {
                    d.bg(linear_gradient(
                        150.,
                        linear_color_stop(t.primary_hover, 0.),
                        linear_color_stop(t.primary_deep, 1.),
                    ))
                    .text_color(t.on_primary)
                    .shadow(glow(t.primary.opacity(0.25), 8.))
                    .when(last, |d| d.rounded_br(px(4.)))
                    .when(!first, |d| d.rounded_tr(px(6.)))
                } else {
                    d.bg(if mentioned { t.accent_soft } else { t.bubble_other })
                        .border_1()
                        .border_color(if mentioned { t.accent } else { t.border })
                        .shadow(shadow_sm())
                        .when(last, |d| d.rounded_bl(px(4.)))
                        .when(!first, |d| d.rounded_tl(px(6.)))
                }
            })
            .when_some(attachment, |d, a| d.child(a))
            .when(has_text, |d| {
                let code_bg = if own { gpui::black().opacity(0.25) } else { t.surface_active };
                d.child(crate::ui::markdown::render(&message.text, code_bg))
            });

        let header = first.then(|| {
            div()
                .flex()
                .items_center()
                .gap(px(6.))
                .pb(px(2.))
                .when(own, |d| d.justify_end())
                .when(!own, |d| d.pl(px(26.)))
                .child(
                    div()
                        .text_size(px(11.5))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(name_color(&message.from))
                        .child(message.from.clone()),
                )
                .child(div().text_size(px(10.)).text_color(t.text_faint).child(time.clone()))
        });

        let row = if own {
            div().flex().justify_end().child(bubble)
        } else {
            div()
                .flex()
                .items_end()
                .gap(px(6.))
                .child(if last {
                    avatar(&message.from, 20.).into_any_element()
                } else {
                    div().w(px(20.)).flex_none().into_any_element()
                })
                .child(bubble)
        };

        div()
            .flex()
            .flex_col()
            .pt(px(if first { 8. } else { 2. }))
            .children(header)
            .child(row)
            .into_any_element()
    }

    fn render_composer(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let t = theme();
        let focused = self.inputs.composer.focus_handle(cx).is_focused(window);
        let enabled = self.status.connected();
        div()
            .flex()
            .flex_none()
            .flex_col()
            .gap(px(6.))
            .when_some(self.pending_attachment.clone(), |d, attachment| {
                let name = attachment.name.unwrap_or_else(|| "attachment".into());
                d.child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(6.))
                        .px(px(8.))
                        .py(px(4.))
                        .rounded(px(9.))
                        .bg(t.accent_soft)
                        .border_1()
                        .border_color(t.border_strong)
                        .child(icon(Icon::Paperclip, 12., t.accent_strong))
                        .child(div().flex_1().min_w(px(0.)).truncate().text_size(px(11.5)).child(name))
                        .child(
                            small_button("remove-attachment", "Remove", Some(Icon::Close), true).on_click(
                                cx.listener(|this, _: &ClickEvent, _, cx| {
                                    this.pending_attachment = None;
                                    cx.notify();
                                }),
                            ),
                        ),
                )
            })
            .child(
                div()
                    .flex()
                    .items_end()
                    .gap(px(4.))
                    .p(px(4.))
                    .rounded(px(12.))
                    .bg(t.surface)
                    .border_1()
                    .border_color(if focused { t.accent } else { t.border })
                    .shadow(if focused { theme::focus_ring() } else { shadow_sm() })
                    .on_action(cx.listener(|this, _: &Submit, window, cx| this.send_input(window, cx)))
                    .child(
                        icon_button("attach", Icon::Paperclip, false, false)
                            .on_click(cx.listener(|this, _: &ClickEvent, _, cx| this.pick_file(cx))),
                    )
                    .child(div().flex_1().min_w(px(0.)).child(self.inputs.composer.clone()))
                    .child(
                        div()
                            .id("send")
                            .flex()
                            .flex_none()
                            .items_center()
                            .justify_center()
                            .size(px(30.))
                            .rounded(px(8.))
                            .cursor_pointer()
                            .map(|d| {
                                if enabled {
                                    d.bg(linear_gradient(
                                        160.,
                                        linear_color_stop(t.primary_hover, 0.),
                                        linear_color_stop(t.primary_deep, 1.),
                                    ))
                                    .shadow(glow(t.primary.opacity(0.4), 10.))
                                    .hover(|s| s.opacity(0.9))
                                } else {
                                    d.bg(t.surface_active)
                                }
                            })
                            .active(|s| s.opacity(0.8))
                            .child(icon(Icon::Send, 15., if enabled { t.on_primary } else { t.text_faint }))
                            .on_click(cx.listener(|this, _: &ClickEvent, window, cx| this.send_input(window, cx))),
                    ),
            )
    }

    fn render_modal(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let t = theme();
        let viewport = window.viewport_size();
        let width = (f32::from(viewport.width) - 24.0).min(460.0);
        let height = (f32::from(viewport.height) - 24.0).min(560.0);
        let (title, subtitle, badge) = match self.page {
            Page::Host => ("Host a room", "Share a temporary invite link from this PC", Icon::Broadcast),
            Page::Notes => ("Temporary Notes", "Kept until you quit TerrorLink", Icon::Notes),
            Page::Changelog => ("Changelog", "What's new in TerrorLink", Icon::Refresh),
            _ => ("Settings", "Hotkeys, macros and app behaviour", Icon::Settings),
        };
        let content: AnyElement = match self.page {
            Page::Host => self.render_host(cx).into_any_element(),
            Page::Notes => self.render_notes(cx).into_any_element(),
            Page::Changelog => div()
                .text_size(px(12.))
                .line_height(px(19.))
                .map(|d| match &self.changelog {
                    None => d.text_color(t.text_faint).child("Loading release notes…"),
                    Some(Err(error)) => d.text_color(t.text_faint).child(error.clone()),
                    Some(Ok((title, body))) => d
                        .child(div().text_size(px(14.)).font_weight(FontWeight::SEMIBOLD).child(title.clone()))
                        .child(div().my(px(6.)).h(px(1.)).bg(t.divider))
                        .child(crate::ui::markdown::render(body, t.surface_active)),
                })
                .into_any_element(),
            _ => self.render_settings(cx).into_any_element(),
        };
        div()
            .id("scrim")
            .absolute()
            .inset_0()
            .flex()
            .items_center()
            .justify_center()
            .bg(t.scrim.opacity(self.config.opacity))
            .occlude()
            .child(
                div()
                    .id("modal")
                    .flex()
                    .flex_col()
                    .w(px(width))
                    .max_h(px(height))
                    .rounded(px(14.))
                    .bg(t.bg_raised.opacity(self.config.opacity))
                    .border_1()
                    .border_color(t.border_strong)
                    .shadow(shadow_lg())
                    .overflow_hidden()
                    .on_mouse_down_out(cx.listener(|this, _: &gpui::MouseDownEvent, _, cx| {
                        this.set_page(Page::Chat, cx)
                    }))
                    .child(
                        div()
                            .flex()
                            .flex_none()
                            .items_center()
                            .gap(px(10.))
                            .px(px(12.))
                            .py(px(10.))
                            .border_b_1()
                            .border_color(t.divider)
                            .child(
                                div()
                                    .flex()
                                    .flex_none()
                                    .items_center()
                                    .justify_center()
                                    .size(px(30.))
                                    .rounded(px(8.))
                                    .bg(t.accent_soft)
                                    .border_1()
                                    .border_color(t.border_strong)
                                    .child(icon(badge, 15., t.accent_strong)),
                            )
                            .child(
                                div()
                                    .flex()
                                    .flex_col()
                                    .flex_1()
                                    .child(
                                        div()
                                            .text_size(px(13.5))
                                            .font_weight(FontWeight::SEMIBOLD)
                                            .child(title),
                                    )
                                    .child(div().text_size(px(11.)).text_color(t.text_faint).child(subtitle)),
                            )
                            .child(icon_button("modal-close", Icon::Close, false, false).on_click(
                                cx.listener(|this, _: &ClickEvent, _, cx| this.set_page(Page::Chat, cx)),
                            )),
                    )
                    .child(
                        div()
                            .id("modal-scroll")
                            .flex()
                            .flex_col()
                            .flex_1()
                            .min_h(px(0.))
                            .overflow_y_scroll()
                            .p(px(12.))
                            .child(content),
                    ),
            )
    }

    fn render_host(&mut self, cx: &mut Context<Self>) -> impl IntoElement {
        let t = theme();
        let hosting = self.hosting;
        let waiting = hosting && self.invite.is_empty() && self.download.is_none() && self.host_error.is_none();
        let status_card = card()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(10.))
                    .child(status_dot(if hosting { t.success } else { t.text_faint }, hosting))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .flex_1()
                            .min_w(px(0.))
                            .child(
                                div()
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .child(if hosting { "Hosting" } else { "Not hosting" }),
                            )
                            .child(
                                div()
                                    .truncate()
                                    .text_size(px(11.))
                                    .text_color(t.text_muted)
                                    .child(self.host_status.clone()),
                            ),
                    )
                    .child(if hosting {
                        button("host-toggle", "Stop", ButtonKind::Danger, None)
                            .on_click(cx.listener(|this, _: &ClickEvent, _, cx| this.stop_host(cx)))
                    } else {
                        button("host-toggle", "Start hosting", ButtonKind::Primary, Some(Icon::Broadcast))
                            .on_click(cx.listener(|this, _: &ClickEvent, _, cx| this.start_host(cx)))
                    }),
            )
            .when_some(self.host_error.clone(), |d, error| {
                d.child(
                    div()
                        .px(px(8.))
                        .py(px(5.))
                        .rounded(px(7.))
                        .bg(t.danger_soft)
                        .text_size(px(11.))
                        .text_color(t.danger)
                        .child(error),
                )
            })
            .when_some(self.download.clone(), |d, (fraction, label)| {
                d.child(
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(4.))
                        .child(
                            div()
                                .flex()
                                .justify_between()
                                .text_size(px(11.))
                                .text_color(t.text_muted)
                                .child(label)
                                .child(format!("{:.0}%", fraction * 100.0)),
                        )
                        .child(progress_bar(fraction)),
                )
            })
            .when(waiting, |d| {
                d.child(
                    div()
                        .text_size(px(11.))
                        .text_color(t.text_faint)
                        .child("Opening a Cloudflare tunnel. The invite link appears here in a few seconds."),
                )
            })
            .when(!self.invite.is_empty(), |d| {
                let invite = self.invite.clone();
                d.child(
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(6.))
                        .p(px(8.))
                        .rounded(px(9.))
                        .bg(t.input_bg)
                        .border_1()
                        .border_color(t.border_strong)
                        .child(
                            div()
                                .text_size(px(10.))
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(t.text_faint)
                                .child("INVITE LINK"),
                        )
                        .child(
                            div()
                                .font_family("Consolas")
                                .text_size(px(11.5))
                                .text_color(t.accent_strong)
                                .child(invite.clone()),
                        )
                        .child(
                            div()
                                .flex()
                                .gap(px(6.))
                                .child(
                                    button("copy-invite", "Copy link", ButtonKind::Primary, Some(Icon::Copy))
                                        .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                                            this.copy_text(&invite, cx)
                                        })),
                                )
                                .child(
                                    button("join-local", "Join my room", ButtonKind::Secondary, None)
                                        .on_click(cx.listener(|this, _: &ClickEvent, window, cx| {
                                            this.join_local(window, cx)
                                        })),
                                ),
                        ),
                )
            });

        let settings = self.host_settings.clone();
        let room_card = card()
            .gap(px(2.))
            .child(
                toggle_row("allow-embeds", "Embeds", Some("Let links show previews"), settings.allow_embeds)
                    .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
                        this.set_room_setting(|s| s.allow_embeds = !s.allow_embeds, cx)
                    })),
            )
            .child(
                toggle_row(
                    "allow-attachments",
                    "Attachments",
                    Some("Allow images and files up to 20 MB"),
                    settings.allow_attachments,
                )
                .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
                    this.set_room_setting(|s| s.allow_attachments = !s.allow_attachments, cx)
                })),
            )
            .child(
                toggle_row("chat-filter", "Profanity filter", Some("Mask common swear words"), settings.chat_filter)
                    .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
                        this.set_room_setting(|s| s.chat_filter = !s.chat_filter, cx)
                    })),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .pt(px(6.))
                    .on_action(cx.listener(|this, _: &Submit, _, cx| this.send_broadcast(cx)))
                    .child(div().flex_1().min_w(px(0.)).child(self.inputs.broadcast.clone()))
                    .child(
                        button("broadcast", "Send", ButtonKind::Secondary, Some(Icon::Send))
                            .on_click(cx.listener(|this, _: &ClickEvent, _, cx| this.send_broadcast(cx))),
                    ),
            );

        let server = self.server.clone();
        let users_card = card().gap(px(4.)).map(|d| {
            if self.host_users.is_empty() {
                d.child(
                    div()
                        .text_size(px(11.5))
                        .text_color(t.text_faint)
                        .child(if hosting { "Nobody has joined yet" } else { "Start hosting to see who joins" }),
                )
            } else {
                d.children(self.host_users.iter().enumerate().map(|(i, name)| {
                    let server = server.clone();
                    let kick_name = name.clone();
                    div()
                        .flex()
                        .items_center()
                        .gap(px(8.))
                        .child(avatar(name, 22.))
                        .child(div().flex_1().min_w(px(0.)).truncate().child(name.clone()))
                        .child(
                            small_button(SharedString::from(format!("kick-{i}")), "Kick", None, true)
                                .on_click(move |_, _, _| {
                                    if let Some(server) = &server {
                                        server.kick(&kick_name);
                                    }
                                }),
                        )
                }))
            }
        });

        let log_lines: Vec<AnyElement> = if self.logs.is_empty() {
            vec![div().text_color(t.text_faint).child("No log entries").into_any_element()]
        } else {
            self.logs
                .iter()
                .map(|line| {
                    let color = if line.starts_with("[error]") {
                        t.danger
                    } else if line.starts_with("[warn]") {
                        t.warning
                    } else if line.contains("ready") {
                        t.success
                    } else {
                        t.text_muted
                    };
                    div().text_color(color).child(line.clone()).into_any_element()
                })
                .collect()
        };

        div()
            .flex()
            .flex_col()
            .gap(px(6.))
            .child(status_card)
            .child(section_label("Room"))
            .child(room_card)
            .child(section_label(format!("People · {}", self.host_users.len())))
            .child(users_card)
            .child(
                div()
                    .flex()
                    .items_end()
                    .justify_between()
                    .child(section_label("Log"))
                    .child(
                        div()
                            .flex()
                            .gap(px(4.))
                            .child(
                                small_button("update-cloudflared", "Update cloudflared", Some(Icon::Refresh), false)
                                    .on_click(cx.listener(|this, _: &ClickEvent, _, _| {
                                        tunnel::check_update(&this.runtime, this.host_tx.clone())
                                    })),
                            )
                            .child(
                                small_button("clear-log", "Clear", Some(Icon::Trash), false).on_click(cx.listener(
                                    |this, _: &ClickEvent, _, cx| {
                                        this.logs.clear();
                                        cx.notify();
                                    },
                                )),
                            ),
                    ),
            )
            .child(
                div()
                    .id("host-log")
                    .flex()
                    .flex_col()
                    .max_h(px(110.))
                    .overflow_y_scroll()
                    .p(px(8.))
                    .rounded(px(9.))
                    .bg(t.input_bg)
                    .border_1()
                    .border_color(t.border)
                    .font_family("Consolas")
                    .text_size(px(10.5))
                    .line_height(px(15.))
                    .children(log_lines),
            )
    }

    fn render_notes(&mut self, _cx: &mut Context<Self>) -> impl IntoElement {
        self.inputs.notes.clone()
    }

    fn render_settings(&mut self, cx: &mut Context<Self>) -> impl IntoElement {
        let t = theme();
        let hotkeys = card().gap(px(4.)).children(HOTKEY_LABELS.iter().enumerate().map(|(i, (label, hint))| {
            div()
                .flex()
                .items_center()
                .gap(px(10.))
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .flex_1()
                        .min_w(px(0.))
                        .child(div().text_size(px(12.)).child(*label))
                        .when(!hint.is_empty(), |d| {
                            d.child(div().text_size(px(10.5)).text_color(t.text_faint).child(*hint))
                        }),
                )
                .child(div().w(px(150.)).flex_none().child(self.inputs.hotkeys[i].clone()))
        }));

        let macros = card()
            .gap(px(5.))
            .child(
                div()
                    .text_size(px(10.5))
                    .text_color(t.text_faint)
                    .child("Press the key while no text box is focused to send the text."),
            )
            .child(
                toggle_row(
                    "macros-unfocused",
                    "Work while TerrorLink is unfocused",
                    Some("Also send macros while you're in another app"),
                    self.config.macros_unfocused,
                )
                .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
                    this.config.macros_unfocused = !this.config.macros_unfocused;
                    this.config.save();
                    cx.notify();
                })),
            )
            .children((0..self.inputs.macro_keys.len()).map(|i| {
                div()
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .child(div().w(px(84.)).flex_none().child(self.inputs.macro_keys[i].clone()))
                    .child(div().flex_1().min_w(px(0.)).child(self.inputs.macro_texts[i].clone()))
            }));

        let config = &self.config;
        let app_card = card()
            .gap(px(2.))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(10.))
                    .pb(px(4.))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .flex_1()
                            .child(div().text_size(px(12.)).child("Hosting port"))
                            .child(
                                div()
                                    .text_size(px(10.5))
                                    .text_color(t.text_faint)
                                    .child("Local port the chat server listens on"),
                            ),
                    )
                    .child(div().w(px(80.)).flex_none().child(self.inputs.port.clone())),
            )
            .child(
                toggle_row(
                    "start-hidden",
                    "Start hidden in the tray",
                    Some("Launch straight to the system tray"),
                    config.start_hidden,
                )
                .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
                    this.config.start_hidden = !this.config.start_hidden;
                    this.config.save();
                    cx.notify();
                })),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(10.))
                    .py(px(4.))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .flex_1()
                            .min_w(px(0.))
                            .child(div().text_size(px(12.)).child("Window opacity"))
                            .child(
                                div()
                                    .text_size(px(10.5))
                                    .text_color(t.text_faint)
                                    .child("Lower it to see what's behind the window"),
                            ),
                    )
                    .children([1.0f32, 0.85, 0.7, 0.55, 0.4].into_iter().map(|level| {
                        let selected = (config.opacity - level).abs() < 0.01;
                        small_button(
                            SharedString::from(format!("opacity-{}", (level * 100.0) as u32)),
                            format!("{}%", (level * 100.0).round() as u32),
                            None,
                            false,
                        )
                        .when(selected, |d| d.bg(t.accent_soft).border_color(t.accent).text_color(t.accent_strong))
                        .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                            this.config.opacity = level;
                            this.config.save();
                            cx.notify();
                        }))
                    })),
            )
            .child(
                toggle_row(
                    "image-expand",
                    "Click images to expand",
                    Some("Open chat images full-window on click"),
                    config.image_expand,
                )
                .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
                    this.config.image_expand = !this.config.image_expand;
                    this.config.save();
                    cx.notify();
                })),
            )
            .child(
                toggle_row("always-on-top", "Always on top", Some("Keep the window above other apps"), config.always_on_top)
                    .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
                        let on = !this.config.always_on_top;
                        this.set_always_on_top(on, cx)
                    })),
            )
            .child(
                toggle_row(
                    "focus-when-hidden",
                    "Focus key works while hidden",
                    Some("Let the focus key bring back a hidden or minimised window (and the overlay)"),
                    config.focus_when_hidden,
                )
                .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
                    this.config.focus_when_hidden = !this.config.focus_when_hidden;
                    this.config.save();
                    cx.notify();
                })),
            )
            .child(
                toggle_row(
                    "overlay-mode",
                    "Overlay mode",
                    Some("The focus hotkey opens a type-anywhere strip"),
                    config.true_overlay,
                )
                .on_click(cx.listener(|this, _: &ClickEvent, window, cx| {
                    let on = !this.config.true_overlay;
                    this.set_overlay_mode(on, window, cx)
                })),
            );

        let cloudflared = card().child(
            div()
                .flex()
                .items_center()
                .gap(px(10.))
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .flex_1()
                        .min_w(px(0.))
                        .child(div().text_size(px(12.)).child("cloudflared"))
                        .child(
                            div()
                                .text_size(px(10.5))
                                .text_color(t.text_faint)
                                .child(match &self.cloudflared {
                                    Some(version) => format!("Installed: {version}"),
                                    None => "Downloaded automatically the first time you host".to_string(),
                                }),
                        ),
                )
                .child(
                    small_button("check-updates", "Check for updates", Some(Icon::Refresh), false).on_click(
                        cx.listener(|this, _: &ClickEvent, _, _| {
                            tunnel::check_update(&this.runtime, this.host_tx.clone())
                        }),
                    ),
                ),
        );

        let about = card().child(
            div()
                .flex()
                .items_center()
                .gap(px(10.))
                .when_some(self.logo.clone(), |d, logo| d.child(img(logo).size(px(28.)).rounded(px(7.))))
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .flex_1()
                        .min_w(px(0.))
                        .child(
                            div()
                                .font_weight(FontWeight::SEMIBOLD)
                                .child(format!("TerrorLink {}", env!("CARGO_PKG_VERSION"))),
                        )
                        .child(
                            div()
                                .truncate()
                                .text_size(px(10.5))
                                .text_color(t.text_faint)
                                .child(format!("GPL-3.0-or-later · Logs: {}", config::log_path().display())),
                        ),
                )
                .child(
                    small_button("changelog", "Changelog", None, false)
                        .on_click(cx.listener(|this, _: &ClickEvent, _, cx| this.open_changelog(cx))),
                )
                .child(
                    small_button("project-page", "Project page", None, false)
                        .on_click(|_, _, cx| cx.open_url("https://github.com/TeutonicTerrror/TerrorLink")),
                ),
        );

        div()
            .flex()
            .flex_col()
            .gap(px(6.))
            .on_action(cx.listener(|this, _: &Submit, _, cx| this.save_settings(cx)))
            .child(section_label("Hotkeys"))
            .child(hotkeys)
            .child(section_label("Text macros"))
            .child(macros)
            .child(section_label("Application"))
            .child(app_card)
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .pt(px(4.))
                    .child(
                        button("save-settings", "Save changes", ButtonKind::Primary, Some(Icon::Check))
                            .on_click(cx.listener(|this, _: &ClickEvent, _, cx| this.save_settings(cx))),
                    )
                    .child(
                        button("quit", "Quit TerrorLink", ButtonKind::Ghost, None)
                            .on_click(cx.listener(|this, _: &ClickEvent, window, cx| this.quit(window, cx))),
                    )
                    .when_some(self.settings_note.clone(), |d, note| {
                        d.child(
                            div()
                                .flex()
                                .flex_1()
                                .min_w(px(0.))
                                .items_center()
                                .gap(px(4.))
                                .text_size(px(11.))
                                .text_color(t.success)
                                .child(icon(Icon::Check, 12., t.success))
                                .child(div().truncate().child(note)),
                        )
                    }),
            )
            .child(section_label("Tunnel"))
            .child(cloudflared)
            .child(section_label("About"))
            .child(about)
    }

    fn render_overlay(&self) -> impl IntoElement {
        let t = theme();
        let empty = self.overlay.buffer.is_empty();
        div()
            .flex()
            .flex_col()
            .flex_1()
            .justify_center()
            .gap(px(8.))
            .p(px(16.))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .when_some(self.logo.clone(), |d, logo| d.child(img(logo).size(px(20.)).rounded(px(5.))))
                    .child(div().font_weight(FontWeight::SEMIBOLD).child("TerrorLink"))
                    .child(
                        div()
                            .px(px(6.))
                            .rounded(px(5.))
                            .bg(t.accent_soft)
                            .border_1()
                            .border_color(t.border_strong)
                            .text_size(px(9.5))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(t.accent_strong)
                            .child("OVERLAY"),
                    )
                    .child(div().flex_1())
                    .child(
                        div()
                            .text_size(px(11.))
                            .text_color(t.text_faint)
                            .child(if self.status.connected() { self.room_label() } else { "Not connected".into() }),
                    ),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .min_h(px(52.))
                    .px(px(14.))
                    .py(px(10.))
                    .rounded(px(12.))
                    .bg(t.input_bg)
                    .border_1()
                    .border_color(t.accent)
                    .shadow(glow(t.primary.opacity(0.45), 16.))
                    .text_size(px(16.))
                    .map(|d| {
                        if empty {
                            d.text_color(t.text_faint).child("Start typing…")
                        } else if self.overlay.select_all {
                            d.child(
                                div()
                                    .bg(t.accent_ring)
                                    .rounded(px(3.))
                                    .child(self.overlay.buffer.clone()),
                            )
                        } else {
                            d.child(self.overlay.buffer.clone())
                                .child(div().w(px(2.)).h(px(18.)).ml(px(1.)).bg(t.accent_strong))
                        }
                    }),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(5.))
                    .text_size(px(11.))
                    .text_color(t.text_faint)
                    .child(key_cap("Enter"))
                    .child("send")
                    .child(div().w(px(8.)))
                    .child(key_cap("Esc"))
                    .child("cancel"),
            )
    }
}

fn render_image_viewer(
    image: Arc<Image>,
    width: f32,
    height: f32,
    window: &mut Window,
    cx: &mut Context<TerrorLinkApp>,
) -> impl IntoElement {
    let viewport = window.viewport_size();
    let max_w = f32::from(viewport.width) - 40.0;
    let max_h = f32::from(viewport.height) - 40.0;
    let scale = (max_w / width).min(max_h / height).min(1.0);
    div()
        .id("image-viewer")
        .absolute()
        .inset_0()
        .flex()
        .items_center()
        .justify_center()
        .bg(theme().scrim)
        .occlude()
        .cursor_pointer()
        .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
            this.expanded_image = None;
            cx.notify();
        }))
        .child(
            img(image)
                .w(px(width * scale))
                .h(px(height * scale))
                .rounded(px(10.))
                .shadow(shadow_lg()),
        )
}

fn render_toast(text: SharedString, id: u64) -> impl IntoElement {
    let t = theme();
    div()
        .absolute()
        .bottom(px(62.))
        .left_0()
        .right_0()
        .flex()
        .justify_center()
        .px(px(16.))
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(7.))
                .max_w(px(420.))
                .min_w(px(0.))
                .px(px(12.))
                .py(px(6.))
                .rounded(px(10.))
                .bg(t.surface_hover)
                .border_1()
                .border_color(t.border_strong)
                .shadow(shadow_md())
                .text_size(px(11.5))
                .child(div().flex_none().size(px(6.)).rounded_full().bg(t.accent))
                .child(div().min_w(px(0.)).child(text))
                .with_animation(
                    SharedString::from(format!("toast-{id}")),
                    Animation::new(Duration::from_millis(160)).with_easing(gpui::ease_out_quint()),
                    |el, delta| el.opacity(delta),
                ),
        )
}

fn kofi_logo() -> Arc<Image> {
    static LOGO: std::sync::OnceLock<Arc<Image>> = std::sync::OnceLock::new();
    LOGO.get_or_init(|| {
        Arc::new(Image::from_bytes(
            ImageFormat::Svg,
            include_bytes!("../assets/kofi_symbol.svg").to_vec(),
        ))
    })
    .clone()
}

async fn fetch_release_notes() -> Result<(String, String), String> {
    let version = env!("CARGO_PKG_VERSION");
    let url = format!("https://api.github.com/repos/TeutonicTerrror/TerrorLink/releases/tags/{version}");
    let response = reqwest::Client::new()
        .get(url)
        .header("User-Agent", format!("TerrorLink/{version}"))
        .header("Accept", "application/vnd.github+json")
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|_| "Could not reach GitHub. Check your connection and try again.".to_string())?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(format!("No release notes for v{version} yet."));
    }
    if !response.status().is_success() {
        return Err(format!("GitHub returned an error ({}).", response.status().as_u16()));
    }
    let release: serde_json::Value = response
        .json()
        .await
        .map_err(|_| "GitHub sent release notes TerrorLink could not read.".to_string())?;
    let name = release["name"].as_str().filter(|n| !n.is_empty()).unwrap_or(version);
    let date = release["published_at"].as_str().and_then(|d| d.get(..10)).unwrap_or_default();
    let title = if date.is_empty() { format!("v{name}") } else { format!("v{name} · {date}") };
    let body = release["body"].as_str().unwrap_or("No release notes available.").replace("\r\n", "\n");
    Ok((title, body))
}

fn format_time(ts: i64) -> String {
    use chrono::TimeZone;
    chrono::Local
        .timestamp_millis_opt(ts)
        .single()
        .map(|time| time.format("%H:%M").to_string())
        .unwrap_or_default()
}

fn decode_image(attachment: &Attachment) -> Option<CachedImage> {
    let data = attachment.data.as_ref()?;
    let (meta, payload) = data.split_once(',')?;
    let mime = attachment.mime.clone().unwrap_or_else(|| meta.to_string());
    let format = if attachment.kind == "gif" || mime.contains("gif") {
        ImageFormat::Gif
    } else if mime.contains("png") {
        ImageFormat::Png
    } else if mime.contains("jpeg") || mime.contains("jpg") {
        ImageFormat::Jpeg
    } else if mime.contains("webp") {
        ImageFormat::Webp
    } else {
        return None;
    };
    let bytes = base64::engine::general_purpose::STANDARD.decode(payload.trim()).ok()?;
    let (width, height) = image::ImageReader::new(std::io::Cursor::new(&bytes))
        .with_guessed_format()
        .ok()?
        .into_dimensions()
        .ok()?;
    if width == 0 || height == 0 {
        return None;
    }
    Some(CachedImage {
        image: Arc::new(Image::from_bytes(format, bytes)),
        width: width as f32,
        height: height as f32,
    })
}

fn binding_matches(binding: &str, vk: u32, ctrl: bool, shift: bool, alt: bool) -> bool {
    let mut parts: Vec<&str> = binding
        .split('+')
        .map(|part| part.trim())
        .filter(|part| !part.is_empty())
        .collect();
    if binding.trim_end().ends_with("++") || binding.trim() == "+" {
        parts.push("+");
    }
    let Some(key) = parts.pop() else {
        return false;
    };
    let mut need = (false, false, false);
    for part in parts {
        match part.to_ascii_lowercase().as_str() {
            "control" | "ctrl" => need.0 = true,
            "shift" => need.1 = true,
            "alt" => need.2 = true,
            _ => {}
        }
    }
    if need != (ctrl, shift, alt) {
        return false;
    }
    if key.chars().count() == 1 {
        let wanted = key.chars().next().unwrap().to_ascii_lowercase();
        return vk_char(vk)
            .map(|found| found.to_ascii_lowercase() == wanted)
            .unwrap_or(false);
    }
    match key.to_ascii_lowercase().as_str() {
        "space" => vk == 32,
        "tab" => vk == 9,
        "enter" | "return" => vk == 13,
        "escape" | "esc" => vk == 27,
        "backspace" => vk == 8,
        "delete" | "del" => vk == 46,
        "insert" | "ins" => vk == 45,
        "home" => vk == 36,
        "end" => vk == 35,
        "pageup" => vk == 33,
        "pagedown" => vk == 34,
        "up" => vk == 38,
        "down" => vk == 40,
        "left" => vk == 37,
        "right" => vk == 39,
        other => other
            .strip_prefix('f')
            .and_then(|n| n.parse::<u32>().ok())
            .map(|n| (1..=24).contains(&n) && vk == 111 + n)
            .unwrap_or(false),
    }
}

fn binding_has_modifier(binding: &str) -> bool {
    binding
        .split('+')
        .map(|part| part.trim().to_ascii_lowercase())
        .any(|part| matches!(part.as_str(), "control" | "ctrl" | "shift" | "alt"))
}

fn vk_char(vk: u32) -> Option<char> {
    match vk {
        32 => Some(' '),
        48..=57 => char::from_u32(vk),
        65..=90 => char::from_u32(vk).map(|c| c.to_ascii_lowercase()),
        96..=105 => char::from_u32(48 + (vk - 96)),
        106 => Some('*'),
        107 => Some('+'),
        109 => Some('-'),
        110 => Some('.'),
        111 => Some('/'),
        186 => Some(';'),
        187 => Some('='),
        188 => Some(','),
        189 => Some('-'),
        190 => Some('.'),
        191 => Some('/'),
        192 => Some('`'),
        219 => Some('['),
        220 => Some('\\'),
        221 => Some(']'),
        222 => Some('\''),
        _ => None,
    }
}

fn shift_char(base: char) -> char {
    match base {
        '1' => '!',
        '2' => '@',
        '3' => '#',
        '4' => '$',
        '5' => '%',
        '6' => '^',
        '7' => '&',
        '8' => '*',
        '9' => '(',
        '0' => ')',
        '-' => '_',
        '=' => '+',
        '[' => '{',
        ']' => '}',
        '\\' => '|',
        ';' => ':',
        '\'' => '"',
        ',' => '<',
        '.' => '>',
        '/' => '?',
        '`' => '~',
        other => other.to_ascii_uppercase(),
    }
}
