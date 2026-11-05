import AppKit
import CoreGraphics
import Foundation
import ScreenCaptureKit

private let expectedOrigin = CGPoint(x: 100, y: 100)

private func spawn(bin: String, log: String?) throws -> pid_t {
    var actions: posix_spawn_file_actions_t?
    posix_spawn_file_actions_init(&actions)
    defer { posix_spawn_file_actions_destroy(&actions) }
    posix_spawn_file_actions_addopen(&actions, 0, "/dev/null", O_RDONLY, 0)
    if let log = log {
        posix_spawn_file_actions_addopen(&actions, 1, log, O_WRONLY | O_CREAT | O_TRUNC, 0o644)
    } else {
        posix_spawn_file_actions_addopen(&actions, 1, "/dev/null", O_WRONLY, 0)
    }
    posix_spawn_file_actions_adddup2(&actions, 1, 2)

    var attributes: posix_spawnattr_t?
    posix_spawnattr_init(&attributes)
    defer { posix_spawnattr_destroy(&attributes) }
    // SETSID: the app outlives the helper. CLOEXEC_DEFAULT: it must not inherit the helper's stdout pipe.
    posix_spawnattr_setflags(&attributes, Int16(POSIX_SPAWN_SETSID | POSIX_SPAWN_CLOEXEC_DEFAULT))

    var pid: pid_t = 0
    let argv: [UnsafeMutablePointer<CChar>?] = [strdup(bin), nil]
    defer { argv.forEach { free($0) } }
    let result = posix_spawn(&pid, bin, &actions, &attributes, argv, environ)
    guard result == 0 else { throw HelperError("posix_spawn \(bin) failed: \(String(cString: strerror(result)))") }
    return pid
}

private func openApp(at path: String) throws -> pid_t {
    let url = URL(fileURLWithPath: path)
    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory), isDirectory.boolValue else {
        throw HelperError("\(path) is not an app bundle")
    }
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.activates = true
    configuration.createsNewApplicationInstance = true
    configuration.addsToRecentItems = false
    let semaphore = DispatchSemaphore(value: 0)
    var app: NSRunningApplication?
    var failure: Error?
    NSWorkspace.shared.openApplication(at: url, configuration: configuration) { running, error in
        app = running
        failure = error
        semaphore.signal()
    }
    guard semaphore.wait(timeout: .now() + 30) == .success else { throw HelperError("openApplication timed out") }
    if let failure = failure { throw HelperError("openApplication failed: \(failure)") }
    guard let app = app else { throw HelperError("openApplication returned no application") }
    return app.processIdentifier
}

private final class LaunchCapture {
    let capture = FrameCapture()
    let detector: ReadyDetector

    init(detector: ReadyDetector) { self.detector = detector }
}

/// Starts the display stream cropped to the expected window rect. Throws CaptureUnavailable.
private func startDisplayCapture(refreshHz: Double, notBeforeNs: UInt64) throws -> LaunchCapture {
    try requireScreenRecording()
    let content = try fetchShareableContent()
    guard let display = content.displays.first(where: { $0.displayID == CGMainDisplayID() }) else {
        throw CaptureUnavailable(description: "main display not in SCShareableContent")
    }
    let standardFrame = NSWindow.frameRect(
        forContentRect: NSRect(x: 0, y: 0, width: contentWidth, height: contentHeight),
        styleMask: [.titled, .closable, .miniaturizable, .resizable])
    let expectedTitlebar = Double(standardFrame.height - contentHeight)
    // Generous crop height so a taller-than-expected title bar is still inside the stream.
    let cropHeight = Double(contentHeight) + expectedTitlebar + 40
    let crop = CGRect(x: expectedOrigin.x, y: expectedOrigin.y, width: Double(contentWidth), height: cropHeight)

    let config = baseConfiguration(width: Int(crop.width), height: Int(crop.height), refreshHz: refreshHz)
    config.sourceRect = crop
    let mapping = ContentMapping(scaleX: 1, scaleY: 1, originX: 0, originY: 0, titlebar: expectedTitlebar)
    let launchCapture = LaunchCapture(detector: ReadyDetector(
        mapping: mapping, notBeforeNs: notBeforeNs))
    launchCapture.capture.onFrame = { [detector = launchCapture.detector] buffer, ns in
        detector.consume(buffer, displayNs: ns)
    }
    try launchCapture.capture.start(
        filter: SCContentFilter(display: display, excludingWindows: []), config: config)
    return launchCapture
}

func launch(args: Args) throws -> [String: Any] {
    let appPath = args.optionalString("--app")
    let bin = args.optionalString("--bin")
    guard (appPath == nil) != (bin == nil) else { throw HelperError("launch needs exactly one of --app or --bin") }
    let label = appPath ?? bin ?? ""
    let timeoutMs = try args.optionalInt("--timeout-ms") ?? 20000
    let wantCapture = args.flag("--capture")
    if let bin = bin, !FileManager.default.isExecutableFile(atPath: bin) { throw HelperError("\(bin) is not executable") }

    let refreshHz = try probeRefreshHz()
    var launchCapture: LaunchCapture?
    var captureError: String?
    if wantCapture {
        do {
            launchCapture = try startDisplayCapture(refreshHz: refreshHz, notBeforeNs: Mach.nowNs())
        } catch let error as CaptureUnavailable {
            captureError = error.description
        }
    }
    defer { launchCapture?.capture.stop() }

    let t0Ticks = mach_absolute_time()
    let pid: pid_t
    if let appPath = appPath {
        pid = try openApp(at: appPath)
    } else if let bin = bin {
        pid = try spawn(bin: bin, log: args.optionalString("--log"))
    } else {
        throw HelperError("unreachable")
    }
    let t0Ns = Mach.ns(fromTicks: t0Ticks)

    var windowVisibleNs: UInt64?
    var firstFrame: CGRect?
    var settledFrame: CGRect?
    var frameChangedNs: UInt64 = 0
    let deadlineNs = t0Ns + UInt64(timeoutMs) * 1_000_000
    // The window server animates a new window's bounds (scale-in); wait until they stop moving.
    let settleNs: UInt64 = 300_000_000
    var nextPoll = mach_absolute_time()
    do {
        while true {
            var status: Int32 = 0
            // LaunchServices apps are not our children, so waitpid cannot see them exit.
            let exited = appPath == nil ? waitpid(pid, &status, WNOHANG) == pid : kill(pid, 0) != 0
            if exited { throw HelperError("\(label) exited during launch") }
            let windows = try WindowList.list(onScreenOnly: true)
            let seenNs = Mach.nowNs()
            if let window = WindowList.mainWindow(of: pid, in: windows) {
                if windowVisibleNs == nil {
                    windowVisibleNs = seenNs
                    firstFrame = window.frame
                }
                if window.frame != settledFrame {
                    settledFrame = window.frame
                    frameChangedNs = seenNs
                    launchCapture?.detector.update(
                        originX: Double(window.frame.minX - expectedOrigin.x),
                        originY: Double(window.frame.minY - expectedOrigin.y),
                        titlebar: Double(window.frame.height - contentHeight))
                }
            }
            let ready = launchCapture == nil || launchCapture?.detector.contentReadyNs != nil
            if windowVisibleNs != nil && ready && seenNs - frameChangedNs >= settleNs { break }
            if seenNs > deadlineNs {
                if windowVisibleNs != nil {
                    if !ready { captureError = "content signature not seen within \(timeoutMs) ms" }
                    break
                }
                throw HelperError("no on-screen window for pid \(pid) within \(timeoutMs) ms")
            }
            nextPoll += Mach.ticks(fromNs: 1_000_000)
            mach_wait_until(nextPoll)
        }
    } catch {
        ProcessTree.killTree(root: pid)
        waitpid(pid, nil, 0)
        throw error
    }

    if let streamError = launchCapture?.capture.streamError, captureError == nil { captureError = streamError }
    var result: [String: Any] = [
        "pid": Int(pid),
        "t0Ns": t0Ns,
        "windowVisibleNs": nullable(windowVisibleNs),
        "windowFrame": nullable(settledFrame.map(rectJSON)),
        "windowFrameAtVisible": nullable(firstFrame.map(rectJSON)),
        "contentReadyNs": nullable(launchCapture?.detector.contentReadyNs),
    ]
    if let captureError = captureError { result["captureError"] = captureError }
    return result
}

func probeRefreshHz() throws -> Double {
    guard let hz = try probe()["mainDisplay"] as? [String: Any], let value = hz["refreshHz"] as? Double else {
        throw HelperError("cannot determine refresh rate")
    }
    return value
}
