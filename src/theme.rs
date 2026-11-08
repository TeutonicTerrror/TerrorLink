use std::sync::{Arc, OnceLock};

use gpui::{hsla, point, px, rgb, rgba, BoxShadow, Hsla};

pub struct Theme {
    pub bg: Hsla,
    pub bg_raised: Hsla,
    pub surface: Hsla,
    pub surface_hover: Hsla,
    pub surface_active: Hsla,
    pub input_bg: Hsla,
    pub border: Hsla,
    pub border_strong: Hsla,
    pub divider: Hsla,
    pub accent: Hsla,
    pub accent_strong: Hsla,
    pub accent_soft: Hsla,
    pub accent_ring: Hsla,
    pub primary: Hsla,
    pub primary_hover: Hsla,
    pub primary_deep: Hsla,
    pub on_primary: Hsla,
    pub text: Hsla,
    pub text_muted: Hsla,
    pub text_faint: Hsla,
    pub bubble_other: Hsla,
    pub success: Hsla,
    pub warning: Hsla,
    pub danger: Hsla,
    pub danger_soft: Hsla,
    pub scrim: Hsla,
}

pub fn theme() -> &'static Theme {
    static THEME: OnceLock<Theme> = OnceLock::new();
    THEME.get_or_init(|| Theme {
        bg: rgb(0x0d0a14).into(),
        bg_raised: rgb(0x15101f).into(),
        surface: rgb(0x1a1427).into(),
        surface_hover: rgb(0x231b34).into(),
        surface_active: rgb(0x2b2140).into(),
        input_bg: rgb(0x0f0b17).into(),
        border: rgba(0xffffff14).into(),
        border_strong: rgba(0xa77bff40).into(),
        divider: rgba(0xffffff0d).into(),
        accent: rgb(0xa77bff).into(),
        accent_strong: rgb(0xcdb3ff).into(),
        accent_soft: rgba(0x8a4dff26).into(),
        accent_ring: rgba(0x8a4dff59).into(),
        primary: rgb(0x7a45ec).into(),
        primary_hover: rgb(0x8b5cf6).into(),
        primary_deep: rgb(0x5b2bc4).into(),
        on_primary: rgb(0xfdfbff).into(),
        text: rgb(0xeee9f7).into(),
        text_muted: rgb(0x9b90b3).into(),
        text_faint: rgb(0x675d7c).into(),
        bubble_other: rgb(0x1c1629).into(),
        success: rgb(0x4ade80).into(),
        warning: rgb(0xf6c054).into(),
        danger: rgb(0xff6b7a).into(),
        danger_soft: rgba(0xff6b7a1f).into(),
        scrim: rgba(0x05030ab8).into(),
    })
}

pub fn shadow_sm() -> Vec<BoxShadow> {
    vec![BoxShadow {
        color: hsla(0., 0., 0., 0.35),
        offset: point(px(0.), px(1.)),
        blur_radius: px(3.),
        spread_radius: px(0.),
    }]
}

pub fn shadow_md() -> Vec<BoxShadow> {
    vec![
        BoxShadow {
            color: hsla(0., 0., 0., 0.35),
            offset: point(px(0.), px(4.)),
            blur_radius: px(12.),
            spread_radius: px(0.),
        },
        BoxShadow {
            color: hsla(0., 0., 0., 0.25),
            offset: point(px(0.), px(1.)),
            blur_radius: px(2.),
            spread_radius: px(0.),
        },
    ]
}

pub fn shadow_lg() -> Vec<BoxShadow> {
    vec![
        BoxShadow {
            color: hsla(0., 0., 0., 0.55),
            offset: point(px(0.), px(16.)),
            blur_radius: px(40.),
            spread_radius: px(-4.),
        },
        BoxShadow {
            color: hsla(0., 0., 0., 0.3),
            offset: point(px(0.), px(2.)),
            blur_radius: px(6.),
            spread_radius: px(0.),
        },
    ]
}

pub fn glow(color: Hsla, radius: f32) -> Vec<BoxShadow> {
    vec![BoxShadow {
        color,
        offset: point(px(0.), px(0.)),
        blur_radius: px(radius),
        spread_radius: px(0.),
    }]
}

pub fn focus_ring() -> Vec<BoxShadow> {
    vec![BoxShadow {
        color: theme().accent_ring,
        offset: point(px(0.), px(0.)),
        blur_radius: px(0.),
        spread_radius: px(2.),
    }]
}

pub fn name_color(name: &str) -> Hsla {
    const COLORS: [u32; 7] = [
        0xc4aaff, 0xffb88c, 0x82d4ff, 0xff96c8, 0x96e6aa, 0xf0d68c, 0x9fb4ff,
    ];
    let mut hash = 0u32;
    for byte in name.bytes() {
        hash = hash.wrapping_mul(31).wrapping_add(byte as u32);
    }
    rgb(COLORS[(hash as usize) % COLORS.len()]).into()
}

const LOGO_SVG: &[u8] = include_bytes!("../assets/logos/default/Logo.svg");

pub fn render_logo_rgba(size: u32) -> Option<Vec<u8>> {
    let pixmap = render_logo(size)?;
    let mut out = Vec::with_capacity((size * size * 4) as usize);
    for pixel in pixmap.pixels() {
        let c = pixel.demultiply();
        out.extend_from_slice(&[c.red(), c.green(), c.blue(), c.alpha()]);
    }
    Some(out)
}

pub fn logo_image(size: u32) -> Option<Arc<gpui::Image>> {
    let png = render_logo(size)?.encode_png().ok()?;
    Some(Arc::new(gpui::Image::from_bytes(gpui::ImageFormat::Png, png)))
}

fn render_logo(size: u32) -> Option<tiny_skia::Pixmap> {
    let tree = resvg::usvg::Tree::from_data(LOGO_SVG, &resvg::usvg::Options::default()).ok()?;
    let mut pixmap = tiny_skia::Pixmap::new(size, size)?;
    let target = tree.size().width().max(tree.size().height()).max(1.0);
    let scale = size as f32 / target;
    resvg::render(
        &tree,
        tiny_skia::Transform::from_scale(scale, scale),
        &mut pixmap.as_mut(),
    );
    Some(pixmap)
}
