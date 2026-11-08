use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::thread;

use tokio::sync::mpsc::UnboundedSender;
use tray_icon::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tray_icon::{Icon, MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};

#[derive(Clone, Copy, Debug)]
pub struct KeyEvent {
    pub vk: u32,
    pub down: bool,
    pub ctrl: bool,
    pub shift: bool,
    pub alt: bool,
}

pub struct KeyHook {
    #[cfg_attr(not(windows), allow(dead_code))]
    thread_id: u32,
}

impl KeyHook {
    pub fn stop(&self) {
        #[cfg(windows)]
        unsafe {
            use windows::Win32::Foundation::{LPARAM, WPARAM};
            use windows::Win32::UI::WindowsAndMessaging::{PostThreadMessageW, WM_QUIT};
            let _ = PostThreadMessageW(self.thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
        }
    }
}

static HOOK_SENDER: OnceLock<UnboundedSender<KeyEvent>> = OnceLock::new();

static CAPTURE_KEYS: AtomicBool = AtomicBool::new(false);

pub fn set_key_capture(capture: bool) {
    CAPTURE_KEYS.store(capture, Ordering::SeqCst);
}

fn is_modifier(vk: u32) -> bool {
    matches!(vk, 16 | 17 | 18 | 91 | 92 | 160..=165)
}

#[cfg(windows)]
mod hook {
    use super::{is_modifier, KeyEvent, CAPTURE_KEYS, HOOK_SENDER};
    use std::sync::atomic::Ordering;
    use std::sync::mpsc::Sender;
    use windows::Win32::Foundation::{HINSTANCE, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage,
        UnhookWindowsHookEx, HC_ACTION, KBDLLHOOKSTRUCT, LLKHF_INJECTED, MSG, WH_KEYBOARD_LL,
        WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code == HC_ACTION as i32 {
            let info = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
            let message = wparam.0 as u32;
            let down = message == WM_KEYDOWN || message == WM_SYSKEYDOWN;
            let up = message == WM_KEYUP || message == WM_SYSKEYUP;
            if down || up {
                if let Some(sender) = HOOK_SENDER.get() {
                    let held = |vk: u16| GetAsyncKeyState(vk as i32) as u16 & 0x8000 != 0;
                    let _ = sender.send(KeyEvent {
                        vk: info.vkCode,
                        down,
                        ctrl: held(0x11),
                        shift: held(0x10),
                        alt: held(0x12),
                    });
                }
                let injected = info.flags.0 & LLKHF_INJECTED.0 != 0;
                if CAPTURE_KEYS.load(Ordering::SeqCst) && !injected && !is_modifier(info.vkCode) {
                    return LRESULT(1);
                }
            }
        }
        CallNextHookEx(None, code, wparam, lparam)
    }

    pub fn run(ready: Sender<Option<u32>>) {
        unsafe {
            let module: Option<HINSTANCE> = GetModuleHandleW(None).ok().map(|m| m.into());
            let hook = match SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), module, 0) {
                Ok(hook) => hook,
                Err(error) => {
                    crate::config::append_log(&format!("keyboard hook failed: {error}"));
                    let _ = ready.send(None);
                    return;
                }
            };
            let _ = ready.send(Some(GetCurrentThreadId()));
            let mut message = MSG::default();
            while GetMessageW(&mut message, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }
            let _ = UnhookWindowsHookEx(hook);
        }
    }
}

pub fn start_key_hook(sender: UnboundedSender<KeyEvent>) -> Option<KeyHook> {
    if HOOK_SENDER.set(sender).is_err() {
        return None;
    }
    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Option<u32>>();
    thread::Builder::new()
        .name("terrorlink-keyhook".into())
        .spawn(move || {
            #[cfg(windows)]
            hook::run(ready_tx);
            #[cfg(not(windows))]
            let _ = ready_tx.send(None);
        })
        .ok()?;
    let thread_id = ready_rx.recv().ok()??;
    Some(KeyHook { thread_id })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrayAction {
    Click,
    Toggle,
    HostToggle,
    Settings,
    Quit,
}

pub struct Tray {
    tray: TrayIcon,
    host_item: MenuItem,
    toggle_item: MenuItem,
}

impl Tray {
    pub fn set_hosting(&self, hosting: bool) {
        self.host_item
            .set_text(if hosting { "Stop hosting" } else { "Start hosting" });
        let _ = self.tray.set_tooltip(Some(if hosting {
            "TerrorLink - hosting"
        } else {
            "TerrorLink"
        }));
    }

    pub fn set_window_visible(&self, visible: bool) {
        self.toggle_item
            .set_text(if visible { "Hide TerrorLink" } else { "Show TerrorLink" });
    }
}

pub fn create_tray(icon_rgba: Vec<u8>, size: u32, actions: UnboundedSender<TrayAction>) -> Option<Tray> {
    let menu = Menu::new();
    let toggle = MenuItem::with_id("toggle", "Hide TerrorLink", true, None);
    let host = MenuItem::with_id("host", "Start hosting", true, None);
    let settings = MenuItem::with_id("settings", "Settings", true, None);
    let quit = MenuItem::with_id("quit", "Quit TerrorLink", true, None);
    let _ = menu.append(&toggle);
    let _ = menu.append(&host);
    let _ = menu.append(&PredefinedMenuItem::separator());
    let _ = menu.append(&settings);
    let _ = menu.append(&PredefinedMenuItem::separator());
    let _ = menu.append(&quit);

    let menu_actions = actions.clone();
    MenuEvent::set_event_handler(Some(move |event: MenuEvent| {
        let action = match event.id.0.as_str() {
            "toggle" => TrayAction::Toggle,
            "host" => TrayAction::HostToggle,
            "settings" => TrayAction::Settings,
            "quit" => TrayAction::Quit,
            _ => return,
        };
        let _ = menu_actions.send(action);
    }));
    TrayIconEvent::set_event_handler(Some(move |event: TrayIconEvent| {
        if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
        } = event
        {
            let _ = actions.send(TrayAction::Click);
        }
    }));

    let icon = Icon::from_rgba(icon_rgba, size, size).ok()?;
    let tray = TrayIconBuilder::new()
        .with_menu(Box::new(menu))
        .with_tooltip("TerrorLink")
        .with_icon(icon)
        .with_menu_on_left_click(false)
        .build()
        .ok()?;
    Some(Tray {
        tray,
        host_item: host,
        toggle_item: toggle,
    })
}

pub fn hwnd_of(window: &gpui::Window) -> isize {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    match HasWindowHandle::window_handle(window).map(|handle| handle.as_raw()) {
        Ok(RawWindowHandle::Win32(handle)) => handle.hwnd.get(),
        _ => 0,
    }
}

#[cfg(windows)]
mod win {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
        DWM_WINDOW_CORNER_PREFERENCE,
    };
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VK_MENU,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, GetForegroundWindow, IsIconic, GetWindowThreadProcessId, IsWindowVisible,
        SetForegroundWindow, SetWindowPos, ShowWindow, HWND_NOTOPMOST, HWND_TOPMOST,
        SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_HIDE, SW_RESTORE, SW_SHOWNOACTIVATE,
    };

    fn hwnd(raw: isize) -> HWND {
        HWND(raw as *mut core::ffi::c_void)
    }

    pub fn hide(raw: isize) {
        if raw == 0 {
            return;
        }
        unsafe {
            let _ = ShowWindow(hwnd(raw), SW_HIDE);
        }
    }

    pub fn show(raw: isize, activate: bool, topmost: bool) {
        if raw == 0 {
            return;
        }
        let h = hwnd(raw);
        unsafe {
            if activate {
                let _ = ShowWindow(h, SW_RESTORE);
            } else {
                let _ = ShowWindow(h, SW_SHOWNOACTIVATE);
            }
            set_topmost(raw, topmost, !activate);
            if activate {
                let foreground = GetForegroundWindow();
                let foreground_thread = GetWindowThreadProcessId(foreground, None);
                let own_thread = GetCurrentThreadId();
                let attached = foreground_thread != 0
                    && foreground_thread != own_thread
                    && AttachThreadInput(own_thread, foreground_thread, true).as_bool();
                let _ = BringWindowToTop(h);
                let _ = SetForegroundWindow(h);
                if attached {
                    let _ = AttachThreadInput(own_thread, foreground_thread, false);
                }
                if GetForegroundWindow() != h {
                    keybd_event(VK_MENU.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
                    let _ = SetForegroundWindow(h);
                    keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_KEYUP, 0);
                }
            }
        }
    }

    pub fn set_topmost(raw: isize, topmost: bool, no_activate: bool) {
        if raw == 0 {
            return;
        }
        let mut flags = SWP_NOMOVE | SWP_NOSIZE;
        if no_activate {
            flags |= SWP_NOACTIVATE;
        }
        unsafe {
            let _ = SetWindowPos(
                hwnd(raw),
                Some(if topmost { HWND_TOPMOST } else { HWND_NOTOPMOST }),
                0,
                0,
                0,
                0,
                flags,
            );
        }
    }

    pub fn begin_drag(raw: isize) {
        if raw == 0 {
            return;
        }
        use windows::Win32::Foundation::{LPARAM, WPARAM};
        use windows::Win32::UI::Input::KeyboardAndMouse::ReleaseCapture;
        use windows::Win32::UI::WindowsAndMessaging::{PostMessageW, SC_MOVE, WM_SYSCOMMAND};
        const HTCAPTION: usize = 2;
        unsafe {
            let _ = ReleaseCapture();
            let _ = PostMessageW(
                Some(hwnd(raw)),
                WM_SYSCOMMAND,
                WPARAM(SC_MOVE as usize | HTCAPTION),
                LPARAM(0),
            );
        }
    }

    pub fn is_minimized(raw: isize) -> bool {
        raw != 0 && unsafe { IsIconic(hwnd(raw)) }.as_bool()
    }

    pub fn is_foreground(raw: isize) -> bool {
        raw != 0 && unsafe { GetForegroundWindow() } == hwnd(raw)
    }

    pub fn is_visible(raw: isize) -> bool {
        raw != 0 && unsafe { IsWindowVisible(hwnd(raw)).as_bool() }
    }

    pub fn round_corners(raw: isize) {
        if raw == 0 {
            return;
        }
        let preference: DWM_WINDOW_CORNER_PREFERENCE = DWMWCP_ROUND;
        unsafe {
            let _ = DwmSetWindowAttribute(
                hwnd(raw),
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &preference as *const _ as *const core::ffi::c_void,
                std::mem::size_of::<DWM_WINDOW_CORNER_PREFERENCE>() as u32,
            );
        }
    }
}

#[cfg(windows)]
pub use win::{
    begin_drag, hide as hide_window, is_foreground, is_minimized, is_visible as window_visible, round_corners, set_topmost,
    show as show_window,
};

#[cfg(not(windows))]
pub fn hide_window(_raw: isize) {}
#[cfg(not(windows))]
pub fn show_window(_raw: isize, _activate: bool, _topmost: bool) {}
#[cfg(not(windows))]
pub fn set_topmost(_raw: isize, _topmost: bool, _no_activate: bool) {}
#[cfg(not(windows))]
pub fn window_visible(_raw: isize) -> bool {
    true
}
#[cfg(not(windows))]
pub fn round_corners(_raw: isize) {}
#[cfg(not(windows))]
pub fn begin_drag(_raw: isize) {}
#[cfg(not(windows))]
pub fn is_minimized(_raw: isize) -> bool {
    false
}
#[cfg(not(windows))]
pub fn is_foreground(_raw: isize) -> bool {
    true
}

pub fn play_mention_sound() {
    #[cfg(windows)]
    {
        use windows::core::PCWSTR;
        use windows::Win32::Media::Audio::{PlaySoundW, SND_ASYNC, SND_MEMORY, SND_NODEFAULT};
        static WAV: OnceLock<Vec<u8>> = OnceLock::new();
        let wav = WAV.get_or_init(chime);
        unsafe {
            let _ = PlaySoundW(PCWSTR(wav.as_ptr() as *const u16), None, SND_MEMORY | SND_ASYNC | SND_NODEFAULT);
        }
    }
}

fn chime() -> Vec<u8> {
    const RATE: u32 = 22050;
    let mut samples: Vec<i16> = Vec::new();
    for (freq, ms) in [(880.0f32, 90u32), (1318.5, 170)] {
        let n = RATE * ms / 1000;
        for i in 0..n {
            let t = i as f32 / RATE as f32;
            let fade = (i.min(n - i) as f32 / 60.0).min(1.0);
            let env = (-t * 14.0).exp() * fade;
            let wave = (t * freq * std::f32::consts::TAU).sin();
            samples.push((wave * env * 0.3 * i16::MAX as f32) as i16);
        }
    }
    let data_len = samples.len() as u32 * 2;
    let mut out = Vec::with_capacity(44 + data_len as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&RATE.to_le_bytes());
    out.extend_from_slice(&(RATE * 2).to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    for sample in samples {
        out.extend_from_slice(&sample.to_le_bytes());
    }
    out
}

#[cfg(test)]
mod tests {
    #[test]
    fn chime_is_a_well_formed_wav() {
        let wav = super::chime();
        assert_eq!(&wav[..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        let riff = u32::from_le_bytes(wav[4..8].try_into().unwrap()) as usize;
        let data = u32::from_le_bytes(wav[40..44].try_into().unwrap()) as usize;
        assert_eq!(riff + 8, wav.len());
        assert_eq!(data + 44, wav.len());
    }
}
