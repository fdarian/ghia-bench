import Foundation

func dispatch(_ argv: [String]) throws -> [String: Any] {
    guard argv.count >= 2 else { throw HelperError("usage: benchhelper probe|launch|sample|window|phase [options]") }
    let rest = argv[2...]
    switch argv[1] {
    case "probe":
        return try probe()
    case "launch":
        return try launch(args: try Args(rest, flagNames: ["--capture"]))
    case "sample":
        return try sampleTree(root: try Args(rest, flagNames: []).pid("--pid"))
    case "window":
        return try windowStatus(pid: try Args(rest, flagNames: []).pid("--pid"))
    case "phase":
        return try phase(args: try Args(rest, flagNames: ["--capture"]))
    default:
        throw HelperError("unknown subcommand \(argv[1])")
    }
}

do {
    try emit(try dispatch(CommandLine.arguments))
} catch {
    warn("benchhelper: \(error)")
    exit(1)
}
