<div align="center">

<img src="assets/logos/default/Logo.svg" width="112" alt="TerrorLink logo">

# TerrorLink

**Private, ephemeral group chat, hosted from your own PC.**

No accounts. No servers to rent. 100% Opensource.

![Version](https://img.shields.io/badge/version-2.1.0-8b5cf6)
![Platform](https://img.shields.io/badge/platform-Windows%2010%20%2F%2011-1a1427)
![Rust](https://img.shields.io/badge/built%20with-Rust-b7410e)
![License](https://img.shields.io/badge/license-GPL--3.0-4ade80)

</div>

---

## What is TerrorLink?

TerrorLink is a tiny chat room for you and a handful of friends. One person hosts with a single click, TerrorLink opens a temporary Cloudflare tunnel, and everyone else joins with the invite link. When the host stops, the room is gone.

It's one small native app and it sits in your tray, works with global hotkeys and stays out of your way while you game or work.

## Features

### Chat

- Markdown: **bold**, *italic*, underline, ~~strike~~, `code` and bullet lists
- `@mentions` with a notification sound
- Emoji shortcodes like `:smile:` that turn into 😄 as you type
- Multi-line messages with Shift+Enter
- Images and animated GIFs inline, with click-to-expand
- Commands: `/8ball`, `/coinflip`, `/ping` and `/notes`

### Hosting

- One click (or Ctrl+Shift+H) to host through a temporary Cloudflare tunnel
- `cloudflared` downloaded and checksum-verified for you
- Invite links checked before joining, with clear errors for dead links, version mismatches and taken names
- Room controls: attachments, profanity filter, host broadcasts, kick and a live log

### Desktop

- Lives in the system tray
- Global hotkeys and single-key text macros
- Overlay mode: a type-anywhere strip that never steals focus from your game
- Adjustable window opacity
- Temporary Notes that last until you quit

## Tech stack

| Layer | Built with |
| --- | --- |
| Language | Rust |
| UI | [GPUI](https://www.gpui.rs/), Zed's GPU-accelerated UI framework (DirectX 11) |
| Async runtime | Tokio |
| Chat server | Axum WebSockets |
| Chat client | tokio-tungstenite over rustls |
| Tunnel | Cloudflare `cloudflared` quick tunnels |
| Images | `image`, plus `resvg` for the logo and icon |
| Windows integration | `windows` crate (keyboard hook, window control, sound) and `tray-icon` |

## Run it

You need Windows 10 or 11 and a Rust toolchain with the MSVC target.

```powershell
cargo run --release
```

For a debug build, use plain `cargo run`.

## License

TerrorLink is free software under the [GPL-3.0-or-later](LICENSE.md) licence.

TerrorLink is made entirely by TeutonicTerror!