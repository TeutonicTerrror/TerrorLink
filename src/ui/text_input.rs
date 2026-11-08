use std::ops::Range;

use gpui::{
    actions, div, fill, point, prelude::*, px, relative, size, App, Bounds, ClipboardItem,
    ContentMask, Context, CursorStyle, ElementId, ElementInputHandler, Entity,
    EntityInputHandler, FocusHandle, Focusable, GlobalElementId, KeyBinding, LayoutId,
    MouseButton, MouseDownEvent, MouseMoveEvent, MouseUpEvent, PaintQuad, Pixels, Point,
    ShapedLine, SharedString, Style, Subscription, TextRun, UTF16Selection, UnderlineStyle,
    Window,
};
use unicode_segmentation::UnicodeSegmentation;

use crate::theme::{focus_ring, theme};

actions!(
    text_input,
    [
        Backspace,
        BackspaceWord,
        Delete,
        Left,
        Right,
        WordLeft,
        WordRight,
        SelectLeft,
        SelectRight,
        SelectWordLeft,
        SelectWordRight,
        SelectAll,
        Home,
        End,
        SelectHome,
        SelectEnd,
        Paste,
        Cut,
        Copy,
        Up,
        Down,
        Newline,
        Escape,
        Submit,
    ]
);

const CONTEXT: &str = "TextInput";

pub fn bind_keys(cx: &mut App) {
    cx.bind_keys([
        KeyBinding::new("backspace", Backspace, Some(CONTEXT)),
        KeyBinding::new("shift-backspace", Backspace, Some(CONTEXT)),
        KeyBinding::new("ctrl-backspace", BackspaceWord, Some(CONTEXT)),
        KeyBinding::new("delete", Delete, Some(CONTEXT)),
        KeyBinding::new("left", Left, Some(CONTEXT)),
        KeyBinding::new("right", Right, Some(CONTEXT)),
        KeyBinding::new("ctrl-left", WordLeft, Some(CONTEXT)),
        KeyBinding::new("ctrl-right", WordRight, Some(CONTEXT)),
        KeyBinding::new("shift-left", SelectLeft, Some(CONTEXT)),
        KeyBinding::new("shift-right", SelectRight, Some(CONTEXT)),
        KeyBinding::new("ctrl-shift-left", SelectWordLeft, Some(CONTEXT)),
        KeyBinding::new("ctrl-shift-right", SelectWordRight, Some(CONTEXT)),
        KeyBinding::new("ctrl-a", SelectAll, Some(CONTEXT)),
        KeyBinding::new("home", Home, Some(CONTEXT)),
        KeyBinding::new("end", End, Some(CONTEXT)),
        KeyBinding::new("shift-home", SelectHome, Some(CONTEXT)),
        KeyBinding::new("shift-end", SelectEnd, Some(CONTEXT)),
        KeyBinding::new("ctrl-v", Paste, Some(CONTEXT)),
        KeyBinding::new("shift-insert", Paste, Some(CONTEXT)),
        KeyBinding::new("ctrl-c", Copy, Some(CONTEXT)),
        KeyBinding::new("ctrl-x", Cut, Some(CONTEXT)),
        KeyBinding::new("enter", Submit, Some(CONTEXT)),
        KeyBinding::new("shift-enter", Newline, Some(CONTEXT)),
        KeyBinding::new("up", Up, Some(CONTEXT)),
        KeyBinding::new("down", Down, Some(CONTEXT)),
        KeyBinding::new("escape", Escape, Some(CONTEXT)),
    ]);
}

pub struct TextInput {
    focus_handle: FocusHandle,
    content: SharedString,
    placeholder: SharedString,
    max_len: Option<usize>,
    bare: bool,
    emoji: bool,
    multiline: bool,
    max_lines: usize,
    enter_newline: bool,
    markdown: bool,
    space_disables: bool,
    selected_range: Range<usize>,
    selection_reversed: bool,
    marked_range: Option<Range<usize>>,
    last_lines: Vec<(usize, ShapedLine)>,
    last_bounds: Option<Bounds<Pixels>>,
    last_line_height: Pixels,
    scroll_x: Pixels,
    scroll_y: Pixels,
    is_selecting: bool,
    _subscriptions: Vec<Subscription>,
}

impl TextInput {
    pub fn new(
        window: &mut Window,
        cx: &mut Context<Self>,
        placeholder: impl Into<SharedString>,
        initial: impl Into<SharedString>,
    ) -> Self {
        let focus_handle = cx.focus_handle();
        let subscriptions = vec![
            cx.on_focus(&focus_handle, window, |_, _, cx| cx.notify()),
            cx.on_blur(&focus_handle, window, |this: &mut Self, _, cx| {
                this.is_selecting = false;
                cx.notify()
            }),
        ];
        let content: SharedString = initial.into();
        let end = content.len();
        Self {
            focus_handle,
            content,
            placeholder: placeholder.into(),
            max_len: None,
            bare: false,
            emoji: false,
            multiline: false,
            max_lines: 6,
            enter_newline: false,
            markdown: false,
            space_disables: false,
            selected_range: end..end,
            selection_reversed: false,
            marked_range: None,
            last_lines: Vec::new(),
            last_bounds: None,
            last_line_height: px(18.),
            scroll_x: px(0.),
            scroll_y: px(0.),
            is_selecting: false,
            _subscriptions: subscriptions,
        }
    }

    pub fn max_len(mut self, len: usize) -> Self {
        self.max_len = Some(len);
        self
    }

    pub fn bare(mut self) -> Self {
        self.bare = true;
        self
    }

    pub fn emoji(mut self) -> Self {
        self.emoji = true;
        self
    }

    pub fn multiline(mut self) -> Self {
        self.multiline = true;
        self
    }

    pub fn notepad(mut self, lines: usize) -> Self {
        self.multiline = true;
        self.enter_newline = true;
        self.markdown = true;
        self.max_lines = lines;
        self
    }

    pub fn space_disables(mut self) -> Self {
        self.space_disables = true;
        self
    }

    fn expand_shortcode_before_cursor(&mut self) {
        let cursor = self.selected_range.end;
        let Some(body) = self.content[..cursor].strip_suffix(':') else {
            return;
        };
        let Some(start) = body.rfind(':') else {
            return;
        };
        let code = &body[start + 1..];
        if code.is_empty() || code.contains(char::is_whitespace) {
            return;
        }
        let Some(emoji) = emojis::get_by_shortcode(code) else {
            return;
        };
        let end = start + emoji.as_str().len();
        self.content = format!("{}{}{}", &body[..start], emoji.as_str(), &self.content[cursor..]).into();
        self.selected_range = end..end;
    }

    pub fn text(&self) -> String {
        self.content.to_string()
    }

    pub fn set_text(&mut self, text: impl Into<SharedString>, cx: &mut Context<Self>) {
        self.content = text.into();
        let end = self.content.len();
        self.selected_range = end..end;
        self.selection_reversed = false;
        self.marked_range = None;
        cx.notify();
    }

    pub fn clear(&mut self, cx: &mut Context<Self>) {
        self.set_text("", cx);
        self.scroll_x = px(0.);
        self.scroll_y = px(0.);
    }

    fn left(&mut self, _: &Left, _: &mut Window, cx: &mut Context<Self>) {
        if self.selected_range.is_empty() {
            self.move_to(self.previous_boundary(self.cursor_offset()), cx);
        } else {
            self.move_to(self.selected_range.start, cx)
        }
    }

    fn right(&mut self, _: &Right, _: &mut Window, cx: &mut Context<Self>) {
        if self.selected_range.is_empty() {
            self.move_to(self.next_boundary(self.selected_range.end), cx);
        } else {
            self.move_to(self.selected_range.end, cx)
        }
    }

    fn newline(&mut self, _: &Newline, window: &mut Window, cx: &mut Context<Self>) {
        if self.multiline {
            self.replace_text_in_range(None, "\n", window, cx);
        } else {
            cx.propagate();
        }
    }

    fn escape(&mut self, _: &Escape, _: &mut Window, cx: &mut Context<Self>) {
        cx.propagate();
    }

    fn submit(&mut self, _: &Submit, window: &mut Window, cx: &mut Context<Self>) {
        if self.enter_newline {
            self.replace_text_in_range(None, "\n", window, cx);
        } else {
            cx.propagate();
        }
    }

    fn up(&mut self, _: &Up, _: &mut Window, cx: &mut Context<Self>) {
        match self.vertical(-1) {
            Some(offset) => self.move_to(offset, cx),
            None => cx.propagate(),
        }
    }

    fn down(&mut self, _: &Down, _: &mut Window, cx: &mut Context<Self>) {
        match self.vertical(1) {
            Some(offset) => self.move_to(offset, cx),
            None => cx.propagate(),
        }
    }

    fn line_at(&self, offset: usize) -> usize {
        self.last_lines
            .iter()
            .rposition(|(start, _)| *start <= offset)
            .unwrap_or(0)
    }

    fn vertical(&self, delta: isize) -> Option<usize> {
        let cursor = self.cursor_offset();
        let from = self.line_at(cursor);
        let to = usize::try_from(from as isize + delta).ok()?;
        let (start, line) = self.last_lines.get(from)?;
        let (target_start, target) = self.last_lines.get(to)?;
        let x = line.x_for_index(cursor - start);
        Some(target_start + target.closest_index_for_x(x))
    }

    fn word_left(&mut self, _: &WordLeft, _: &mut Window, cx: &mut Context<Self>) {
        self.move_to(self.previous_word(self.cursor_offset()), cx);
    }

    fn word_right(&mut self, _: &WordRight, _: &mut Window, cx: &mut Context<Self>) {
        self.move_to(self.next_word(self.cursor_offset()), cx);
    }

    fn select_left(&mut self, _: &SelectLeft, _: &mut Window, cx: &mut Context<Self>) {
        self.select_to(self.previous_boundary(self.cursor_offset()), cx);
    }

    fn select_right(&mut self, _: &SelectRight, _: &mut Window, cx: &mut Context<Self>) {
        self.select_to(self.next_boundary(self.cursor_offset()), cx);
    }

    fn select_word_left(&mut self, _: &SelectWordLeft, _: &mut Window, cx: &mut Context<Self>) {
        self.select_to(self.previous_word(self.cursor_offset()), cx);
    }

    fn select_word_right(&mut self, _: &SelectWordRight, _: &mut Window, cx: &mut Context<Self>) {
        self.select_to(self.next_word(self.cursor_offset()), cx);
    }

    fn select_all(&mut self, _: &SelectAll, _: &mut Window, cx: &mut Context<Self>) {
        self.move_to(0, cx);
        self.select_to(self.content.len(), cx)
    }

    fn home(&mut self, _: &Home, _: &mut Window, cx: &mut Context<Self>) {
        self.move_to(0, cx);
    }

    fn end(&mut self, _: &End, _: &mut Window, cx: &mut Context<Self>) {
        self.move_to(self.content.len(), cx);
    }

    fn select_home(&mut self, _: &SelectHome, _: &mut Window, cx: &mut Context<Self>) {
        self.select_to(0, cx);
    }

    fn select_end(&mut self, _: &SelectEnd, _: &mut Window, cx: &mut Context<Self>) {
        self.select_to(self.content.len(), cx);
    }

    fn backspace(&mut self, _: &Backspace, window: &mut Window, cx: &mut Context<Self>) {
        if self.selected_range.is_empty() {
            self.select_to(self.previous_boundary(self.cursor_offset()), cx)
        }
        self.replace_text_in_range(None, "", window, cx)
    }

    fn backspace_word(&mut self, _: &BackspaceWord, window: &mut Window, cx: &mut Context<Self>) {
        if self.selected_range.is_empty() {
            self.select_to(self.previous_word(self.cursor_offset()), cx)
        }
        self.replace_text_in_range(None, "", window, cx)
    }

    fn delete(&mut self, _: &Delete, window: &mut Window, cx: &mut Context<Self>) {
        if self.selected_range.is_empty() {
            self.select_to(self.next_boundary(self.cursor_offset()), cx)
        }
        self.replace_text_in_range(None, "", window, cx)
    }

    fn on_mouse_down(&mut self, event: &MouseDownEvent, window: &mut Window, cx: &mut Context<Self>) {
        window.focus(&self.focus_handle);
        self.is_selecting = true;
        if event.click_count >= 2 {
            self.move_to(0, cx);
            self.select_to(self.content.len(), cx);
            return;
        }
        if event.modifiers.shift {
            self.select_to(self.index_for_mouse_position(event.position), cx);
        } else {
            self.move_to(self.index_for_mouse_position(event.position), cx)
        }
    }

    fn on_mouse_up(&mut self, _: &MouseUpEvent, _window: &mut Window, _: &mut Context<Self>) {
        self.is_selecting = false;
    }

    fn on_mouse_move(&mut self, event: &MouseMoveEvent, _: &mut Window, cx: &mut Context<Self>) {
        if self.is_selecting {
            self.select_to(self.index_for_mouse_position(event.position), cx);
        }
    }

    fn paste(&mut self, _: &Paste, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(text) = cx.read_from_clipboard().and_then(|item| item.text()) {
            let text = if self.multiline {
                text.replace("\r\n", "\n").replace('\r', "\n")
            } else {
                text.replace("\r\n", " ").replace(['\n', '\r'], " ")
            };
            self.replace_text_in_range(None, &text, window, cx);
        }
    }

    fn copy(&mut self, _: &Copy, _: &mut Window, cx: &mut Context<Self>) {
        if !self.selected_range.is_empty() {
            cx.write_to_clipboard(ClipboardItem::new_string(
                self.content[self.selected_range.clone()].to_string(),
            ));
        }
    }

    fn cut(&mut self, _: &Cut, window: &mut Window, cx: &mut Context<Self>) {
        if !self.selected_range.is_empty() {
            cx.write_to_clipboard(ClipboardItem::new_string(
                self.content[self.selected_range.clone()].to_string(),
            ));
            self.replace_text_in_range(None, "", window, cx)
        }
    }

    fn move_to(&mut self, offset: usize, cx: &mut Context<Self>) {
        self.selected_range = offset..offset;
        self.selection_reversed = false;
        cx.notify()
    }

    fn cursor_offset(&self) -> usize {
        if self.selection_reversed {
            self.selected_range.start
        } else {
            self.selected_range.end
        }
    }

    fn index_for_mouse_position(&self, position: Point<Pixels>) -> usize {
        if self.content.is_empty() {
            return 0;
        }
        let Some(bounds) = self.last_bounds else {
            return 0;
        };
        let row = ((position.y - bounds.top() + self.scroll_y) / self.last_line_height).floor();
        let row = (row.max(0.) as usize).min(self.last_lines.len().saturating_sub(1));
        let Some((start, line)) = self.last_lines.get(row) else {
            return 0;
        };
        start + line.closest_index_for_x(position.x - bounds.left() + self.scroll_x)
    }

    fn select_to(&mut self, offset: usize, cx: &mut Context<Self>) {
        if self.selection_reversed {
            self.selected_range.start = offset
        } else {
            self.selected_range.end = offset
        };
        if self.selected_range.end < self.selected_range.start {
            self.selection_reversed = !self.selection_reversed;
            self.selected_range = self.selected_range.end..self.selected_range.start;
        }
        cx.notify()
    }

    fn offset_from_utf16(&self, offset: usize) -> usize {
        let mut utf8_offset = 0;
        let mut utf16_count = 0;
        for ch in self.content.chars() {
            if utf16_count >= offset {
                break;
            }
            utf16_count += ch.len_utf16();
            utf8_offset += ch.len_utf8();
        }
        utf8_offset
    }

    fn offset_to_utf16(&self, offset: usize) -> usize {
        let mut utf16_offset = 0;
        let mut utf8_count = 0;
        for ch in self.content.chars() {
            if utf8_count >= offset {
                break;
            }
            utf8_count += ch.len_utf8();
            utf16_offset += ch.len_utf16();
        }
        utf16_offset
    }

    fn range_to_utf16(&self, range: &Range<usize>) -> Range<usize> {
        self.offset_to_utf16(range.start)..self.offset_to_utf16(range.end)
    }

    fn range_from_utf16(&self, range_utf16: &Range<usize>) -> Range<usize> {
        self.offset_from_utf16(range_utf16.start)..self.offset_from_utf16(range_utf16.end)
    }

    fn previous_boundary(&self, offset: usize) -> usize {
        self.content
            .grapheme_indices(true)
            .rev()
            .find_map(|(idx, _)| (idx < offset).then_some(idx))
            .unwrap_or(0)
    }

    fn next_boundary(&self, offset: usize) -> usize {
        self.content
            .grapheme_indices(true)
            .find_map(|(idx, _)| (idx > offset).then_some(idx))
            .unwrap_or(self.content.len())
    }

    fn previous_word(&self, offset: usize) -> usize {
        self.content
            .split_word_bound_indices()
            .rev()
            .find_map(|(idx, word)| {
                (idx < offset && !word.trim().is_empty()).then_some(idx)
            })
            .unwrap_or(0)
    }

    fn next_word(&self, offset: usize) -> usize {
        self.content
            .split_word_bound_indices()
            .find_map(|(idx, word)| {
                let end = idx + word.len();
                (end > offset && !word.trim().is_empty()).then_some(end)
            })
            .unwrap_or(self.content.len())
    }

    fn clamp_insert<'a>(&self, range: &Range<usize>, new_text: &'a str) -> std::borrow::Cow<'a, str> {
        let Some(max) = self.max_len else {
            return new_text.into();
        };
        let kept = self.content[..range.start].chars().count()
            + self.content[range.end..].chars().count();
        let room = max.saturating_sub(kept);
        if new_text.chars().count() <= room {
            new_text.into()
        } else {
            new_text.chars().take(room).collect::<String>().into()
        }
    }
}

impl EntityInputHandler for TextInput {
    fn text_for_range(
        &mut self,
        range_utf16: Range<usize>,
        actual_range: &mut Option<Range<usize>>,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<String> {
        let range = self.range_from_utf16(&range_utf16);
        actual_range.replace(self.range_to_utf16(&range));
        Some(self.content[range].to_string())
    }

    fn selected_text_range(
        &mut self,
        _ignore_disabled_input: bool,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<UTF16Selection> {
        Some(UTF16Selection {
            range: self.range_to_utf16(&self.selected_range),
            reversed: self.selection_reversed,
        })
    }

    fn marked_text_range(&self, _window: &mut Window, _cx: &mut Context<Self>) -> Option<Range<usize>> {
        self.marked_range
            .as_ref()
            .map(|range| self.range_to_utf16(range))
    }

    fn unmark_text(&mut self, _window: &mut Window, _cx: &mut Context<Self>) {
        self.marked_range = None;
    }

    fn replace_text_in_range(
        &mut self,
        range_utf16: Option<Range<usize>>,
        new_text: &str,
        _: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let mut range = range_utf16
            .as_ref()
            .map(|range_utf16| self.range_from_utf16(range_utf16))
            .or(self.marked_range.clone())
            .unwrap_or(self.selected_range.clone());
        if self.space_disables {
            if new_text == " " {
                self.set_text("DISABLED", cx);
                return;
            }
            if self.content == "DISABLED" {
                range = 0..self.content.len();
            }
        }
        let new_text = self.clamp_insert(&range, new_text);
        self.content =
            (self.content[0..range.start].to_owned() + &new_text + &self.content[range.end..])
                .into();
        self.selected_range = range.start + new_text.len()..range.start + new_text.len();
        self.selection_reversed = false;
        self.marked_range.take();
        if self.emoji && new_text.ends_with(':') {
            self.expand_shortcode_before_cursor();
        }
        cx.notify();
    }

    fn replace_and_mark_text_in_range(
        &mut self,
        range_utf16: Option<Range<usize>>,
        new_text: &str,
        new_selected_range_utf16: Option<Range<usize>>,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let range = range_utf16
            .as_ref()
            .map(|range_utf16| self.range_from_utf16(range_utf16))
            .or(self.marked_range.clone())
            .unwrap_or(self.selected_range.clone());
        self.content =
            (self.content[0..range.start].to_owned() + new_text + &self.content[range.end..])
                .into();
        if !new_text.is_empty() {
            self.marked_range = Some(range.start..range.start + new_text.len());
        } else {
            self.marked_range = None;
        }
        self.selected_range = new_selected_range_utf16
            .as_ref()
            .map(|range_utf16| self.range_from_utf16(range_utf16))
            .map(|new_range| new_range.start + range.start..new_range.end + range.end)
            .unwrap_or_else(|| range.start + new_text.len()..range.start + new_text.len());
        cx.notify();
    }

    fn bounds_for_range(
        &mut self,
        range_utf16: Range<usize>,
        bounds: Bounds<Pixels>,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<Bounds<Pixels>> {
        let range = self.range_from_utf16(&range_utf16);
        let row = self.line_at(range.start);
        let (start, line) = self.last_lines.get(row)?;
        let left = bounds.left() - self.scroll_x;
        let top = bounds.top() + self.last_line_height * row as f32 - self.scroll_y;
        let end = range.end.clamp(*start, start + line.text.len());
        Some(Bounds::from_corners(
            point(left + line.x_for_index(range.start - start), top),
            point(left + line.x_for_index(end - start), top + self.last_line_height),
        ))
    }

    fn character_index_for_point(
        &mut self,
        point: Point<Pixels>,
        _window: &mut Window,
        _cx: &mut Context<Self>,
    ) -> Option<usize> {
        self.last_bounds?;
        Some(self.offset_to_utf16(self.index_for_mouse_position(point)))
    }
}

struct TextElement {
    input: Entity<TextInput>,
}

struct PrepaintState {
    lines: Vec<(usize, ShapedLine)>,
    cursor: Option<PaintQuad>,
    selections: Vec<PaintQuad>,
    scroll_x: Pixels,
    scroll_y: Pixels,
}

impl IntoElement for TextElement {
    type Element = Self;

    fn into_element(self) -> Self::Element {
        self
    }
}

impl Element for TextElement {
    type RequestLayoutState = ();
    type PrepaintState = PrepaintState;

    fn id(&self) -> Option<ElementId> {
        None
    }

    fn source_location(&self) -> Option<&'static core::panic::Location<'static>> {
        None
    }

    fn request_layout(
        &mut self,
        _id: Option<&GlobalElementId>,
        _inspector_id: Option<&gpui::InspectorElementId>,
        window: &mut Window,
        cx: &mut App,
    ) -> (LayoutId, Self::RequestLayoutState) {
        let input = self.input.read(cx);
        let lines = input.content.split('\n').count().min(input.max_lines);
        let mut style = Style::default();
        style.size.width = relative(1.).into();
        style.size.height = (window.line_height() * lines as f32).into();
        (window.request_layout(style, [], cx), ())
    }

    fn prepaint(
        &mut self,
        _id: Option<&GlobalElementId>,
        _inspector_id: Option<&gpui::InspectorElementId>,
        bounds: Bounds<Pixels>,
        _request_layout: &mut Self::RequestLayoutState,
        window: &mut Window,
        cx: &mut App,
    ) -> Self::PrepaintState {
        let t = theme();
        let input = self.input.read(cx);
        let content = input.content.clone();
        let selected_range = input.selected_range.clone();
        let cursor = if content.is_empty() { 0 } else { input.cursor_offset() };
        let focused = input.focus_handle.is_focused(window);
        let style = window.text_style();
        let line_height = window.line_height();
        let font_size = style.font_size.to_pixels(window.rem_size());

        let (display_text, text_color) = if content.is_empty() {
            (input.placeholder.clone(), t.text_faint)
        } else {
            (content.clone(), style.color)
        };
        let marked = input.marked_range.clone().filter(|_| !content.is_empty());

        let mut lines = Vec::new();
        let mut start = 0;
        for text in display_text.split('\n') {
            let end = start + text.len();
            let run = |len: usize, underline: bool| TextRun {
                len,
                font: style.font(),
                color: text_color,
                background_color: None,
                underline: underline.then(|| UnderlineStyle {
                    color: Some(text_color),
                    thickness: px(1.0),
                    wavy: false,
                }),
                strikethrough: None,
            };
            let runs: Vec<TextRun> = match &marked {
                Some(m) if m.start < end && m.end > start => {
                    let (a, b) = (m.start.max(start) - start, m.end.min(end) - start);
                    [run(a, false), run(b - a, true), run(text.len() - b, false)]
                        .into_iter()
                        .filter(|run| run.len > 0)
                        .collect()
                }
                _ if input.markdown && !content.is_empty() => {
                    crate::ui::markdown::editing_runs(text, run(text.len(), false), t.surface_active, t.text_faint)
                }
                _ => vec![run(text.len(), false)],
            };
            let line = window.text_system().shape_line(
                SharedString::from(text.to_string()),
                font_size,
                &runs,
                None,
            );
            lines.push((start, line));
            start = end + 1;
        }

        let row = lines.iter().rposition(|(s, _)| *s <= cursor).unwrap_or(0);
        let cursor_x = lines[row].1.x_for_index(cursor - lines[row].0);
        let cursor_y = line_height * row as f32;
        let margin = px(2.);
        let widest = lines.iter().map(|(_, l)| l.width).fold(px(0.), |a, b| a.max(b));
        let mut scroll_x = if focused { input.scroll_x } else { px(0.) };
        let mut scroll_y = input.scroll_y;
        if focused {
            if cursor_x - scroll_x > bounds.size.width - margin {
                scroll_x = cursor_x - bounds.size.width + margin;
            }
            if cursor_x < scroll_x {
                scroll_x = cursor_x;
            }
            if cursor_y + line_height - scroll_y > bounds.size.height {
                scroll_y = cursor_y + line_height - bounds.size.height;
            }
            if cursor_y < scroll_y {
                scroll_y = cursor_y;
            }
        }
        scroll_x = scroll_x.min((widest - bounds.size.width + margin).max(px(0.))).max(px(0.));
        let total = line_height * lines.len() as f32;
        scroll_y = scroll_y.min((total - bounds.size.height).max(px(0.))).max(px(0.));

        let left = bounds.left() - scroll_x;
        let top = |row: usize| bounds.top() + line_height * row as f32 - scroll_y;
        let mut selections = Vec::new();
        let caret = if selected_range.is_empty() || content.is_empty() {
            focused.then(|| {
                fill(
                    Bounds::new(
                        point(left + cursor_x, top(row) + px(1.)),
                        size(px(1.5), line_height - px(2.)),
                    ),
                    t.accent_strong,
                )
            })
        } else {
            for (i, (start, line)) in lines.iter().enumerate() {
                let end = start + line.text.len();
                if selected_range.end < *start || selected_range.start > end {
                    continue;
                }
                let a = selected_range.start.max(*start) - start;
                let b = selected_range.end.min(end) - start;
                let tail = if selected_range.end > end { px(4.) } else { px(0.) };
                selections.push(fill(
                    Bounds::from_corners(
                        point(left + line.x_for_index(a), top(i)),
                        point(left + line.x_for_index(b) + tail, top(i) + line_height),
                    ),
                    t.accent_ring,
                ));
            }
            None
        };
        PrepaintState {
            lines,
            cursor: caret,
            selections,
            scroll_x,
            scroll_y,
        }
    }

    fn paint(
        &mut self,
        _id: Option<&GlobalElementId>,
        _inspector_id: Option<&gpui::InspectorElementId>,
        bounds: Bounds<Pixels>,
        _request_layout: &mut Self::RequestLayoutState,
        prepaint: &mut Self::PrepaintState,
        window: &mut Window,
        cx: &mut App,
    ) {
        let focus_handle = self.input.read(cx).focus_handle.clone();
        window.handle_input(
            &focus_handle,
            ElementInputHandler::new(bounds, self.input.clone()),
            cx,
        );
        let (scroll_x, scroll_y) = (prepaint.scroll_x, prepaint.scroll_y);
        let lines = std::mem::take(&mut prepaint.lines);
        let line_height = window.line_height();
        window.with_content_mask(
            Some(ContentMask {
                bounds: bounds.extend(gpui::Edges {
                    top: px(0.),
                    bottom: px(0.),
                    left: px(0.),
                    right: px(2.),
                }),
            }),
            |window| {
                for selection in prepaint.selections.drain(..) {
                    window.paint_quad(selection)
                }
                for (row, (_, line)) in lines.iter().enumerate() {
                    let origin = point(
                        bounds.left() - scroll_x,
                        bounds.top() + line_height * row as f32 - scroll_y,
                    );
                    line.paint(origin, line_height, window, cx).ok();
                }
                if let Some(cursor) = prepaint.cursor.take() {
                    window.paint_quad(cursor);
                }
            },
        );
        self.input.update(cx, |input, _cx| {
            input.last_lines = lines;
            input.last_bounds = Some(bounds);
            input.last_line_height = line_height;
            input.scroll_x = scroll_x;
            input.scroll_y = scroll_y;
        });
    }
}

impl Render for TextInput {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let t = theme();
        let focused = self.focus_handle.is_focused(window);
        let bare = self.bare;
        div()
            .flex()
            .items_center()
            .w_full()
            .min_h(px(30.))
            .py(px(6.))
            .px(px(if bare { 4. } else { 9. }))
            .when(!bare, |d| {
                d.rounded(px(8.))
                    .bg(t.input_bg)
                    .border_1()
                    .border_color(if focused { t.accent } else { t.border })
                    .when(focused, |d| d.shadow(focus_ring()))
                    .when(!focused, |d| d.hover(|s| s.border_color(t.border_strong)))
            })
            .key_context(CONTEXT)
            .track_focus(&self.focus_handle)
            .cursor(CursorStyle::IBeam)
            .on_action(cx.listener(Self::backspace))
            .on_action(cx.listener(Self::backspace_word))
            .on_action(cx.listener(Self::delete))
            .on_action(cx.listener(Self::left))
            .on_action(cx.listener(Self::right))
            .on_action(cx.listener(Self::word_left))
            .on_action(cx.listener(Self::word_right))
            .on_action(cx.listener(Self::select_left))
            .on_action(cx.listener(Self::select_right))
            .on_action(cx.listener(Self::select_word_left))
            .on_action(cx.listener(Self::select_word_right))
            .on_action(cx.listener(Self::select_all))
            .on_action(cx.listener(Self::home))
            .on_action(cx.listener(Self::end))
            .on_action(cx.listener(Self::select_home))
            .on_action(cx.listener(Self::select_end))
            .on_action(cx.listener(Self::paste))
            .on_action(cx.listener(Self::cut))
            .on_action(cx.listener(Self::copy))
            .on_action(cx.listener(Self::newline))
            .on_action(cx.listener(Self::submit))
            .on_action(cx.listener(Self::escape))
            .on_action(cx.listener(Self::up))
            .on_action(cx.listener(Self::down))
            .on_mouse_down(MouseButton::Left, cx.listener(Self::on_mouse_down))
            .on_mouse_up(MouseButton::Left, cx.listener(Self::on_mouse_up))
            .on_mouse_up_out(MouseButton::Left, cx.listener(Self::on_mouse_up))
            .on_mouse_move(cx.listener(Self::on_mouse_move))
            .text_size(px(12.5))
            .line_height(px(18.))
            .text_color(t.text)
            .child(
                div()
                    .flex_1()
                    .min_w(px(0.))
                    .overflow_hidden()
                    .child(TextElement { input: cx.entity() }),
            )
    }
}

impl Focusable for TextInput {
    fn focus_handle(&self, _: &App) -> FocusHandle {
        self.focus_handle.clone()
    }
}
