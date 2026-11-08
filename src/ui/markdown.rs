use std::ops::Range;

use gpui::{
    px, FontStyle, FontWeight, HighlightStyle, Hsla, StrikethroughStyle, StyledText, TextRun,
    UnderlineStyle,
};

#[derive(Clone, Copy, PartialEq, Debug)]
enum Mark {
    Bold,
    Italic,
    Underline,
    Strike,
    Code,
    Mention,
}

const MARKERS: [(&str, Mark); 5] = [
    ("**", Mark::Bold),
    ("__", Mark::Underline),
    ("~~", Mark::Strike),
    ("`", Mark::Code),
    ("*", Mark::Italic),
];

fn parse(src: &str) -> (String, Vec<(Range<usize>, Mark)>) {
    let mut out = String::with_capacity(src.len());
    let mut marks = Vec::new();
    for (i, line) in src.split('\n').enumerate() {
        if i > 0 {
            out.push('\n');
        }
        let line = line.strip_prefix("> ").unwrap_or(line);
        let heading = line.trim_start_matches('#');
        if heading.len() < line.len() && heading.starts_with(' ') {
            let start = out.len();
            inline(heading.trim_start(), &mut out, &mut marks);
            marks.push((start..out.len(), Mark::Bold));
            continue;
        }
        let line = match line.strip_prefix("- ").or_else(|| line.strip_prefix("* ")) {
            Some(rest) => {
                out.push_str("• ");
                rest
            }
            None => line,
        };
        inline(line, &mut out, &mut marks);
    }
    (out, marks)
}

fn match_at(rest: &str) -> Option<(usize, Mark, &str)> {
    MARKERS.into_iter().find_map(|(marker, mark)| {
        let after = rest.strip_prefix(marker)?;
        let inner = &after[..after.find(marker)?];
        (!inner.is_empty() && (mark == Mark::Code || inner.trim() == inner)).then_some((marker.len(), mark, inner))
    })
}

fn inline(src: &str, out: &mut String, marks: &mut Vec<(Range<usize>, Mark)>) {
    let mut i = 0;
    while i < src.len() {
        let rest = &src[i..];
        if let Some(len) = mention_len(src, i) {
            let start = out.len();
            out.push_str(&rest[..len]);
            marks.push((start..out.len(), Mark::Mention));
            i += len;
            continue;
        }
        if let Some((len, mark, inner)) = match_at(rest) {
            let start = out.len();
            if mark == Mark::Code {
                out.push_str(inner);
            } else {
                inline(inner, out, marks);
            }
            marks.push((start..out.len(), mark));
            i += len * 2 + inner.len();
            continue;
        }
        let ch = rest.chars().next().expect("non-empty");
        out.push(ch);
        i += ch.len_utf8();
    }
}

fn source_spans(src: &str, base: usize, spans: &mut Vec<(Range<usize>, Option<Mark>)>) {
    let mut i = 0;
    while i < src.len() {
        if let Some((len, mark, inner)) = match_at(&src[i..]) {
            let inner_start = base + i + len;
            let inner_end = inner_start + inner.len();
            spans.push((base + i..inner_start, None));
            spans.push((inner_end..inner_end + len, None));
            spans.push((inner_start..inner_end, Some(mark)));
            if mark != Mark::Code {
                source_spans(inner, inner_start, spans);
            }
            i += len * 2 + inner.len();
            continue;
        }
        i += src[i..].chars().next().map_or(1, char::len_utf8);
    }
}

pub fn editing_runs(line: &str, base: TextRun, code_bg: Hsla, dim: Hsla) -> Vec<TextRun> {
    let mut spans = Vec::new();
    source_spans(line, 0, &mut spans);
    let mut cuts: Vec<usize> = spans.iter().flat_map(|(r, _)| [r.start, r.end]).collect();
    cuts.extend([0, line.len()]);
    cuts.sort_unstable();
    cuts.dedup();
    cuts.windows(2)
        .map(|w| {
            let mut run = TextRun { len: w[1] - w[0], ..base.clone() };
            for (_, mark) in spans.iter().filter(|(r, _)| r.start <= w[0] && w[1] <= r.end) {
                match mark {
                    None => run.color = dim,
                    Some(Mark::Bold) => run.font.weight = FontWeight::BOLD,
                    Some(Mark::Italic) => run.font.style = FontStyle::Italic,
                    Some(Mark::Underline) => {
                        run.underline = Some(UnderlineStyle { thickness: px(1.), ..Default::default() })
                    }
                    Some(Mark::Strike) => {
                        run.strikethrough = Some(StrikethroughStyle { thickness: px(1.), ..Default::default() })
                    }
                    Some(Mark::Code) => run.background_color = Some(code_bg),
                    Some(Mark::Mention) => {}
                }
            }
            run
        })
        .collect()
}

fn style(mark: Mark, code_bg: Hsla) -> HighlightStyle {
    match mark {
        Mark::Bold => HighlightStyle {
            font_weight: Some(FontWeight::BOLD),
            ..Default::default()
        },
        Mark::Italic => HighlightStyle {
            font_style: Some(FontStyle::Italic),
            ..Default::default()
        },
        Mark::Underline => HighlightStyle {
            underline: Some(UnderlineStyle {
                thickness: px(1.),
                ..Default::default()
            }),
            ..Default::default()
        },
        Mark::Strike => HighlightStyle {
            strikethrough: Some(StrikethroughStyle {
                thickness: px(1.),
                ..Default::default()
            }),
            ..Default::default()
        },
        Mark::Code => HighlightStyle {
            background_color: Some(code_bg),
            ..Default::default()
        },
        Mark::Mention => HighlightStyle {
            color: Some(crate::theme::theme().accent_strong),
            font_weight: Some(FontWeight::SEMIBOLD),
            background_color: Some(crate::theme::theme().accent_soft),
            ..Default::default()
        },
    }
}

fn is_name_char(c: char) -> bool {
    c.is_alphanumeric() || matches!(c, '_' | '-' | '.')
}

fn mention_len(src: &str, at: usize) -> Option<usize> {
    let rest = src[at..].strip_prefix('@')?;
    if src[..at].chars().next_back().is_some_and(|c| !c.is_whitespace()) {
        return None;
    }
    let name = rest.find(|c: char| !is_name_char(c)).unwrap_or(rest.len());
    (name > 0).then_some(name + 1)
}

pub fn mentions(text: &str, name: &str) -> bool {
    let name = name.trim().to_lowercase();
    if name.is_empty() {
        return false;
    }
    let text = text.to_lowercase();
    let needle = format!("@{name}");
    text.match_indices(&needle).any(|(at, _)| {
        let before = text[..at].chars().next_back().is_none_or(char::is_whitespace);
        let after = text[at + needle.len()..].chars().next().is_none_or(|c| !is_name_char(c));
        before && after
    })
}

pub fn render(text: &str, code_bg: Hsla) -> StyledText {
    let (out, marks) = parse(text);
    let mut cuts: Vec<usize> = marks.iter().flat_map(|(r, _)| [r.start, r.end]).collect();
    cuts.sort_unstable();
    cuts.dedup();
    let highlights: Vec<(Range<usize>, HighlightStyle)> = cuts
        .windows(2)
        .filter_map(|w| {
            let seg = w[0]..w[1];
            marks
                .iter()
                .filter(|(r, _)| r.start <= seg.start && seg.end <= r.end)
                .map(|(_, m)| style(*m, code_bg))
                .reduce(|a, b| a.highlight(b))
                .map(|s| (seg, s))
        })
        .collect();
    StyledText::new(out).with_highlights(highlights)
}

#[cfg(test)]
mod tests {
    use super::{parse, Mark};

    #[test]
    fn parses_marks_and_leaves_stray_markers() {
        let (out, marks) = parse("**b** *i* __u__ ~~s~~ `c`");
        assert_eq!(out, "b i u s c");
        let kinds: Vec<Mark> = marks.iter().map(|(_, m)| *m).collect();
        assert_eq!(kinds, [Mark::Bold, Mark::Italic, Mark::Underline, Mark::Strike, Mark::Code]);
        assert_eq!(parse("2 * 3 * 4").0, "2 * 3 * 4");
        assert_eq!(parse("snake_case_name").0, "snake_case_name");
        assert_eq!(parse("- one\n* two").0, "• one\n• two");
        assert_eq!(parse("## Fixes\n> note").0, "Fixes\nnote");
        let (out, marks) = parse("__under **both**__");
        assert_eq!(out, "under both");
        assert_eq!(marks.len(), 2);

        let mut spans = Vec::new();
        super::source_spans("**b** x", 0, &mut spans);
        assert!(spans.contains(&(0..2, None)) && spans.contains(&(3..5, None)));
        assert!(spans.contains(&(2..3, Some(Mark::Bold))));

        let (out, marks) = parse("hi @Teutonic! mail@x.com");
        assert_eq!(out, "hi @Teutonic! mail@x.com");
        assert_eq!(marks, [(3..12, Mark::Mention)]);
        assert!(super::mentions("hey @teutonic, look", "Teutonic"));
        assert!(!super::mentions("hey @teutonics", "Teutonic"));
        assert!(!super::mentions("mail@teutonic", "Teutonic"));
    }
}
