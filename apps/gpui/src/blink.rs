use std::time::Duration;

use gpui::Context;

const INTERVAL: Duration = Duration::from_millis(500);

/// Adapted from Zed's `editor::blink_manager`: every state change bumps `epoch`, so a timer
/// armed before it finds a stale epoch and does nothing.
pub struct BlinkManager {
    epoch: usize,
    visible: bool,
    enabled: bool,
}

impl BlinkManager {
    pub fn new() -> Self {
        BlinkManager {
            epoch: 0,
            visible: false,
            enabled: false,
        }
    }

    pub fn visible(&self) -> bool {
        self.visible
    }

    /// Solid now, blinking again after `INTERVAL` without another call.
    pub fn pause_blinking(&mut self, cx: &mut Context<Self>) {
        self.show(cx);
        let epoch = self.next_epoch();
        cx.spawn(async move |this, cx| {
            cx.background_executor().timer(INTERVAL).await;
            this.update(cx, |this, cx| this.blink(epoch, cx))
        })
        .detach();
    }

    pub fn enable(&mut self, cx: &mut Context<Self>) {
        self.enabled = true;
        self.pause_blinking(cx);
    }

    pub fn disable(&mut self, cx: &mut Context<Self>) {
        self.enabled = false;
        self.next_epoch();
        if self.visible {
            self.visible = false;
            cx.notify();
        }
    }

    fn next_epoch(&mut self) -> usize {
        self.epoch += 1;
        self.epoch
    }

    fn show(&mut self, cx: &mut Context<Self>) {
        if !self.visible {
            self.visible = true;
            cx.notify();
        }
    }

    fn blink(&mut self, epoch: usize, cx: &mut Context<Self>) {
        if epoch != self.epoch || !self.enabled {
            return;
        }
        self.visible = !self.visible;
        cx.notify();

        let epoch = self.next_epoch();
        cx.spawn(async move |this, cx| {
            cx.background_executor().timer(INTERVAL).await;
            this.update(cx, |this, cx| this.blink(epoch, cx))
        })
        .detach();
    }
}
