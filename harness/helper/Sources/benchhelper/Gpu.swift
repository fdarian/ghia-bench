import Foundation
import IOKit

enum Gpu {
    /// Cumulative GPU nanoseconds per pid, summed over every accelerator user client the pid owns (the source of
    /// Activity Monitor's GPU column). A pid with no user client that has AppUsage is absent: it submitted nothing.
    static func accumulatedNsByPid() throws -> [pid_t: UInt64] {
        var services: io_iterator_t = 0
        let matchResult = IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching("IOAccelerator"), &services)
        guard matchResult == KERN_SUCCESS else { throw HelperError("IOServiceGetMatchingServices(IOAccelerator) failed: \(matchResult)") }
        defer { IOObjectRelease(services) }

        var totals: [pid_t: UInt64] = [:]
        var acceleratorCount = 0
        while case let accelerator = IOIteratorNext(services), accelerator != 0 {
            defer { IOObjectRelease(accelerator) }
            acceleratorCount += 1
            try accumulate(into: &totals, childrenOf: accelerator)
        }
        guard acceleratorCount > 0 else { throw HelperError("no IOAccelerator service found") }
        return totals
    }

    private static func accumulate(into totals: inout [pid_t: UInt64], childrenOf accelerator: io_registry_entry_t) throws {
        var children: io_iterator_t = 0
        let childResult = IORegistryEntryGetChildIterator(accelerator, kIOServicePlane, &children)
        guard childResult == KERN_SUCCESS else { throw HelperError("IORegistryEntryGetChildIterator failed: \(childResult)") }
        defer { IOObjectRelease(children) }
        while case let child = IOIteratorNext(children), child != 0 {
            defer { IOObjectRelease(child) }
            guard let usage = property(child, "AppUsage") as? [[String: Any]], !usage.isEmpty else { continue }
            guard let creator = property(child, "IOUserClientCreator") as? String else {
                throw HelperError("accelerator user client has AppUsage but no IOUserClientCreator")
            }
            let pid = try creatorPid(creator)
            for entry in usage {
                guard let ns = (entry["accumulatedGPUTime"] as? NSNumber)?.uint64Value else {
                    throw HelperError("AppUsage entry for pid \(pid) has no accumulatedGPUTime")
                }
                totals[pid, default: 0] += ns
            }
        }
    }

    private static func property(_ entry: io_registry_entry_t, _ key: String) -> Any? {
        IORegistryEntryCreateCFProperty(entry, key as CFString, kCFAllocatorDefault, 0)?.takeRetainedValue()
    }

    /// "pid 705, WindowServer" -> 705
    private static func creatorPid(_ creator: String) throws -> pid_t {
        guard creator.hasPrefix("pid "),
              let pid = pid_t(creator.dropFirst(4).prefix(while: { $0.isNumber })) else {
            throw HelperError("unparseable IOUserClientCreator: \(creator)")
        }
        return pid
    }
}
