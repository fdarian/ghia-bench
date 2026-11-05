import ApplicationServices
import CoreGraphics
import Foundation

/// Triggers the macOS permission dialogs (first time only) and reports the state afterwards. The
/// grant applies to the terminal app that runs this helper, not to the helper binary.
func requestPermissions() -> [String: Any] {
    let screenCapture = CGRequestScreenCaptureAccess()
    let postEvent = CGRequestPostEventAccess()
    // The literal is the value of kAXTrustedCheckOptionPrompt; the global is a mutable var Swift 6 rejects.
    let axTrusted = AXIsProcessTrustedWithOptions(["AXTrustedCheckOptionPrompt": true] as CFDictionary)
    return ["screenCapture": screenCapture, "postEvent": postEvent, "axTrusted": axTrusted]
}
