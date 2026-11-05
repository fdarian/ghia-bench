mod data;
mod input;
#[cfg(feature = "snapshot")]
mod snapshot;

use gpui::{
    actions, div, point, prelude::*, px, rgb, size, uniform_list, App, Bounds, Context, Entity,
    FocusHandle, Focusable, FontWeight, KeyBinding, Rgba, ScrollHandle, ScrollStrategy,
    SharedString, TitlebarOptions, UniformListScrollHandle, Window, WindowBounds, WindowOptions,
};
use gpui_platform::application;

use data::Message;
use input::{InputChanged, TextInput};

actions!(mailbox, [SelectNext, SelectPrevious, ClearSearch, Quit]);

const BORDER: u32 = 0xE4E4E7;
const MUTED: u32 = 0x71717A;
const FOLDERS: [(&str, Option<usize>); 7] = [
    ("Inbox", None),
    ("Starred", Some(24)),
    ("Sent", Some(128)),
    ("Drafts", Some(3)),
    ("Archive", Some(2048)),
    ("Spam", Some(12)),
    ("Trash", Some(0)),
];
const LABELS: [(&str, u32); 8] = [
    ("Work", 0x2563EB),
    ("Personal", 0x16A34A),
    ("Finance", 0xCA8A04),
    ("Travel", 0x9333EA),
    ("Family", 0xDB2777),
    ("Receipts", 0xEA580C),
    ("Newsletters", 0x0891B2),
    ("Projects", 0x4F46E5),
];

struct Mailbox {
    messages: Vec<Message>,
    unread_count: usize,
    /// Indices into `messages` that match the current query.
    filtered: Vec<usize>,
    /// Position in `filtered`.
    selected: Option<usize>,
    search: Entity<TextInput>,
    list_scroll: UniformListScrollHandle,
    detail_scroll: ScrollHandle,
    _search_subscription: gpui::Subscription,
}

impl Mailbox {
    fn new(messages: Vec<Message>, cx: &mut Context<Self>) -> Self {
        let search = cx.new(|cx| TextInput::new("Search mail", cx));
        let subscription = cx.subscribe(&search, |this, search, _: &InputChanged, cx| {
            let query = search.read(cx).content().to_owned();
            this.apply_filter(&query, cx);
        });
        let unread_count = messages.iter().filter(|m| m.unread).count();
        Mailbox {
            filtered: (0..messages.len()).collect(),
            selected: Some(0),
            unread_count,
            messages,
            search,
            list_scroll: UniformListScrollHandle::new(),
            detail_scroll: ScrollHandle::new(),
            _search_subscription: subscription,
        }
    }

    fn apply_filter(&mut self, query: &str, cx: &mut Context<Self>) {
        let query = query.trim().to_lowercase();
        self.filtered = if query.is_empty() {
            (0..self.messages.len()).collect()
        } else {
            self.messages
                .iter()
                .enumerate()
                .filter(|(_, message)| message.haystack.contains(&query))
                .map(|(ix, _)| ix)
                .collect()
        };
        self.selected = if self.filtered.is_empty() { None } else { Some(0) };
        self.list_scroll.0.borrow().base_handle.set_offset(point(px(0.), px(0.)));
        self.detail_scroll.set_offset(point(px(0.), px(0.)));
        cx.notify();
    }

    fn select(&mut self, position: usize, cx: &mut Context<Self>) {
        self.selected = Some(position);
        self.detail_scroll.set_offset(point(px(0.), px(0.)));
        cx.notify();
    }

    fn move_selection(&mut self, delta: isize, cx: &mut Context<Self>) {
        let Some(selected) = self.selected else {
            return;
        };
        let last = self.filtered.len() - 1;
        let next = selected.saturating_add_signed(delta).min(last);
        self.select(next, cx);
        self.list_scroll.scroll_to_item(next, ScrollStrategy::Nearest);
    }

    fn select_next(&mut self, _: &SelectNext, _: &mut Window, cx: &mut Context<Self>) {
        self.move_selection(1, cx);
    }

    fn select_previous(&mut self, _: &SelectPrevious, _: &mut Window, cx: &mut Context<Self>) {
        self.move_selection(-1, cx);
    }

    fn clear_search(&mut self, _: &ClearSearch, _: &mut Window, cx: &mut Context<Self>) {
        self.search.update(cx, |search, cx| search.clear(cx));
    }

    fn render_sidebar(&self) -> impl IntoElement {
        div()
            .flex()
            .flex_col()
            .flex_none()
            .w(px(220.))
            .h_full()
            .bg(rgb(0xF4F4F5))
            .border_r_1()
            .border_color(rgb(BORDER))
            .child(
                div()
                    .flex()
                    .items_center()
                    .flex_none()
                    .h(px(48.))
                    .pl(px(16.))
                    .text_size(px(15.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(rgb(0x18181B))
                    .child("Mailbox"),
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .mt(px(8.))
                    .px(px(8.))
                    .children(FOLDERS.iter().map(|(name, count)| {
                        let count = match count {
                            None => Some(self.unread_count),
                            Some(0) => None,
                            Some(count) => Some(*count),
                        };
                        let row = div()
                            .id(*name)
                            .flex()
                            .items_center()
                            .justify_between()
                            .h(px(32.))
                            .px(px(8.))
                            .rounded(px(6.))
                            .text_size(px(13.))
                            .line_height(px(18.))
                            .text_color(rgb(0x27272A))
                            .child(*name)
                            .children(count.map(|count| {
                                div().text_size(px(12.)).text_color(rgb(MUTED)).child(with_thousands(count))
                            }));
                        if *name == "Inbox" {
                            row.bg(rgb(BORDER))
                        } else {
                            row.hover(|style| style.bg(rgb(0xEBEBED)))
                        }
                    })),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .mt(px(16.))
                    .h(px(24.))
                    .pl(px(16.))
                    .text_size(px(11.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(rgb(0xA1A1AA))
                    .child("LABELS"),
            )
            .child(div().flex().flex_col().px(px(8.)).children(LABELS.iter().map(
                |(name, color)| {
                    div()
                        .flex()
                        .items_center()
                        .gap(px(8.))
                        .h(px(28.))
                        .px(px(8.))
                        .text_size(px(13.))
                        .line_height(px(18.))
                        .text_color(rgb(0x3F3F46))
                        .child(div().flex_none().size(px(8.)).rounded_full().bg(rgb(*color)))
                        .child(*name)
                },
            )))
    }

    fn render_row(&self, position: usize, cx: &mut Context<Self>) -> impl IntoElement {
        let message = &self.messages[self.filtered[position]];
        let selected = self.selected == Some(position);
        div()
            .id(position)
            .relative()
            .flex_none()
            .w_full()
            .h(px(72.))
            .bg(if selected { rgb(0xDBEAFE) } else { rgb(0xFFFFFF) })
            .when(!selected, |row| row.hover(|style| style.bg(rgb(0xF4F4F5))))
            .on_click(cx.listener(move |this, _, _, cx| this.select(position, cx)))
            .when(message.unread, |row| {
                row.child(
                    div()
                        .absolute()
                        .left(px(4.))
                        .top(px(17.))
                        .size(px(8.))
                        .rounded_full()
                        .bg(rgb(0x2563EB)),
                )
            })
            .child(
                avatar(36., 13., message.avatar, message.initials.clone())
                    .absolute()
                    .left(px(16.))
                    .top(px(12.)),
            )
            .child(
                div()
                    .absolute()
                    .left(px(64.))
                    .right(px(16.))
                    .top(px(12.))
                    .flex()
                    .flex_col()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .h(px(18.))
                            .text_size(px(13.))
                            .line_height(px(18.))
                            .child(
                                div()
                                    .truncate()
                                    .min_w_0()
                                    .when(message.unread, |name| {
                                        name.font_weight(FontWeight::SEMIBOLD)
                                            .text_color(rgb(0x18181B))
                                    })
                                    .when(!message.unread, |name| {
                                        name.font_weight(FontWeight::MEDIUM)
                                            .text_color(rgb(0x3F3F46))
                                    })
                                    .child(message.from_name.clone()),
                            )
                            .child(
                                div()
                                    .flex_none()
                                    .pl(px(8.))
                                    .text_size(px(12.))
                                    .text_color(rgb(MUTED))
                                    .child(message.time.clone()),
                            ),
                    )
                    .child(
                        div()
                            .truncate()
                            .h(px(18.))
                            .text_size(px(13.))
                            .line_height(px(18.))
                            .text_color(rgb(0x27272A))
                            .child(message.subject.clone()),
                    )
                    .child(
                        div()
                            .truncate()
                            .h(px(16.))
                            .text_size(px(12.))
                            .line_height(px(16.))
                            .text_color(rgb(MUTED))
                            .child(message.snippet.clone()),
                    ),
            )
            .child(
                div()
                    .absolute()
                    .bottom_0()
                    .left_0()
                    .right_0()
                    .h(px(1.))
                    .bg(rgb(0xF4F4F5)),
            )
    }

    fn render_list_column(&self, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .flex()
            .flex_col()
            .flex_none()
            .w(px(420.))
            .h_full()
            .bg(rgb(0xFFFFFF))
            .border_r_1()
            .border_color(rgb(BORDER))
            .child(div().flex_none().p(px(12.)).child(self.search.clone()))
            .child(
                div()
                    .flex()
                    .items_center()
                    .flex_none()
                    .h(px(28.))
                    .pl(px(16.))
                    .text_size(px(12.))
                    .text_color(rgb(MUTED))
                    .child(format!("{} conversations", with_thousands(self.filtered.len()))),
            )
            .child(
                uniform_list(
                    "messages",
                    self.filtered.len(),
                    cx.processor(|this, range: std::ops::Range<usize>, _, cx| {
                        range.map(|position| this.render_row(position, cx)).collect()
                    }),
                )
                .track_scroll(&self.list_scroll)
                .flex_1(),
            )
    }

    fn render_detail(&self) -> impl IntoElement {
        let pane = div().flex_1().h_full().bg(rgb(0xFFFFFF));
        let Some(position) = self.selected else {
            return pane
                .flex()
                .items_center()
                .justify_center()
                .text_size(px(14.))
                .text_color(rgb(0xA1A1AA))
                .child("No message selected");
        };
        let message = &self.messages[self.filtered[position]];
        pane.child(
            div()
                .id("detail")
                .size_full()
                .overflow_y_scroll()
                .track_scroll(&self.detail_scroll)
                .p(px(32.))
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .w_full()
                        .child(
                            div()
                                .text_size(px(22.))
                                .line_height(px(28.))
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(rgb(0x18181B))
                                .child(message.subject.clone()),
                        )
                        .child(
                            div()
                                .flex()
                                .items_start()
                                .mt(px(16.))
                                .h(px(40.))
                                .child(avatar(40., 15., message.avatar, message.initials.clone()))
                                .child(
                                    div()
                                        .flex()
                                        .flex_col()
                                        .flex_1()
                                        .min_w_0()
                                        .justify_center()
                                        .h(px(40.))
                                        .ml(px(12.))
                                        .child(
                                            div()
                                                .text_size(px(14.))
                                                .line_height(px(20.))
                                                .font_weight(FontWeight::SEMIBOLD)
                                                .text_color(rgb(0x18181B))
                                                .child(message.from_name.clone()),
                                        )
                                        .child(
                                            div()
                                                .text_size(px(13.))
                                                .line_height(px(20.))
                                                .text_color(rgb(MUTED))
                                                .child(message.from_email.clone()),
                                        ),
                                )
                                .child(
                                    div()
                                        .flex_none()
                                        .text_size(px(12.))
                                        .line_height(px(16.))
                                        .text_color(rgb(MUTED))
                                        .child(message.date_long.clone()),
                                ),
                        )
                        .child(
                            div()
                                .flex()
                                .flex_col()
                                .gap(px(14.))
                                .mt(px(24.))
                                .text_size(px(14.))
                                .line_height(px(22.))
                                .text_color(rgb(0x27272A))
                                .children(message.body.iter().map(|paragraph| paragraph.clone())),
                        ),
                ),
        )
    }
}

fn avatar(diameter: f32, font_size: f32, color: Rgba, initials: SharedString) -> gpui::Div {
    div()
        .flex()
        .items_center()
        .justify_center()
        .flex_none()
        .size(px(diameter))
        .rounded_full()
        .bg(color)
        .text_size(px(font_size))
        .line_height(px(font_size + 3.))
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(rgb(0xFFFFFF))
        .child(initials)
}

fn with_thousands(n: usize) -> String {
    let digits = n.to_string();
    let mut out = String::with_capacity(digits.len() + digits.len() / 3);
    for (ix, digit) in digits.chars().enumerate() {
        if ix > 0 && (digits.len() - ix) % 3 == 0 {
            out.push(',');
        }
        out.push(digit);
    }
    out
}

impl Focusable for Mailbox {
    fn focus_handle(&self, cx: &App) -> FocusHandle {
        self.search.focus_handle(cx)
    }
}

impl Render for Mailbox {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .key_context("Mailbox")
            .on_action(cx.listener(Self::select_next))
            .on_action(cx.listener(Self::select_previous))
            .on_action(cx.listener(Self::clear_search))
            .flex()
            .flex_row()
            .size_full()
            .bg(rgb(0xFFFFFF))
            .font_family(".SystemUIFont")
            .text_color(rgb(0x18181B))
            .child(self.render_sidebar())
            .child(self.render_list_column(cx))
            .child(self.render_detail())
    }
}

fn main() {
    let messages = data::load_messages();

    application().run(move |cx: &mut App| {
        input::bind_keys(cx);
        cx.bind_keys([
            KeyBinding::new("down", SelectNext, Some("Mailbox")),
            KeyBinding::new("up", SelectPrevious, Some("Mailbox")),
            KeyBinding::new("escape", ClearSearch, Some("Mailbox")),
            KeyBinding::new("cmd-q", Quit, None),
        ]);
        cx.on_action(|_: &Quit, cx| cx.quit());
        cx.on_window_closed(|cx, _| {
            if cx.windows().is_empty() {
                cx.quit();
            }
        })
        .detach();

        let bounds = Bounds::new(point(px(100.), px(100.)), size(px(1280.), px(800.)));
        let window = cx
            .open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(bounds)),
                    titlebar: Some(TitlebarOptions {
                        title: Some("Mailbox".into()),
                        ..Default::default()
                    }),
                    ..Default::default()
                },
                |window, cx| {
                    let mailbox = cx.new(|cx| Mailbox::new(messages, cx));
                    window.focus(&mailbox.focus_handle(cx), cx);
                    mailbox
                },
            )
            .expect("open window");
        cx.activate(true);

        #[cfg(feature = "snapshot")]
        snapshot::run(window, cx);
        #[cfg(not(feature = "snapshot"))]
        let _ = window;
    });
}
