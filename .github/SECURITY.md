# Security Policy

## Supported versions

Only the latest release of TerrorLink receives security fixes. Older versions are not patched. Check releases tab for the latest release.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub's private vulnerability reporting:
**Security tab → Report a vulnerability** on this repository.

Include:

- The TerrorLink version and Windows version.
- Steps to reproduce, or a proof of concept.
- The impact you believe it has.

You can expect an acknowledgement within 7 days. We will confirm whether the issue is accepted, work on a fix, and credit you in the release notes unless you ask us not to.

## Scope

In scope:

- The chat server and client protocol (`src/server.rs`, `src/client.rs`, `src/protocol.rs`).
- Auto-update and download verification (`src/updater.rs`, `src/tunnel.rs`).
- Anything that lets one room member read, change or act as another, or lets an outside party join a room without an invite.

Out of scope:

- Problems in Cloudflare Tunnel or `cloudflared` itself. Report those to Cloudflare.
- Issues that need an attacker to already have local access to the host PC.
