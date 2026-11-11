// A small always-on-top panel that shows the bench's progress file (harness/src/progress.ts).
// It never activates, takes no clicks while the run is going, and redraws only when the file changes.
import AppKit
import Darwin

struct Status: Decodable {
    let state: String
    let stage: String
    let app: String?
    let index: Int
    let count: Int
    let phase: String?
    let done: Int
    let total: Int
    let startedAt: Double
    let pid: Int32
    let finishAt: Double
    let error: String?
}

final class StatusPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

final class ClickView: NSVisualEffectView {
    var onClick: (() -> Void)?
    override func mouseDown(with event: NSEvent) { onClick?() }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

final class Controller {
    static let width: CGFloat = 300
    static let inset: CGFloat = 16
    static let margin: CGFloat = 20
    static let quitAfter: TimeInterval = 30 * 60

    let path: String
    let panel: StatusPanel
    let stateLabel = Controller.label(size: 28, weight: .bold, secondary: false)
    let unitLabel = Controller.label(size: 13, weight: .regular, secondary: true)
    let countLabel = Controller.label(size: 13, weight: .regular, secondary: false)
    let bar = NSProgressIndicator()
    let finishLabel = Controller.label(size: 13, weight: .regular, secondary: true)
    let stack: NSStackView
    let clock: DateFormatter
    var lastData: Data?
    var quitTimer: Timer?
    var shown = false
    var benchExit: DispatchSourceProcess?
    var watchedPid: Int32 = 0

    static func label(size: CGFloat, weight: NSFont.Weight, secondary: Bool) -> NSTextField {
        let field = NSTextField(wrappingLabelWithString: "")
        field.font = NSFont.systemFont(ofSize: size, weight: weight)
        field.textColor = secondary ? NSColor.secondaryLabelColor : NSColor.labelColor
        field.preferredMaxLayoutWidth = width - 2 * inset
        field.maximumNumberOfLines = 4
        return field
    }

    init(path: String) {
        self.path = path
        clock = DateFormatter()
        clock.dateFormat = "HH:mm"

        let effect = ClickView()
        effect.material = .hudWindow
        effect.blendingMode = .behindWindow
        effect.state = .active
        effect.wantsLayer = true
        effect.layer?.cornerRadius = 12
        effect.layer?.masksToBounds = true

        panel = StatusPanel(
            contentRect: NSRect(x: 0, y: 0, width: Controller.width, height: 160),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.contentView = effect
        panel.appearance = NSAppearance(named: .vibrantDark)
        panel.isOpaque = false
        panel.backgroundColor = NSColor.clear
        panel.hasShadow = true
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.ignoresMouseEvents = true
        panel.hidesOnDeactivate = false
        panel.isMovableByWindowBackground = false

        bar.style = .bar
        bar.isIndeterminate = false
        bar.minValue = 0
        bar.controlSize = .small
        bar.widthAnchor.constraint(equalToConstant: Controller.width - 2 * Controller.inset).isActive = true

        stack = NSStackView(views: [stateLabel, unitLabel, countLabel, bar, finishLabel])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 6
        stack.edgeInsets = NSEdgeInsets(top: 14, left: Controller.inset, bottom: 14, right: Controller.inset)
        stack.translatesAutoresizingMaskIntoConstraints = false
        effect.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: effect.leadingAnchor),
            stack.topAnchor.constraint(equalTo: effect.topAnchor),
            stack.widthAnchor.constraint(equalToConstant: Controller.width),
        ])
        effect.onClick = { NSApp.terminate(nil) }
    }

    func reload() {
        guard FileManager.default.fileExists(atPath: path) else { return }
        let data: Data
        do {
            data = try Data(contentsOf: URL(fileURLWithPath: path))
        } catch {
            FileHandle.standardError.write(Data("benchstatus: cannot read \(path): \(error)\n".utf8))
            return
        }
        if data == lastData { return }
        do {
            let status = try JSONDecoder().decode(Status.self, from: data)
            lastData = data
            render(status)
            if status.state == "running" { watchBench(status.pid) }
        } catch {
            FileHandle.standardError.write(Data("benchstatus: cannot decode \(path): \(error)\n".utf8))
        }
    }

    func unitText(_ status: Status) -> String {
        guard let app = status.app else { return "Starting" }
        let kind = status.stage == "startup" ? "Startup" : "Session"
        var text = "\(kind) \(status.index)/\(status.count) · \(app)"
        if let phase = status.phase { text += " · \(phase)" }
        return text
    }

    /// A bench killed outright (SIGKILL, crash) cannot write Stopped, so its exit is watched here.
    func watchBench(_ pid: Int32) {
        if pid == watchedPid { return }
        benchExit?.cancel()
        benchExit = nil
        watchedPid = pid
        let source = DispatchSource.makeProcessSource(identifier: pid, eventMask: .exit, queue: DispatchQueue.main)
        source.setEventHandler { [weak self] in self?.benchExited(pid) }
        source.resume()
        benchExit = source
        // The process may already be gone: signal 0 only checks that it exists.
        if kill(pid, 0) != 0 && errno == ESRCH { benchExited(pid) }
    }

    func benchExited(_ pid: Int32) {
        guard pid == watchedPid, let data = lastData, var status = try? JSONDecoder().decode(Status.self, from: data) else { return }
        // The bench writes its own final state before exiting; only a "running" file means it died without doing so.
        reload()
        guard lastData == data, status.state == "running" else { return }
        status = Status(
            state: "stopped", stage: status.stage, app: status.app, index: status.index, count: status.count, phase: status.phase,
            done: status.done, total: status.total, startedAt: status.startedAt, pid: status.pid,
            finishAt: Date().timeIntervalSince1970 * 1000, error: "bench process exited"
        )
        render(status)
    }

    func render(_ status: Status) {
        let running = status.state == "running"
        let time = clock.string(from: Date(timeIntervalSince1970: status.finishAt / 1000))
        switch status.state {
        case "running":
            stateLabel.stringValue = "Hands off"
            stateLabel.textColor = NSColor.systemRed
            unitLabel.stringValue = unitText(status)
            finishLabel.stringValue = "Finishes ~\(time)"
        case "done":
            stateLabel.stringValue = "Done"
            stateLabel.textColor = NSColor.systemGreen
            unitLabel.stringValue = "The machine is free to use"
            finishLabel.stringValue = "Finished \(time) · click to close"
        default:
            stateLabel.stringValue = "Stopped"
            stateLabel.textColor = NSColor.systemOrange
            unitLabel.stringValue = status.error ?? unitText(status)
            finishLabel.stringValue = "Stopped \(time) · click to close"
        }
        countLabel.stringValue = "\(status.done) of \(status.total) units"
        bar.maxValue = Double(max(status.total, 1))
        bar.doubleValue = Double(status.done)

        panel.ignoresMouseEvents = running
        quitTimer?.invalidate()
        quitTimer = nil
        if !running {
            quitTimer = Timer.scheduledTimer(withTimeInterval: Controller.quitAfter, repeats: false) { _ in NSApp.terminate(nil) }
        }
        layout()
    }

    func layout() {
        stack.layoutSubtreeIfNeeded()
        let height = stack.fittingSize.height
        panel.setContentSize(NSSize(width: Controller.width, height: height))
        let area = NSScreen.screens[0].visibleFrame
        panel.setFrameOrigin(NSPoint(
            x: area.maxX - Controller.margin - Controller.width,
            y: area.maxY - Controller.margin - panel.frame.height
        ))
        if !shown {
            shown = true
            panel.orderFrontRegardless()
        }
    }
}

/// Watches the status file itself, so a rename over it (the writer's atomic replace) re-opens the new file; while the file
/// does not exist yet it watches the directory instead.
final class FileWatcher {
    let path: String
    let onChange: () -> Void
    var source: DispatchSourceFileSystemObject?
    var watchingDirectory = false

    init(path: String, onChange: @escaping () -> Void) {
        self.path = path
        self.onChange = onChange
    }

    func start() {
        arm()
        onChange()
    }

    func arm() {
        source?.cancel()
        source = nil
        watchingDirectory = !FileManager.default.fileExists(atPath: path)
        let target = watchingDirectory ? (path as NSString).deletingLastPathComponent : path
        let descriptor = open(target, O_EVTONLY)
        if descriptor < 0 {
            FileHandle.standardError.write(Data("benchstatus: cannot watch \(target): errno \(errno)\n".utf8))
            exit(1)
        }
        let watcher = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: descriptor, eventMask: [.write, .extend, .delete, .rename], queue: DispatchQueue.main
        )
        watcher.setEventHandler { [weak self, weak watcher] in
            guard let self = self, let events = watcher?.data else { return }
            self.fired(events)
        }
        watcher.setCancelHandler { close(descriptor) }
        watcher.resume()
        source = watcher
    }

    func fired(_ events: DispatchSource.FileSystemEvent) {
        if watchingDirectory {
            guard FileManager.default.fileExists(atPath: path) else { return }
            arm()
        } else if events.contains(.delete) || events.contains(.rename) {
            arm()
        }
        onChange()
    }
}

guard CommandLine.arguments.count == 2 else {
    FileHandle.standardError.write(Data("usage: benchstatus <status file>\n".utf8))
    exit(2)
}
let statusPath = CommandLine.arguments[1]

// One panel per status file: a later bench run reuses the panel still open from the last one, which follows the file.
let lockDescriptor = open(statusPath + ".panel.lock", O_CREAT | O_RDWR, 0o644)
if lockDescriptor < 0 || flock(lockDescriptor, LOCK_EX | LOCK_NB) != 0 { exit(0) }

/// AppKit activates an app as it finishes launching, even an accessory one, and that would take focus from the terminal the
/// bench runs in. A prohibited app cannot be activated, so it starts prohibited and becomes an accessory once launched.
final class Delegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        watcher.start()
    }
}

let application = NSApplication.shared
application.setActivationPolicy(.prohibited)
let delegate = Delegate()
application.delegate = delegate
let controller = Controller(path: statusPath)
let watcher = FileWatcher(path: statusPath) { controller.reload() }
application.run()
