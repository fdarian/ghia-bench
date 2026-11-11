import Darwin
import Foundation

enum ProcessTree {
    static func children(of pid: pid_t) -> [pid_t] {
        var capacity = 256
        while true {
            var buffer = [pid_t](repeating: 0, count: capacity)
            let bytes = proc_listchildpids(pid, &buffer, Int32(capacity * MemoryLayout<pid_t>.size))
            if bytes <= 0 { return [] }
            let count = Int(bytes)
            if count < capacity { return Array(buffer[0..<count]) }
            capacity *= 4
        }
    }

    static func descendants(of root: pid_t) -> [pid_t] {
        var result: [pid_t] = []
        var queue = [root]
        while !queue.isEmpty {
            let next = queue.removeFirst()
            for child in children(of: next) where !result.contains(child) {
                result.append(child)
                queue.append(child)
            }
        }
        return result
    }

    static func name(of pid: pid_t) -> String? {
        var buffer = [CChar](repeating: 0, count: 64)
        guard proc_name(pid, &buffer, UInt32(buffer.count)) > 0 else { return nil }
        return String(cString: buffer)
    }

    static func parent(of pid: pid_t) -> pid_t? {
        var info = proc_bsdinfo()
        let size = Int32(MemoryLayout<proc_bsdinfo>.size)
        guard proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, size) == size else { return nil }
        return pid_t(info.pbi_ppid)
    }

    static func killTree(root: pid_t) {
        let all = descendants(of: root)
        for pid in all.reversed() { kill(pid, SIGKILL) }
        kill(root, SIGKILL)
    }
}

enum Rusage {
    /// nil when the process is gone or not inspectable.
    static func read(pid: pid_t) -> [String: Any]? {
        var v6 = rusage_info_v6()
        let v6Result = withUnsafeMutablePointer(to: &v6) { pointer in
            pointer.withMemoryRebound(to: rusage_info_t?.self, capacity: 1) {
                proc_pid_rusage(pid, RUSAGE_INFO_V6, $0)
            }
        }
        if v6Result == 0 {
            return fields(
                user: v6.ri_user_time, system: v6.ri_system_time, instructions: v6.ri_instructions,
                cycles: v6.ri_cycles, energy: v6.ri_energy_nj, idle: v6.ri_pkg_idle_wkups,
                interrupt: v6.ri_interrupt_wkups, footprint: v6.ri_phys_footprint, resident: v6.ri_resident_size)
        }
        var v4 = rusage_info_v4()
        let v4Result = withUnsafeMutablePointer(to: &v4) { pointer in
            pointer.withMemoryRebound(to: rusage_info_t?.self, capacity: 1) {
                proc_pid_rusage(pid, RUSAGE_INFO_V4, $0)
            }
        }
        guard v4Result == 0 else { return nil }
        return fields(
            user: v4.ri_user_time, system: v4.ri_system_time, instructions: v4.ri_instructions,
            cycles: v4.ri_cycles, energy: nil, idle: v4.ri_pkg_idle_wkups,
            interrupt: v4.ri_interrupt_wkups, footprint: v4.ri_phys_footprint, resident: v4.ri_resident_size)
    }

    private static func fields(
        user: UInt64, system: UInt64, instructions: UInt64, cycles: UInt64, energy: UInt64?,
        idle: UInt64, interrupt: UInt64, footprint: UInt64, resident: UInt64
    ) -> [String: Any] {
        [
            "userNs": Mach.ns(fromTicks: user),
            "sysNs": Mach.ns(fromTicks: system),
            "instructions": instructions,
            "cycles": cycles,
            "energyNj": nullable(energy),
            "idleWakeups": idle,
            "interruptWakeups": interrupt,
            "footprint": footprint,
            "resident": resident,
        ]
    }
}

func sampleTree(root: pid_t) throws -> [String: Any] {
    let tNs = Mach.nowNs()
    var procs: [[String: Any]] = []
    var rootSeen = false
    let gpuNsByPid = try Gpu.accumulatedNsByPid()
    for pid in [root] + ProcessTree.descendants(of: root) {
        // A child can exit between listing and reading; the root cannot.
        guard var entry = Rusage.read(pid: pid) else { continue }
        if pid == root { rootSeen = true }
        entry["gpuNs"] = gpuNsByPid[pid] ?? 0
        entry["pid"] = Int(pid)
        entry["ppid"] = nullable(ProcessTree.parent(of: pid).map { Int($0) })
        entry["name"] = nullable(ProcessTree.name(of: pid))
        procs.append(entry)
    }
    guard rootSeen else { throw HelperError("pid \(root) is not running or not inspectable") }
    return ["tNs": tNs, "procs": procs]
}
