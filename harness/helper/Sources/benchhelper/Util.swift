import Darwin
import Foundation

struct HelperError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

enum Mach {
    private static let timebase: mach_timebase_info_data_t = {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return info
    }()

    static func ns(fromTicks ticks: UInt64) -> UInt64 {
        let numer = UInt64(timebase.numer)
        let denom = UInt64(timebase.denom)
        return ticks / denom * numer + ticks % denom * numer / denom
    }

    static func ticks(fromNs ns: UInt64) -> UInt64 {
        let numer = UInt64(timebase.numer)
        let denom = UInt64(timebase.denom)
        return ns / numer * denom + ns % numer * denom / numer
    }

    static func nowNs() -> UInt64 { ns(fromTicks: mach_absolute_time()) }

    static func sleep(ns: UInt64) {
        mach_wait_until(mach_absolute_time() + ticks(fromNs: ns))
    }
}

func nullable(_ value: Any?) -> Any {
    if let value = value { return value }
    return NSNull()
}

func rectJSON(_ rect: CGRect) -> [String: Any] {
    ["x": Double(rect.origin.x), "y": Double(rect.origin.y), "w": Double(rect.size.width), "h": Double(rect.size.height)]
}

struct Args {
    private var values: [String: String] = [:]
    private var flags: Set<String> = []

    init(_ argv: ArraySlice<String>, flagNames: Set<String>) throws {
        var index = argv.startIndex
        while index < argv.endIndex {
            let arg = argv[index]
            guard arg.hasPrefix("--") else { throw HelperError("unexpected argument \(arg)") }
            if flagNames.contains(arg) {
                flags.insert(arg)
                index += 1
                continue
            }
            guard index + 1 < argv.endIndex else { throw HelperError("\(arg) needs a value") }
            values[arg] = argv[index + 1]
            index += 2
        }
    }

    func flag(_ name: String) -> Bool { flags.contains(name) }

    func string(_ name: String) throws -> String {
        guard let value = values[name] else { throw HelperError("missing \(name)") }
        return value
    }

    func optionalString(_ name: String) -> String? { values[name] }

    func int(_ name: String) throws -> Int {
        let text = try string(name)
        guard let value = Int(text) else { throw HelperError("\(name) is not an integer: \(text)") }
        return value
    }

    func optionalInt(_ name: String) throws -> Int? {
        guard values[name] != nil else { return nil }
        return try int(name)
    }

    func pid(_ name: String) throws -> pid_t { pid_t(try int(name)) }
}

func emit(_ object: [String: Any]) throws {
    let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
}

func warn(_ message: String) {
    FileHandle.standardError.write(Data((message + "\n").utf8))
}

func sysctlString(_ name: String) throws -> String {
    var size = 0
    guard sysctlbyname(name, nil, &size, nil, 0) == 0 else { throw HelperError("sysctl \(name) failed") }
    var buffer = [CChar](repeating: 0, count: size)
    guard sysctlbyname(name, &buffer, &size, nil, 0) == 0 else { throw HelperError("sysctl \(name) failed") }
    return String(cString: buffer)
}

func sysctlUInt64(_ name: String) throws -> UInt64 {
    var value: UInt64 = 0
    var size = MemoryLayout<UInt64>.size
    guard sysctlbyname(name, &value, &size, nil, 0) == 0 else { throw HelperError("sysctl \(name) failed") }
    return value
}
