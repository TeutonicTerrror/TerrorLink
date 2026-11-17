# Privacy Policy

**TerrorLink collects no data. Nothing is ever sent to the developer.**

There are no accounts, analytics, advertising or telemetry, and the project operates no server that could receive your data. Everything TerrorLink stores stays on your PC.

The rest of this page lists what the app does over the network and on disk, so you can see that for yourself. The only services it contacts are GitHub, GIPHY and the Cloudflare tunnel you choose to use. Those are third parties, and their policies apply to the requests sent to them.

## Chat

- One person hosts a room from their own PC. Messages, attachments and names go to the host and the other people in that room.
- Rooms are reachable through a temporary [Cloudflare Tunnel](https://www.cloudflare.com/products/tunnel/). Cloudflare relays the traffic and is subject to its own [privacy policy](https://www.cloudflare.com/privacypolicy/).
- Chat history is kept in memory while the room is open. When the host stops, the room is gone.
- Anyone in a room can see what you send there. Only join rooms you trust.

## Network requests TerrorLink makes

| When | Where | What is sent |
| --- | --- | --- |
| Hosting a room for the first time, or when you choose "Update cloudflared" | `api.github.com` and GitHub release downloads | A request for the latest `cloudflared` release. The download is checked against its SHA-256 hash. |
| Checking for an update | `github.com` | A request for the latest TerrorLink release. The downloaded update is checked against its SHA-256 hash. |
| Viewing release notes | `api.github.com` | A request for the notes of the version you are running. |
| Searching or browsing GIFs | `api.giphy.com` | Your search text and a public API key. GIPHY's own privacy policy applies to those requests. |
| Joining a room | The room's invite address | Your chosen username and your messages. |

Like any internet request, these requests expose your IP address to the server you contact. None of them go to the developer, and TerrorLink contacts no other service.

## Keyboard hook

TerrorLink installs a Windows keyboard hook so global hotkeys and text macros work while you are in another app or game. The hook sees key presses system-wide, but TerrorLink only uses them to recognise your configured hotkeys and macros. Key presses are not stored, logged or sent anywhere.

## Data stored on your PC

- Settings (username, hotkeys, macros, window options) in `%APPDATA%\TerrorLink\config.json`.
- A downloaded copy of `cloudflared` in `%LOCALAPPDATA%\TerrorLink\cloudflared`.
- An activity log of app events and errors in `TerrorLink Logs\client.log` in your user folder. It never leaves your PC.

Delete these folders to remove everything TerrorLink has stored. Uninstalling is just deleting `terrorlink.exe`. TerrorLink does not add startup entries or change system settings.

## Changes

If this policy changes, the new version will be published in this repository.

## Contact

Open an issue on [GitHub](https://github.com/TeutonicTerrror/TerrorLink/issues). For security problems, see [SECURITY.md](SECURITY.md).
