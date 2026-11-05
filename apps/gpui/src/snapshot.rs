//! `--features snapshot`: drives a few states, writes a PNG of the window for each, and exits.
//! Output directory comes from MAILBOX_SNAPSHOT_DIR.

use std::path::PathBuf;
use std::time::Duration;

use gpui::{App, AsyncApp, WindowHandle};

use crate::Mailbox;

pub fn run(window: WindowHandle<Mailbox>, cx: &mut App) {
    let dir = PathBuf::from(std::env::var("MAILBOX_SNAPSHOT_DIR").expect("MAILBOX_SNAPSHOT_DIR"));
    std::fs::create_dir_all(&dir).expect("create snapshot dir");
    cx.spawn(async move |cx: &mut AsyncApp| {
        let settle = || cx.background_executor().timer(Duration::from_millis(700));
        settle().await;
        capture(&window, cx, &dir, "1-initial");

        window
            .update(cx, |mailbox, _, cx| {
                mailbox
                    .search
                    .update(cx, |search, cx| search.set_text("quarterly report", cx))
            })
            .unwrap();
        settle().await;
        capture(&window, cx, &dir, "2-query");

        window
            .update(cx, |mailbox, window, cx| {
                mailbox.clear_search(&crate::ClearSearch, window, cx);
                for _ in 0..12 {
                    mailbox.move_selection(1, cx);
                }
            })
            .unwrap();
        settle().await;
        capture(&window, cx, &dir, "3-arrow-scrolled");

        window
            .update(cx, |mailbox, _, cx| {
                mailbox
                    .search
                    .update(cx, |search, cx| search.set_text("zzzzqq", cx))
            })
            .unwrap();
        settle().await;
        capture(&window, cx, &dir, "4-empty");

        cx.update(|cx| cx.quit()).unwrap();
    })
    .detach();
}

fn capture(window: &WindowHandle<Mailbox>, cx: &mut AsyncApp, dir: &std::path::Path, name: &str) {
    let image = window
        .update(cx, |_, window, _| window.render_to_image())
        .unwrap()
        .expect("render_to_image");
    image
        .save(dir.join(format!("{name}.png")))
        .expect("write png");
}
