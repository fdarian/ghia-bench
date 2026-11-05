// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "benchhelper",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "benchhelper",
            path: "Sources/benchhelper"
        )
    ]
)
