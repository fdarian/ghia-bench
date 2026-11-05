import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

func probe() throws -> [String: Any] {
    let id = CGMainDisplayID()
    let bounds = CGDisplayBounds(id)
    guard let mode = CGDisplayCopyDisplayMode(id) else { throw HelperError("no display mode for main display") }
    var refresh = mode.refreshRate
    if refresh == 0 {
        guard let screen = NSScreen.screens.first(where: {
            ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == id
        }) else { throw HelperError("refresh rate unavailable and main display has no NSScreen") }
        refresh = Double(screen.maximumFramesPerSecond)
    }
    let os = ProcessInfo.processInfo.operatingSystemVersion
    return [
        "screenCapture": CGPreflightScreenCaptureAccess(),
        "postEvent": CGPreflightPostEventAccess(),
        "axTrusted": AXIsProcessTrusted(),
        "mainDisplay": [
            "id": Int(id),
            "widthPt": Double(bounds.width),
            "heightPt": Double(bounds.height),
            "scale": Double(mode.pixelWidth) / Double(mode.width),
            "refreshHz": refresh,
        ] as [String: Any],
        "osVersion": "\(os.majorVersion).\(os.minorVersion).\(os.patchVersion)",
        "cpu": try sysctlString("machdep.cpu.brand_string"),
        "memBytes": try sysctlUInt64("hw.memsize"),
    ]
}
