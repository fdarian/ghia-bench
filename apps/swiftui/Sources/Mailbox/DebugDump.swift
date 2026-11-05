#if DEBUG
import AppKit

/// Debug builds only (not compiled into the release app): writes state.json into MAILBOX_DEBUG_DIR (default
/// /tmp/mailbox-swiftui-debug)
/// every 200 ms and a window PNG whenever the file `snapshot` appears in that directory (its content names the PNG).
@MainActor
enum DebugDump {
    private static var timer: Timer?

    static func start(model: MailboxModel) {
        guard timer == nil else { return }
        let path = ProcessInfo.processInfo.environment["MAILBOX_DEBUG_DIR"] ?? "/tmp/mailbox-swiftui-debug"
        let dir = URL(fileURLWithPath: path)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        timer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { _ in
            MainActor.assumeIsolated {
                write(model: model, dir: dir)
            }
        }
    }

    private static func write(model: MailboxModel, dir: URL) {
        guard let window = NSApp.windows.first(where: { $0.title == "Mailbox" }),
            let content = window.contentView
        else { return }
        let scrolls = scrollViews(in: content)
        let list = scrolls.first { $0.documentView is NSTableView }
        let detail = scrolls.first { !($0.documentView is NSTableView) }
        var state: [String: Any] = [
            "query": model.query,
            "count": model.results.count,
            "selectedID": model.selected?.id ?? -1,
            "selectedIndex": model.selectedIndex ?? -1,
            "listScrollY": list?.contentView.bounds.origin.y ?? -1,
            "listViewportHeight": list?.contentView.bounds.height ?? -1,
            "detailScrollY": detail?.contentView.bounds.origin.y ?? -1,
            "firstResponder": window.firstResponder.map { String(describing: type(of: $0)) } ?? "none",
            "windowFrameTopLeft": [window.frame.minX, (NSScreen.screens.first?.frame.maxY ?? 0) - window.frame.maxY],
            "contentSize": [content.bounds.width, content.bounds.height],
            "isKey": window.isKeyWindow,
            "caret": (window.firstResponder as? NSTextView)?.selectedRange.location ?? -1,
            "fullSize": window.styleMask.contains(.fullSizeContentView),
            "contentLayoutRect": [window.contentLayoutRect.width, window.contentLayoutRect.height],
            "frameSize": [window.frame.width, window.frame.height],
            "appActive": NSApp.isActive,
        ]
        state["time"] = Date().timeIntervalSince1970
        if let data = try? JSONSerialization.data(withJSONObject: state, options: [.sortedKeys]) {
            try? data.write(to: dir.appendingPathComponent("state.json"))
        }
        let request = dir.appendingPathComponent("snapshot")
        if let name = try? String(contentsOf: request, encoding: .utf8) {
            try? FileManager.default.removeItem(at: request)
            snapshot(window: window, to: dir.appendingPathComponent(name.trimmingCharacters(in: .whitespacesAndNewlines) + ".png"))
        }
    }

    private static func snapshot(window: NSWindow, to url: URL) {
        guard let view = window.contentView?.superview ?? window.contentView,
            let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds)
        else { return }
        view.cacheDisplay(in: view.bounds, to: rep)
        try? rep.representation(using: .png, properties: [:])?.write(to: url)
    }

    private static func scrollViews(in view: NSView) -> [NSScrollView] {
        var found = (view as? NSScrollView).map { [$0] } ?? []
        for sub in view.subviews { found += scrollViews(in: sub) }
        return found
    }
}
#endif
