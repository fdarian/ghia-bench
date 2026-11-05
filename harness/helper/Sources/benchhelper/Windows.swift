import CoreGraphics
import Foundation

struct WindowEntry {
    let number: Int
    let pid: pid_t
    let owner: String?
    let layer: Int
    let alpha: Double
    let frame: CGRect
    let onScreen: Bool
}

enum WindowList {
    /// Front to back.
    static func list(onScreenOnly: Bool) throws -> [WindowEntry] {
        let options: CGWindowListOption = onScreenOnly ? [.optionOnScreenOnly, .excludeDesktopElements] : [.optionAll]
        guard let raw = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
            throw HelperError("CGWindowListCopyWindowInfo failed")
        }
        return try raw.map { dict in
            guard let number = dict[kCGWindowNumber as String] as? Int,
                  let pid = dict[kCGWindowOwnerPID as String] as? Int,
                  let layer = dict[kCGWindowLayer as String] as? Int,
                  let alpha = dict[kCGWindowAlpha as String] as? Double,
                  let boundsDict = dict[kCGWindowBounds as String] as? NSDictionary,
                  let frame = CGRect(dictionaryRepresentation: boundsDict as CFDictionary)
            else { throw HelperError("unexpected CGWindowList entry: \(dict)") }
            return WindowEntry(
                number: number, pid: pid_t(pid), owner: dict[kCGWindowOwnerName as String] as? String,
                layer: layer, alpha: alpha, frame: frame,
                onScreen: (dict[kCGWindowIsOnscreen as String] as? Bool) ?? false)
        }
    }

    /// Windows smaller than this are helper/utility windows, not the app window.
    static let minWidth: CGFloat = 400
    static let minHeight: CGFloat = 300

    static func mainWindow(of pid: pid_t, in windows: [WindowEntry]) -> WindowEntry? {
        windows
            .filter { $0.pid == pid && $0.layer == 0 && $0.alpha > 0 && $0.frame.width >= minWidth && $0.frame.height >= minHeight }
            .max { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }
    }
}

let contentWidth: CGFloat = 1280
let contentHeight: CGFloat = 800

struct Geometry {
    let frame: CGRect
    let titlebar: CGFloat

    init(frame: CGRect) throws {
        guard frame.height >= contentHeight else {
            throw HelperError("window frame height \(frame.height) is below the 800pt content height")
        }
        self.frame = frame
        self.titlebar = frame.height - contentHeight
    }

    func global(x: CGFloat, y: CGFloat) -> CGPoint {
        CGPoint(x: frame.minX + x, y: frame.minY + titlebar + y)
    }
}

func liveGeometry(pid: pid_t) throws -> Geometry {
    let windows = try WindowList.list(onScreenOnly: true)
    guard let window = WindowList.mainWindow(of: pid, in: windows) else {
        throw HelperError("no on-screen app window for pid \(pid)")
    }
    return try Geometry(frame: window.frame)
}

func windowStatus(pid: pid_t) throws -> [String: Any] {
    let windows = try WindowList.list(onScreenOnly: false)
    guard let ours = WindowList.mainWindow(of: pid, in: windows) else {
        throw HelperError("no app window for pid \(pid)")
    }
    guard let index = windows.firstIndex(where: { $0.number == ours.number }) else {
        throw HelperError("window vanished from list")
    }
    let inFront = windows[..<index].filter {
        $0.onScreen && $0.layer == 0 && $0.alpha > 0 && $0.frame.width >= 2 && $0.frame.height >= 2
    }
    let blockers = inFront.filter { $0.frame.intersects(ours.frame) }

    let grid = 40
    var covered = 0
    for row in 0..<grid {
        for column in 0..<grid {
            let point = CGPoint(
                x: ours.frame.minX + (CGFloat(column) + 0.5) * ours.frame.width / CGFloat(grid),
                y: ours.frame.minY + (CGFloat(row) + 0.5) * ours.frame.height / CGFloat(grid))
            if blockers.contains(where: { $0.frame.contains(point) }) { covered += 1 }
        }
    }
    return [
        "frame": rectJSON(ours.frame),
        "titlebarHeight": Double(ours.frame.height - contentHeight),
        "onScreen": ours.onScreen,
        "frontmost": ours.onScreen && blockers.isEmpty,
        "coveredFraction": Double(covered) / Double(grid * grid),
        "coveredBy": blockers.map {
            ["pid": Int($0.pid), "owner": nullable($0.owner), "frame": rectJSON($0.frame)] as [String: Any]
        },
    ]
}
