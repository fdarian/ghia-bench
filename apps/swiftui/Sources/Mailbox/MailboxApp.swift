import AppKit
import SwiftUI

@main
struct MailboxApp: App {
    @State private var model = MailboxModel()

    var body: some Scene {
        Window("Mailbox", id: "main") {
            ContentView(model: model)
                .background(WindowConfigurator())
                #if DEBUG
                .onAppear { DebugDump.start(model: model) }
                #endif
        }
        .defaultSize(width: 1280, height: 800)
    }
}

struct ContentView: View {
    let model: MailboxModel

    var body: some View {
        HStack(spacing: 0) {
            SidebarView(unreadCount: model.unreadCount)
                .frame(width: 220)
            ListColumn(model: model)
                .frame(width: 420)
            DetailView(model: model)
                .frame(maxWidth: .infinity)
        }
        .frame(minWidth: 900, minHeight: 400)
        .background(Color.white)
        .preferredColorScheme(.light)
    }
}

/// Places the window at the spec's exact geometry; SwiftUI has no API for an absolute screen position.
struct WindowConfigurator: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        WindowProbe()
    }

    func updateNSView(_ view: NSView, context: Context) {}
}

private final class WindowProbe: NSView {
    override func viewDidMoveToWindow() {
        guard let window else { return }
        NSWindow.allowsAutomaticWindowTabbing = false
        window.setFrameAutosaveName("")
        // contentLayoutRect excludes the title bar whether or not SwiftUI made the content view full-size,
        // so size the window until that rect is the spec's 1280x800.
        window.setContentSize(NSSize(width: 1280, height: 800))
        let missing = 800 - window.contentLayoutRect.height
        window.setContentSize(NSSize(width: 1280, height: 800 + missing))
        guard let main = NSScreen.screens.first else { return }
        window.setFrameTopLeftPoint(NSPoint(x: main.frame.minX + 100, y: main.frame.maxY - 100))
        window.makeKeyAndOrderFront(nil)
        NSApp.activate()
    }
}
