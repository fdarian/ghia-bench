// Tiny AppKit stand-in for the benchmark apps: a 1280x800 content window at (100,100), logging every
// NSEvent it receives as one JSON line (to --log). Paints the spec's launch signature after --delay-ms.
import AppKit

setvbuf(stdout, nil, _IOLBF, 0)

var logPath = "/tmp/benchhelper-testapp.log"
var delayMs = 0
var args = CommandLine.arguments.dropFirst().makeIterator()
while let arg = args.next() {
    switch arg {
    case "--log": logPath = args.next()!
    case "--delay-ms": delayMs = Int(args.next()!)!
    default: fatalError("unknown argument \(arg)")
    }
}
FileManager.default.createFile(atPath: logPath, contents: nil)
let logHandle = FileHandle(forWritingAtPath: logPath)!
let logLock = NSLock()

func machNs() -> UInt64 {
    var tb = mach_timebase_info_data_t()
    mach_timebase_info(&tb)
    let ticks = mach_absolute_time()
    return ticks / UInt64(tb.denom) * UInt64(tb.numer) + ticks % UInt64(tb.denom) * UInt64(tb.numer) / UInt64(tb.denom)
}

func log(_ source: String, _ event: NSEvent) {
    var entry: [String: Any] = [
        "recvNs": machNs(), "src": source, "type": event.type.rawValue,
        "x": event.locationInWindow.x, "y": event.locationInWindow.y,
        "win": event.windowNumber, "hasWindow": event.window != nil,
    ]
    switch event.type {
    case .scrollWheel:
        entry["dy"] = event.scrollingDeltaY
        entry["precise"] = event.hasPreciseScrollingDeltas
        entry["phase"] = event.phase.rawValue
    case .keyDown, .keyUp:
        entry["keyCode"] = event.keyCode
        entry["chars"] = event.characters
        entry["flags"] = event.modifierFlags.rawValue
    case .mouseMoved:
        entry["dy"] = event.deltaY
    default: break
    }
    let data = try! JSONSerialization.data(withJSONObject: entry, options: [.sortedKeys])
    logLock.lock()
    logHandle.write(data + Data("\n".utf8))
    logLock.unlock()
}

final class TestApplication: NSApplication {
    override func sendEvent(_ event: NSEvent) {
        if event.type != .systemDefined && event.type != .appKitDefined && event.type != .applicationDefined {
            log("app", event)
        }
        super.sendEvent(event)
    }
}

final class ContentView: NSView {
    var painted = false
    override var isFlipped: Bool { true }
    override var acceptsFirstResponder: Bool { true }
    override func scrollWheel(with event: NSEvent) { log("view", event) }
    override func mouseMoved(with event: NSEvent) { log("view", event) }
    override func keyDown(with event: NSEvent) { log("view", event) }
    override func keyUp(with event: NSEvent) { log("view", event) }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for area in trackingAreas { removeTrackingArea(area) }
        addTrackingArea(NSTrackingArea(
            rect: bounds, options: [.mouseMoved, .activeAlways, .inVisibleRect], owner: self, userInfo: nil))
    }

    override func draw(_ dirtyRect: NSRect) {
        NSColor.white.setFill()
        bounds.fill()
        NSColor(srgbRed: 0xF4 / 255, green: 0xF4 / 255, blue: 0xF5 / 255, alpha: 1).setFill()
        NSRect(x: 0, y: 0, width: 220, height: 800).fill()
        guard painted else { return }
        NSColor(srgbRed: 0xF8 / 255, green: 0x71 / 255, blue: 0x71 / 255, alpha: 1).setFill()
        NSBezierPath(ovalIn: NSRect(x: 236, y: 96, width: 36, height: 36)).fill()
        ("Quarterly report" as NSString).draw(
            at: NSPoint(x: 672, y: 32),
            withAttributes: [.font: NSFont.systemFont(ofSize: 22, weight: .semibold), .foregroundColor: NSColor.black])
    }
}

let app = TestApplication.shared
app.setActivationPolicy(.regular)
let screenTop = NSScreen.screens[0].frame.maxY
let window = NSWindow(
    contentRect: NSRect(x: 100, y: 0, width: 1280, height: 800),
    styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
window.title = "Mailbox"
window.acceptsMouseMovedEvents = true
let view = ContentView(frame: NSRect(x: 0, y: 0, width: 1280, height: 800))
window.contentView = view
window.setFrameTopLeftPoint(NSPoint(x: 100, y: screenTop - 100))
window.makeKeyAndOrderFront(nil)
window.makeFirstResponder(view)
app.activate(ignoringOtherApps: true)
if delayMs > 0 {
    DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(delayMs)) {
        view.painted = true
        view.needsDisplay = true
    }
} else {
    view.painted = true
}
app.run()
