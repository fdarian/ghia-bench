// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "benchstatus",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "benchstatus",
            path: "Sources/benchstatus"
        )
    ]
)
