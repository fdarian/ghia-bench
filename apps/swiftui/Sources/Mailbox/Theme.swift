import AppKit
import SwiftUI

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255)
    }
}

enum Palette {
    static let ink = Color(hex: 0x18181B)
    static let inkStrong = Color(hex: 0x27272A)
    static let inkMedium = Color(hex: 0x3F3F46)
    static let muted = Color(hex: 0x71717A)
    static let faint = Color(hex: 0xA1A1AA)
    static let surface = Color(hex: 0xF4F4F5)
    static let border = Color(hex: 0xE4E4E7)
    static let hoverFolder = Color(hex: 0xEBEBED)
    static let accent = Color(hex: 0x2563EB)
    static let selectedRow = Color(hex: 0xDBEAFE)
    static let avatars: [Color] = [
        0xF87171, 0xFB923C, 0xFBBF24, 0x34D399, 0x22D3EE, 0x60A5FA, 0xA78BFA, 0xF472B6,
    ].map { Color(hex: $0) }
}

extension View {
    /// SwiftUI has no exact line height before macOS 26, so the font's natural height is topped up with
    /// `lineSpacing` (added below every line but the last) and half of it is moved above the first line,
    /// which spreads the leading above and below each line like a CSS line box.
    func lineHeight(_ height: CGFloat, size: CGFloat, weight: NSFont.Weight = .regular) -> some View {
        let font = NSFont.systemFont(ofSize: size, weight: weight)
        let natural = font.ascender.rounded(.up) - font.descender.rounded(.down) + font.leading.rounded(.up)
        let extra = max(height - natural, 0)
        return self
            .lineSpacing(extra)
            .padding(.vertical, extra / 2)
    }
}
