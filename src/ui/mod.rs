pub mod icons;
pub mod markdown;
pub mod text_input;

use gpui::{
    div, linear_color_stop, linear_gradient, prelude::*, px, relative, Div, ElementId,
    FontWeight, Hsla, SharedString, Stateful,
};

use crate::theme::{glow, name_color, shadow_sm, theme};
use icons::{icon, Icon};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ButtonKind {
    Primary,
    Secondary,
    Ghost,
    Danger,
}

pub fn button(
    id: impl Into<ElementId>,
    label: impl Into<SharedString>,
    kind: ButtonKind,
    leading: Option<Icon>,
) -> Stateful<Div> {
    let t = theme();
    let (bg, hover_bg, border, fg, hover_fg) = match kind {
        ButtonKind::Primary => (t.primary, t.primary_hover, t.primary_hover, t.on_primary, t.on_primary),
        ButtonKind::Secondary => (t.surface, t.surface_hover, t.border, t.text_muted, t.text),
        ButtonKind::Ghost => (
            gpui::transparent_black(),
            t.surface_hover,
            gpui::transparent_black(),
            t.text_muted,
            t.text,
        ),
        ButtonKind::Danger => (t.danger_soft, t.danger.opacity(0.22), t.danger.opacity(0.4), t.danger, t.danger),
    };
    let label: SharedString = label.into();
    div()
        .id(id)
        .flex()
        .flex_none()
        .items_center()
        .justify_center()
        .gap(px(5.))
        .h(px(30.))
        .px(px(12.))
        .rounded(px(8.))
        .bg(bg)
        .border_1()
        .border_color(border)
        .text_size(px(12.))
        .font_weight(FontWeight::MEDIUM)
        .text_color(fg)
        .cursor_pointer()
        .when(kind == ButtonKind::Primary, |d| {
            d.bg(linear_gradient(
                180.,
                linear_color_stop(t.primary_hover, 0.),
                linear_color_stop(t.primary, 1.),
            ))
            .shadow(glow(t.primary.opacity(0.35), 10.))
        })
        .hover(move |s| s.bg(hover_bg).text_color(hover_fg))
        .active(|s| s.opacity(0.85))
        .when_some(leading, move |d, i| d.child(icon(i, 13., fg)))
        .child(label)
}

pub fn small_button(
    id: impl Into<ElementId>,
    label: impl Into<SharedString>,
    leading: Option<Icon>,
    danger: bool,
) -> Stateful<Div> {
    let t = theme();
    let hover_fg = if danger { t.danger } else { t.text };
    let hover_bg = if danger { t.danger_soft } else { t.surface_active };
    div()
        .id(id)
        .flex()
        .flex_none()
        .items_center()
        .gap(px(4.))
        .h(px(22.))
        .px(px(8.))
        .rounded(px(6.))
        .bg(t.surface_hover)
        .border_1()
        .border_color(t.border)
        .text_size(px(11.))
        .text_color(t.text_muted)
        .cursor_pointer()
        .hover(move |s| s.bg(hover_bg).text_color(hover_fg))
        .active(|s| s.opacity(0.85))
        .when_some(leading, |d, i| d.child(icon(i, 11., t.text_muted)))
        .child(label.into())
}

pub fn icon_button(id: impl Into<ElementId>, i: Icon, active: bool, danger_hover: bool) -> Stateful<Div> {
    let t = theme();
    let fg = if active { t.accent_strong } else { t.text_muted };
    let hover_bg = if danger_hover { t.danger_soft } else { t.surface_hover };
    let hover_fg = if danger_hover { t.danger } else { t.text };
    div()
        .id(id)
        .flex()
        .flex_none()
        .items_center()
        .justify_center()
        .size(px(28.))
        .rounded(px(7.))
        .text_color(fg)
        .cursor_pointer()
        .group("icon-button")
        .when(active, |d| d.bg(t.accent_soft).border_1().border_color(t.border_strong))
        .when(!active, move |d| d.hover(move |s| s.bg(hover_bg)))
        .active(|s| s.opacity(0.8))
        .child(
            icon(i, 15., fg).when(!active, move |svg| {
                svg.group_hover("icon-button", move |s| s.text_color(hover_fg))
            }),
        )
}

pub fn toggle_row(id: impl Into<ElementId>, label: impl Into<SharedString>, hint: Option<&str>, on: bool) -> Stateful<Div> {
    let t = theme();
    let track = if on { t.primary } else { t.surface_active };
    let knob = if on { t.on_primary } else { t.text_muted };
    div()
        .id(id)
        .flex()
        .items_center()
        .justify_between()
        .gap(px(10.))
        .w_full()
        .min_h(px(30.))
        .px(px(8.))
        .mx(px(-8.))
        .rounded(px(7.))
        .cursor_pointer()
        .hover(|s| s.bg(theme().surface_hover))
        .child(
            div()
                .flex()
                .flex_col()
                .child(div().text_size(px(12.)).text_color(t.text).child(label.into()))
                .when_some(hint.map(|h| SharedString::from(h.to_string())), |d, h| {
                    d.child(div().text_size(px(10.5)).text_color(t.text_faint).child(h))
                }),
        )
        .child(
            div()
                .flex()
                .flex_none()
                .items_center()
                .w(px(30.))
                .h(px(17.))
                .p(px(2.))
                .rounded_full()
                .bg(track)
                .border_1()
                .border_color(if on { t.primary_hover } else { t.border })
                .when(on, |d| d.justify_end().shadow(glow(t.primary.opacity(0.4), 6.)))
                .child(div().size(px(11.)).rounded_full().bg(knob).shadow(shadow_sm())),
        )
}

pub fn card() -> Div {
    let t = theme();
    div()
        .flex()
        .flex_col()
        .gap(px(6.))
        .w_full()
        .p(px(10.))
        .rounded(px(10.))
        .bg(t.surface)
        .border_1()
        .border_color(t.border)
}

pub fn section_label(text: impl Into<SharedString>) -> Div {
    let t = theme();
    div()
        .pt(px(6.))
        .pb(px(1.))
        .px(px(2.))
        .text_size(px(10.))
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(t.text_faint)
        .child(text.into().to_uppercase())
}

pub fn avatar(name: &str, size: f32) -> Div {
    let color = name_color(name);
    let initial: String = name
        .chars()
        .next()
        .map(|c| c.to_uppercase().collect())
        .unwrap_or_default();
    div()
        .flex()
        .flex_none()
        .items_center()
        .justify_center()
        .size(px(size))
        .rounded_full()
        .bg(color.opacity(0.16))
        .border_1()
        .border_color(color.opacity(0.35))
        .text_size(px(size * 0.46))
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(color)
        .child(initial)
}

pub fn status_dot(color: Hsla, pulse: bool) -> Div {
    div()
        .flex()
        .flex_none()
        .items_center()
        .justify_center()
        .size(px(10.))
        .rounded_full()
        .when(pulse, |d| d.bg(color.opacity(0.2)))
        .child(div().size(px(6.)).rounded_full().bg(color))
}

pub fn key_cap(text: impl Into<SharedString>) -> Div {
    let t = theme();
    div()
        .px(px(5.))
        .h(px(16.))
        .flex()
        .items_center()
        .rounded(px(4.))
        .bg(t.surface_hover)
        .border_1()
        .border_color(t.border)
        .border_b_2()
        .text_size(px(10.))
        .text_color(t.text_muted)
        .child(text.into())
}

pub fn progress_bar(fraction: f32) -> Div {
    let t = theme();
    div()
        .w_full()
        .h(px(6.))
        .rounded_full()
        .bg(t.surface_active)
        .overflow_hidden()
        .child(
            div()
                .h_full()
                .w(relative(fraction.clamp(0.0, 1.0)))
                .rounded_full()
                .bg(linear_gradient(
                    90.,
                    linear_color_stop(t.primary, 0.),
                    linear_color_stop(t.accent, 1.),
                )),
        )
}
