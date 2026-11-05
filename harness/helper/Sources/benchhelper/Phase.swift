import CoreGraphics
import Foundation
import ScreenCaptureKit

private struct PlannedInput {
    let offsetNs: UInt64
    let event: CGEvent
    let kind: String
    var key: String?
    var dy: Int?
    var x: Double?
    var y: Double?
}

private struct PostedInput {
    let tNs: UInt64
    let planned: PlannedInput
}

private let listCentre = CGPoint(x: 430, y: 442)
private let listTop: CGFloat = 84
private let listBottom: CGFloat = 799
private let rateHz: UInt64 = 120
private let tailNs: UInt64 = 500_000_000
private let captureLeadNs: UInt64 = 300_000_000
private let keyUpDelayNs: UInt64 = 15_000_000

private enum KeyCode {
    static let letters: [Character: (code: CGKeyCode, text: String)] = [
        "a": (0, "a"), "e": (14, "e"), "l": (37, "l"), "o": (31, "o"), "p": (35, "p"), "q": (12, "q"),
        "r": (15, "r"), "t": (17, "t"), "u": (32, "u"), "y": (16, "y"), " ": (49, " "),
    ]
    static let backspace: CGKeyCode = 51
    static let arrowDown: CGKeyCode = 125
}

private let eventSource = CGEventSource(stateID: .privateState)

private typealias SetWindowLocation = @convention(c) (CGEvent, CGPoint) -> Void
private let setWindowLocation: SetWindowLocation? = {
    guard let handle = dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight", RTLD_LAZY),
          let symbol = dlsym(handle, "SLEventSetWindowLocation")
    else { return nil }
    return unsafeBitCast(symbol, to: SetWindowLocation.self)
}()

/// A CGEventPostToPid event carries no window: AppKit keeps the screen location as the window location and
/// never routes a scroll wheel event to a view (mouse moves are rescued by tracking areas). Field 51 is the
/// event's window number; the window location is in points from the window's top-left corner.
private func assignWindow(_ event: CGEvent, geometry: Geometry, at point: CGPoint) throws {
    guard let setWindowLocation = setWindowLocation else { throw HelperError("SLEventSetWindowLocation is not available") }
    event.setIntegerValueField(CGEventField(rawValue: 51)!, value: Int64(geometry.windowNumber))
    setWindowLocation(event, CGPoint(x: point.x - geometry.frame.minX, y: point.y - geometry.frame.minY))
}

private func mouseMove(to point: CGPoint, deltaY: Int, offsetNs: UInt64, geometry: Geometry) throws -> PlannedInput {
    guard let event = CGEvent(mouseEventSource: eventSource, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left)
    else { throw HelperError("CGEvent mouseMoved creation failed") }
    event.setIntegerValueField(.mouseEventDeltaY, value: Int64(deltaY))
    try assignWindow(event, geometry: geometry, at: point)
    return PlannedInput(offsetNs: offsetNs, event: event, kind: "move", x: Double(point.x), y: Double(point.y))
}

private func scrollEvent(at point: CGPoint, dy: Int32, offsetNs: UInt64, geometry: Geometry) throws -> PlannedInput {
    guard let event = CGEvent(
        scrollWheelEvent2Source: eventSource, units: .pixel, wheelCount: 1, wheel1: dy, wheel2: 0, wheel3: 0)
    else { throw HelperError("CGEvent scroll creation failed") }
    event.location = point
    event.setIntegerValueField(.scrollWheelEventIsContinuous, value: 1)
    try assignWindow(event, geometry: geometry, at: point)
    return PlannedInput(offsetNs: offsetNs, event: event, kind: "scroll", dy: Int(dy), x: Double(point.x), y: Double(point.y))
}

private func keyPair(
    code: CGKeyCode, text: String, name: String, flags: CGEventFlags, offsetNs: UInt64
) throws -> [PlannedInput] {
    let utf16 = Array(text.utf16)
    return try [true, false].map { down in
        guard let event = CGEvent(keyboardEventSource: eventSource, virtualKey: code, keyDown: down)
        else { throw HelperError("CGEvent key creation failed") }
        event.flags = flags
        event.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: utf16)
        return PlannedInput(
            offsetNs: down ? offsetNs : offsetNs + keyUpDelayNs, event: event,
            kind: down ? "keyDown" : "keyUp", key: name)
    }
}

private func plan(name: String, geometry: Geometry) throws -> (setup: PlannedInput?, events: [PlannedInput]) {
    let step = 1_000_000_000 / rateHz
    switch name {
    case "scroll":
        let point = geometry.global(x: listCentre.x, y: listCentre.y)
        let setup = try mouseMove(to: point, deltaY: 0, offsetNs: 0, geometry: geometry)
        let perLeg = Int(rateHz) * 3
        // Negative wheel1 scrolls the content down (toward later rows); positive scrolls back up.
        let events = try (0..<(perLeg * 2)).map { index in
            try scrollEvent(at: point, dy: index < perLeg ? -30 : 30, offsetNs: UInt64(index) * step, geometry: geometry)
        }
        return (setup, events)
    case "hover":
        let perLeg = Int(rateHz) * 2
        let ys: [CGFloat] = (0..<perLeg).map { listTop + (listBottom - listTop) * CGFloat($0) / CGFloat(perLeg - 1) }
        let path = ys + ys.reversed()
        let setup = try mouseMove(to: geometry.global(x: listCentre.x, y: listTop), deltaY: 0, offsetNs: 0, geometry: geometry)
        var events: [PlannedInput] = []
        for (index, y) in path.enumerated() {
            let delta = index == 0 ? 0 : Int((y - path[index - 1]).rounded())
            events.append(try mouseMove(
                to: geometry.global(x: listCentre.x, y: y), deltaY: delta, offsetNs: UInt64(index) * step,
                geometry: geometry))
        }
        return (setup, events)
    case "type":
        var events: [PlannedInput] = []
        for (index, character) in "quarterly report".enumerated() {
            guard let key = KeyCode.letters[character] else { throw HelperError("no keycode for \(character)") }
            events += try keyPair(
                code: key.code, text: key.text, name: String(character), flags: [], offsetNs: UInt64(index) * 150_000_000)
        }
        for index in 0..<16 {
            events += try keyPair(
                code: KeyCode.backspace, text: "\u{7f}", name: "backspace", flags: [],
                offsetNs: UInt64(16 + index) * 150_000_000)
        }
        return (nil, events)
    case "navigate":
        var events: [PlannedInput] = []
        for index in 0..<30 {
            events += try keyPair(
                code: KeyCode.arrowDown, text: "\u{F701}", name: "ArrowDown",
                flags: [.maskSecondaryFn, .maskNumericPad], offsetNs: UInt64(index) * 120_000_000)
        }
        return (nil, events)
    default:
        throw HelperError("unknown phase \(name)")
    }
}

/// Posts on a dedicated thread, each event at its mach deadline; returns the posts with their actual times.
private func run(events: [PlannedInput], pid: pid_t, startTicks: UInt64) -> [PostedInput] {
    var posted: [PostedInput] = []
    posted.reserveCapacity(events.count)
    let done = DispatchSemaphore(value: 0)
    var realtimeError: Error?
    let thread = Thread {
        do {
            try makeCurrentThreadRealtime(periodNs: 1_000_000_000 / rateHz, computationNs: 500_000, constraintNs: 2_000_000)
        } catch { realtimeError = error }
        for planned in events {
            let deadline = startTicks + Mach.ticks(fromNs: planned.offsetNs)
            // Sleep to just short of the deadline, then spin: wake-up latency of a plain sleep is ~100s of us.
            let spinTicks = Mach.ticks(fromNs: 300_000)
            if mach_absolute_time() + spinTicks < deadline { mach_wait_until(deadline - spinTicks) }
            while mach_absolute_time() < deadline {}
            let ticks = mach_absolute_time()
            planned.event.postToPid(pid)
            posted.append(PostedInput(tNs: Mach.ns(fromTicks: ticks), planned: planned))
        }
        done.signal()
    }
    thread.qualityOfService = .userInteractive
    // Keeps the helper out of App Nap / timer coalescing for the duration of the phase.
    let activity = ProcessInfo.processInfo.beginActivity(
        options: [.userInitiated, .latencyCritical], reason: "benchmark input pacing")
    defer { ProcessInfo.processInfo.endActivity(activity) }
    thread.start()
    done.wait()
    if let realtimeError = realtimeError { warn("benchhelper: pacing thread is not real-time: \(realtimeError)") }
    return posted
}

private func startWindowCapture(
    pid: pid_t, geometry: Geometry, refreshHz: Double
) throws -> (FrameCapture, RegionRecorder) {
    try requireScreenRecording()
    let windows = try WindowList.list(onScreenOnly: true)
    guard let window = WindowList.mainWindow(of: pid, in: windows) else {
        throw CaptureUnavailable(description: "no on-screen window for pid \(pid)")
    }
    let content = try fetchShareableContent()
    guard let scWindow = content.windows.first(where: { Int($0.windowID) == window.number }) else {
        throw CaptureUnavailable(description: "window \(window.number) not in SCShareableContent")
    }
    let config = baseConfiguration(
        width: Int(window.frame.width), height: Int(window.frame.height), refreshHz: refreshHz)
    config.ignoreShadowsSingleWindow = true
    let recorder = RegionRecorder(geometry: geometry)
    let capture = FrameCapture()
    capture.onFrame = { buffer, ns in recorder.consume(buffer, displayNs: ns) }
    try capture.start(filter: SCContentFilter(desktopIndependentWindow: scWindow), config: config)
    return (capture, recorder)
}

func phase(args: Args) throws -> [String: Any] {
    let pid = try args.pid("--pid")
    let name = try args.string("--name")
    let seconds = try args.optionalInt("--seconds") ?? 10
    let geometry = try liveGeometry(pid: pid)
    let refreshHz = try probeRefreshHz()

    var capture: FrameCapture?
    var recorder: RegionRecorder?
    var captureError: String?
    if args.flag("--capture") {
        do {
            let started = try startWindowCapture(pid: pid, geometry: geometry, refreshHz: refreshHz)
            capture = started.0
            recorder = started.1
        } catch let error as CaptureUnavailable {
            captureError = error.description
        }
    }
    defer { capture?.stop() }

    var inputs: [PostedInput] = []
    let before: [String: Any]
    var after: [String: Any]
    let afterTail: [String: Any]

    if name == "idle" {
        Mach.sleep(ns: captureLeadNs)
        before = try sampleTree(root: pid)
        Mach.sleep(ns: UInt64(seconds) * 1_000_000_000)
        after = try sampleTree(root: pid)
        afterTail = after
    } else {
        let planned = try plan(name: name, geometry: geometry)
        Mach.sleep(ns: captureLeadNs)
        if let setup = planned.setup {
            setup.event.postToPid(pid)
        } else {
            // The first post of a process takes ~50 ms (connection setup); take it here, not on the first input.
            guard let cursor = CGEvent(source: nil),
                  let warmup = CGEvent(mouseEventSource: eventSource, mouseType: .mouseMoved,
                                       mouseCursorPosition: cursor.location, mouseButton: .left)
            else { throw HelperError("cannot create warm-up event") }
            warmup.postToPid(pid)
        }
        Mach.sleep(ns: 150_000_000)
        before = try sampleTree(root: pid)
        let startTicks = mach_absolute_time() + Mach.ticks(fromNs: 20_000_000)
        inputs = run(events: planned.events, pid: pid, startTicks: startTicks)
        after = try sampleTree(root: pid)
        Mach.sleep(ns: tailNs)
        afterTail = try sampleTree(root: pid)
    }

    if let streamError = capture?.streamError, captureError == nil { captureError = streamError }
    var result: [String: Any] = [
        "name": name,
        "windowFrame": rectJSON(geometry.frame),
        "titlebarHeight": Double(geometry.titlebar),
        "rusageBefore": before,
        "rusageAfter": after,
        "rusageAfterTail": afterTail,
        "inputs": inputs.map { posted -> [String: Any] in
            var entry: [String: Any] = ["tNs": posted.tNs, "kind": posted.planned.kind]
            if let key = posted.planned.key { entry["key"] = key }
            if let dy = posted.planned.dy { entry["dy"] = dy }
            if let x = posted.planned.x { entry["x"] = x }
            if let y = posted.planned.y { entry["y"] = y }
            return entry
        },
    ]
    if let capture = capture, let recorder = recorder {
        capture.stop()
        result["frames"] = recorder.frames.map { frame -> [String: Any] in
            var entry: [String: Any] = ["tNs": frame.tNs, "changed": frame.changed]
            if frame.first { entry["first"] = true }
            return entry
        }
    } else {
        result["frames"] = NSNull()
    }
    if let captureError = captureError { result["captureError"] = captureError }
    return result
}
