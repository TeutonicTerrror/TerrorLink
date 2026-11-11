#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod client;
mod config;
mod events;
mod platform;
mod protocol;
mod server;
mod theme;
mod tunnel;
mod updater;
mod ui;

use std::sync::Arc;

use gpui::{
    px, size, AppContext, Application, Bounds, WindowBackgroundAppearance, WindowBounds,
    WindowKind, WindowOptions,
};

fn main() {
    let runtime = Arc::new(
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .worker_threads(4)
            .build()
            .expect("failed to start the async runtime"),
    );
    let config = config::Config::load();

    Application::new()
        .with_assets(ui::icons::Assets)
        .run(move |cx| {
            ui::text_input::bind_keys(cx);
            app::bind_keys(cx);

            let window_size = size(
                px(config.window_width.max(420.0)),
                px(config.window_height.max(320.0)),
            );
            let options = WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::centered(None, window_size, cx))),
                titlebar: None,
                focus: !config.start_hidden,
                show: true,
                kind: WindowKind::Normal,
                is_movable: true,
                is_resizable: true,
                is_minimizable: true,
                window_background: WindowBackgroundAppearance::Transparent,
                app_id: Some("TerrorLink".into()),
                window_min_size: Some(size(px(420.), px(320.))),
                ..Default::default()
            };
            let runtime = runtime.clone();
            let config = config.clone();
            let opened = cx.open_window(options, move |window, cx| {
                cx.new(|cx| app::TerrorLinkApp::new(window, cx, config, runtime))
            });
            if let Err(error) = opened {
                config::append_log(&format!("could not open the window: {error}"));
                cx.quit();
                return;
            }
            cx.activate(true);
        });
}
