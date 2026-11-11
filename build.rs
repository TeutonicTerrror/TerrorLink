use std::path::PathBuf;

fn main() {
    println!("cargo:rerun-if-changed=assets/logos/default/Logo.svg");
    println!("cargo:rerun-if-changed=build.rs");

    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
    println!("cargo:rerun-if-changed=Cargo.toml");
    if std::env::var("PROFILE").as_deref() == Ok("release") {
        if let Some(profile_dir) = out_dir.ancestors().nth(3) {
            let manifest = format!("version: {}
", std::env::var("CARGO_PKG_VERSION").expect("version"));
            std::fs::write(profile_dir.join("version.yml"), manifest).expect("write version.yml");
        }
    }
    let ico_path = out_dir.join("terrorlink.ico");
    let svg = std::fs::read("assets/logos/default/Logo.svg").expect("Logo.svg is missing");
    let ico = build_ico(&svg, &[16, 20, 24, 32, 40, 48, 64, 256]);
    std::fs::write(&ico_path, ico).expect("write icon");

    #[cfg(windows)]
    {
        let mut resource = winresource::WindowsResource::new();
        resource.set_icon_with_id(ico_path.to_str().expect("utf-8 path"), "1");
        resource.set("FileDescription", "TerrorLink");
        resource.set("ProductName", "TerrorLink");
        if let Err(error) = resource.compile() {
            println!("cargo:warning=could not embed the app icon: {error}");
        }
    }
}

fn render_png(svg: &[u8], size: u32) -> Vec<u8> {
    let tree = resvg::usvg::Tree::from_data(svg, &resvg::usvg::Options::default())
        .expect("Logo.svg could not be parsed");
    let mut pixmap = tiny_skia::Pixmap::new(size, size).expect("pixmap");
    let target = tree.size().width().max(tree.size().height()).max(1.0);
    let scale = size as f32 / target;
    resvg::render(
        &tree,
        tiny_skia::Transform::from_scale(scale, scale),
        &mut pixmap.as_mut(),
    );
    pixmap.encode_png().expect("encode png")
}

fn build_ico(svg: &[u8], sizes: &[u32]) -> Vec<u8> {
    let images: Vec<(u32, Vec<u8>)> = sizes.iter().map(|&s| (s, render_png(svg, s))).collect();
    let mut out = Vec::new();
    out.extend_from_slice(&0u16.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&(images.len() as u16).to_le_bytes());
    let mut offset = 6 + 16 * images.len() as u32;
    for (size, png) in &images {
        let dim = if *size >= 256 { 0u8 } else { *size as u8 };
        out.push(dim);
        out.push(dim);
        out.push(0);
        out.push(0);
        out.extend_from_slice(&1u16.to_le_bytes());
        out.extend_from_slice(&32u16.to_le_bytes());
        out.extend_from_slice(&(png.len() as u32).to_le_bytes());
        out.extend_from_slice(&offset.to_le_bytes());
        offset += png.len() as u32;
    }
    for (_, png) in &images {
        out.extend_from_slice(png);
    }
    out
}
