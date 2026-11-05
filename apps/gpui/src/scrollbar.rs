//! Overlay scrollbar that follows a `ScrollHandle`. Raw GPUI has none; this is Zed's auto-hiding
//! scrollbar (crates/ui/src/components/scrollbar.rs) without the track, drag and fade animation:
//! any change of the handle's offset shows the thumb and replaces the one-shot task that hides it.

use std::time::Duration;

use gpui::{
    canvas, div, fill, hsla, point, prelude::*, px, size, Bounds, Context, Div, Entity, Pixels, Point,
    ScrollHandle, Task, Window,
};

const HIDE_DELAY: Duration = Duration::from_secs(1);
const THUMB_WIDTH: Pixels = px(6.);
const THUMB_INSET: Pixels = px(2.);
const MIN_THUMB_HEIGHT: Pixels = px(25.);

pub struct Scrollbar {
    handle: ScrollHandle,
    last_offset: Point<Pixels>,
    visible: bool,
    /// Dropping the task cancels it, so a new scroll replaces the pending hide.
    hide_task: Option<Task<()>>,
}

impl Scrollbar {
    pub fn new(handle: ScrollHandle) -> Self {
        Scrollbar {
            last_offset: handle.offset(),
            handle,
            visible: false,
            hide_task: None,
        }
    }

    fn show(&mut self, window: &Window, cx: &mut Context<Self>) {
        self.visible = true;
        self.hide_task = Some(cx.spawn_in(window, async move |this, cx| {
            cx.background_executor().timer(HIDE_DELAY).await;
            // Fails only when the scrollbar is gone, which also dropped this task.
            this.update(cx, |this, cx| {
                this.visible = false;
                this.hide_task = None;
                cx.notify();
            })
            .ok();
        }));
    }

    /// Called while the window prepaints, after the scroll container has applied its offset.
    fn track(this: &Entity<Self>, window: &mut Window, cx: &mut gpui::App) -> Option<Bounds<Pixels>> {
        let handle = this.read(cx).handle.clone();
        let offset = handle.offset();
        if offset != this.read(cx).last_offset {
            this.update(cx, |scrollbar, cx| {
                scrollbar.last_offset = offset;
                scrollbar.show(window, cx);
            });
        }
        if !this.read(cx).visible {
            return None;
        }

        let viewport = handle.bounds().size.height;
        let max_offset = handle.max_offset().y;
        if max_offset <= px(0.) || viewport <= px(0.) {
            return None;
        }
        let content = viewport + max_offset;
        let thumb_height = (viewport * (viewport / content)).max(MIN_THUMB_HEIGHT);
        let progress = (-offset.y).clamp(px(0.), max_offset) / max_offset;
        Some(Bounds::new(
            point(px(0.), (viewport - thumb_height) * progress),
            size(THUMB_WIDTH, thumb_height),
        ))
    }
}

/// The view's own layout node is in flow, so the overlay needs an absolute parent around it; without
/// insets an absolute box keeps its in-flow position, below the scroll area.
pub fn overlay(scrollbar: &Entity<Scrollbar>) -> Div {
    div().absolute().inset_0().child(scrollbar.clone())
}

impl Render for Scrollbar {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let this = cx.entity();
        canvas(
            move |_, window, cx| Scrollbar::track(&this, window, cx),
            |bounds, thumb, window, _| {
                let Some(thumb) = thumb else {
                    return;
                };
                let origin = point(
                    bounds.right() - THUMB_INSET - THUMB_WIDTH,
                    bounds.top() + thumb.origin.y,
                );
                window.paint_quad(
                    fill(Bounds::new(origin, thumb.size), hsla(0., 0., 0., 0.35))
                        .corner_radii(THUMB_WIDTH / 2.),
                );
            },
        )
        .size_full()
    }
}
