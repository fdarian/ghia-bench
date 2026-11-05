import CoreGraphics
import CoreMedia
import CoreVideo
import Foundation
import ScreenCaptureKit

struct CaptureUnavailable: Error, CustomStringConvertible {
    let description: String
}

func requireScreenRecording() throws {
    guard CGPreflightScreenCaptureAccess() else {
        throw CaptureUnavailable(
            description: "Screen Recording permission not granted (CGPreflightScreenCaptureAccess() is false); grant it to the app that runs benchhelper")
    }
}

func fetchShareableContent() throws -> SCShareableContent {
    let semaphore = DispatchSemaphore(value: 0)
    var content: SCShareableContent?
    var failure: Error?
    SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: true) { result, error in
        content = result
        failure = error
        semaphore.signal()
    }
    guard semaphore.wait(timeout: .now() + 10) == .success else {
        throw CaptureUnavailable(description: "SCShareableContent timed out")
    }
    if let failure = failure { throw CaptureUnavailable(description: "SCShareableContent failed: \(failure)") }
    guard let content = content else { throw CaptureUnavailable(description: "SCShareableContent returned nothing") }
    return content
}

func baseConfiguration(width: Int, height: Int, refreshHz: Double) -> SCStreamConfiguration {
    let config = SCStreamConfiguration()
    config.width = width
    config.height = height
    config.pixelFormat = kCVPixelFormatType_32BGRA
    config.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(refreshHz.rounded()))
    config.queueDepth = 8
    config.showsCursor = false
    config.colorSpaceName = CGColorSpace.sRGB
    config.captureResolution = .nominal
    return config
}

final class FrameCapture: NSObject, SCStreamOutput, SCStreamDelegate {
    private var stream: SCStream?
    private let queue = DispatchQueue(label: "benchhelper.capture", qos: .userInteractive)
    private let lock = NSLock()
    private var stopError: Error?
    var onFrame: ((CVPixelBuffer, UInt64) -> Void)?

    var streamError: String? {
        lock.lock()
        defer { lock.unlock() }
        return stopError.map { "stream stopped: \($0)" }
    }

    func start(filter: SCContentFilter, config: SCStreamConfiguration) throws {
        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
        let semaphore = DispatchSemaphore(value: 0)
        var failure: Error?
        stream.startCapture { error in
            failure = error
            semaphore.signal()
        }
        guard semaphore.wait(timeout: .now() + 10) == .success else {
            throw CaptureUnavailable(description: "SCStream.startCapture timed out")
        }
        if let failure = failure { throw CaptureUnavailable(description: "SCStream.startCapture failed: \(failure)") }
        self.stream = stream
    }

    func stop() {
        guard let stream = stream else { return }
        self.stream = nil
        let semaphore = DispatchSemaphore(value: 0)
        stream.stopCapture { _ in semaphore.signal() }
        _ = semaphore.wait(timeout: .now() + 5)
        // Drain the sample queue so no handler runs after stop() returns.
        queue.sync {}
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, CMSampleBufferIsValid(sampleBuffer) else { return }
        guard let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let info = attachments.first,
              let statusRaw = info[.status] as? Int,
              SCFrameStatus(rawValue: statusRaw) == .complete,
              let displayTicks = info[.displayTime] as? UInt64,
              let pixels = CMSampleBufferGetImageBuffer(sampleBuffer)
        else { return }
        onFrame?(pixels, Mach.ns(fromTicks: displayTicks))
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        lock.lock()
        stopError = error
        lock.unlock()
    }
}

struct PixelView {
    let base: UnsafePointer<UInt8>
    let bytesPerRow: Int
    let width: Int
    let height: Int

    func bgr(x: Int, y: Int) -> (b: UInt8, g: UInt8, r: UInt8) {
        let p = base + y * bytesPerRow + x * 4
        return (p[0], p[1], p[2])
    }
}

func withPixels<T>(_ buffer: CVPixelBuffer, _ body: (PixelView) -> T) -> T? {
    guard CVPixelBufferLockBaseAddress(buffer, .readOnly) == kCVReturnSuccess,
          let base = CVPixelBufferGetBaseAddress(buffer) else { return nil }
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    return body(PixelView(
        base: base.assumingMemoryBound(to: UInt8.self),
        bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
        width: CVPixelBufferGetWidth(buffer),
        height: CVPixelBufferGetHeight(buffer)))
}

/// Maps window-content coordinates (points, origin top-left of the content area) to pixel coordinates
/// of a captured buffer. `origin` is the buffer point that corresponds to the window's top-left corner.
struct ContentMapping {
    let scaleX: Double
    let scaleY: Double
    let originX: Double
    let originY: Double
    let titlebar: Double

    func px(_ x: Double) -> Int { Int(((originX + x) * scaleX).rounded()) }
    func py(_ y: Double) -> Int { Int(((originY + titlebar + y) * scaleY).rounded()) }
}

struct Region {
    let name: String
    let x: Double
    let y: Double
    let w: Double
    let h: Double
}

let trackedRegions = [
    Region(name: "search", x: 232, y: 12, w: 396, h: 32),
    Region(name: "count", x: 220, y: 56, w: 420, h: 28),
    Region(name: "list", x: 220, y: 84, w: 420, h: 716),
    Region(name: "detail", x: 640, y: 0, w: 640, h: 800),
    Region(name: "sidebar", x: 0, y: 0, w: 220, h: 800),
]

func hashRegion(_ view: PixelView, _ region: Region, _ map: ContentMapping) -> UInt64 {
    let x0 = max(0, map.px(region.x)), x1 = min(view.width, map.px(region.x + region.w))
    let y0 = max(0, map.py(region.y)), y1 = min(view.height, map.py(region.y + region.h))
    var hash: UInt64 = 14695981039346656037
    var y = y0
    while y < y1 {
        let row = UnsafeRawPointer(view.base + y * view.bytesPerRow)
        var x = x0
        while x < x1 {
            hash = (hash ^ UInt64(row.load(fromByteOffset: x * 4, as: UInt32.self))) &* 1099511628211
            x += 2
        }
        y += 2
    }
    return hash
}

final class RegionRecorder {
    struct Frame {
        let tNs: UInt64
        let changed: [String]
        let first: Bool
    }

    private let lock = NSLock()
    private var recorded: [Frame] = []
    private var previous: [UInt64]?
    private let geometry: Geometry
    private let windowSize: CGSize

    init(geometry: Geometry) {
        self.geometry = geometry
        self.windowSize = geometry.frame.size
    }

    func consume(_ buffer: CVPixelBuffer, displayNs: UInt64) {
        let hashes: [UInt64]? = withPixels(buffer) { view in
            let map = ContentMapping(
                scaleX: Double(view.width) / Double(windowSize.width),
                scaleY: Double(view.height) / Double(windowSize.height),
                originX: 0, originY: 0, titlebar: Double(geometry.titlebar))
            return trackedRegions.map { hashRegion(view, $0, map) }
        }
        guard let hashes = hashes else { return }
        lock.lock()
        defer { lock.unlock() }
        if let previous = previous {
            let changed = trackedRegions.indices.filter { hashes[$0] != previous[$0] }.map { trackedRegions[$0].name }
            recorded.append(Frame(tNs: displayNs, changed: changed, first: false))
        } else {
            recorded.append(Frame(tNs: displayNs, changed: [], first: true))
        }
        previous = hashes
    }

    var frames: [Frame] {
        lock.lock()
        defer { lock.unlock() }
        return recorded
    }
}

final class ReadyDetector {
    private let lock = NSLock()
    private var readyNs: UInt64?
    private var mapping: ContentMapping
    private let notBeforeNs: UInt64
    private let displaySize: CGSize

    init(mapping: ContentMapping, displaySize: CGSize, notBeforeNs: UInt64) {
        self.mapping = mapping
        self.displaySize = displaySize
        self.notBeforeNs = notBeforeNs
    }

    var contentReadyNs: UInt64? {
        lock.lock()
        defer { lock.unlock() }
        return readyNs
    }

    /// Once the real window frame is known the origin and title bar height replace the expectation.
    func update(originX: Double, originY: Double, titlebar: Double) {
        lock.lock()
        mapping = ContentMapping(
            scaleX: mapping.scaleX, scaleY: mapping.scaleY, originX: originX, originY: originY, titlebar: titlebar)
        lock.unlock()
    }

    func consume(_ buffer: CVPixelBuffer, displayNs: UInt64) {
        lock.lock()
        let done = readyNs != nil
        let map = mapping
        lock.unlock()
        if done || displayNs < notBeforeNs { return }
        let matches = withPixels(buffer) { view in matchesSignature(view, map) } ?? false
        if matches {
            lock.lock()
            if readyNs == nil { readyNs = displayNs }
            lock.unlock()
        }
    }
}

/// The signature is only true once data is rendered: the first-row avatar is saturated and the
/// detail subject has dark glyph pixels. The two background points guard against a half-painted window.
private func matchesSignature(_ view: PixelView, _ map: ContentMapping) -> Bool {
    func inBounds(_ x: Int, _ y: Int) -> Bool { x >= 0 && y >= 0 && x < view.width && y < view.height }
    func near(_ x: Double, _ y: Double, r: Int, g: Int, b: Int, tolerance: Int) -> Bool {
        let px = map.px(x), py = map.py(y)
        guard inBounds(px, py) else { return false }
        let p = view.bgr(x: px, y: py)
        return abs(Int(p.r) - r) <= tolerance && abs(Int(p.g) - g) <= tolerance && abs(Int(p.b) - b) <= tolerance
    }
    func saturated(_ x: Double, _ y: Double) -> Bool {
        let px = map.px(x), py = map.py(y)
        guard inBounds(px, py) else { return false }
        let p = view.bgr(x: px, y: py)
        return Int(max(p.r, p.g, p.b)) - Int(min(p.r, p.g, p.b)) >= 50
    }
    guard near(110, 600, r: 0xF4, g: 0xF4, b: 0xF5, tolerance: 4),
          near(630, 790, r: 255, g: 255, b: 255, tolerance: 4),
          near(1270, 400, r: 255, g: 255, b: 255, tolerance: 4),
          saturated(240, 114), saturated(268, 114)
    else { return false }

    var dark = 0
    for y in stride(from: map.py(32), to: map.py(60), by: 1) {
        for x in stride(from: map.px(672), to: map.px(1248), by: 1) where inBounds(x, y) {
            let p = view.bgr(x: x, y: y)
            if Int(p.r) + Int(p.g) + Int(p.b) < 330 { dark += 1 }
        }
    }
    return dark >= 12
}
