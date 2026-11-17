# Contributing to TerrorLink

Thanks for helping out. TerrorLink is free software under the [GPL-3.0-or-later](../LICENSE) license.

## Before you start

- For a bug or a small fix, open a pull request directly.
- For a larger feature or a change in behavior, open an issue first so we can agree on the approach.
- For security problems, follow [SECURITY.md](SECURITY.md). Do not open a public issue.

## Building and testing

You need:

- Windows 10 or 11.
- Rust 1.88 or newer, with the MSVC toolchain.

```powershell
cargo run --release   # build and run
cargo test            # run the test suite
```

Please run `cargo fmt` and `cargo clippy` on your changes before opening a pull request.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Keep each pull request to one change. Describe what changed and why.
3. Add or update tests when you change logic. The existing tests live next to the code they cover (`#[cfg(test)]` modules).
4. Make sure `cargo test` passes.
5. Keep the code consistent with the surrounding style. Avoid new dependencies unless they are needed.

## Dependencies and licensing

- Every dependency must use an open source license approved by the OSI, and must not require a commercial license.
- By submitting a contribution, you agree that it is licensed under GPL-3.0-or-later.
- Do not include proprietary code, copied code with an incompatible license, or assets you do not have the right to distribute.

## Code review and releases

Changes are reviewed by a maintainer before they are merged. Release builds are produced from source.
