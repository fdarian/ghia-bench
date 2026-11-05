// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Mailbox-SwiftUI",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "Mailbox-SwiftUI", targets: ["Mailbox"])],
    targets: [.executableTarget(name: "Mailbox", path: "Sources/Mailbox")]
)
