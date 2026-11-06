import { describe, expect, test } from "bun:test"
import { goVersion, gpuiSource, mygoVersion, swiftVersion, xcodeVersion } from "./build-stamp"

describe("mygoVersion", () => {
  test("reads the egoist/mygo requirement in block or single-line form", () => {
    const block = "module mailbox\n\ngo 1.24.2\n\nrequire (\n\tgithub.com/egoist/mygo v0.3.1\n\tgolang.org/x/sys v0.1.0\n)\n"
    expect(mygoVersion(block)).toBe("v0.3.1")
    expect(mygoVersion("module m\ngo 1.22\nrequire github.com/egoist/mygo v0.0.0-2026\n")).toBe("v0.0.0-2026")
  })
  test("a go.mod without it is an error, not a guess", () => {
    expect(() => mygoVersion("module m\n")).toThrow()
  })
})

describe("gpuiSource", () => {
  const sha = "654efae441bc8eb117d0042bb28cd7cf3570bdc9"
  test("reads the git url and resolved commit of the gpui package", () => {
    const lock = `[[package]]\nname = "gpui_macros"\nversion = "0.1.0"\nsource = "git+https://github.com/zed-industries/zed?branch=main#${"0".repeat(40)}"\n\n[[package]]\nname = "gpui"\nversion = "0.2.2"\nsource = "git+https://github.com/zed-industries/zed?branch=main#${sha}"\n`
    expect(gpuiSource(lock)).toEqual({ git: "https://github.com/zed-industries/zed", commit: sha })
  })
  test("a registry or path gpui is an error, not a guess", () => {
    expect(() => gpuiSource('[[package]]\nname = "gpui"\nversion = "0.2.2"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n')).toThrow()
    expect(() => gpuiSource('[[package]]\nname = "gpui"\nversion = "0.2.2"\n')).toThrow()
  })
})

describe("tool version parsers", () => {
  test("swift, xcode and go", () => {
    expect(swiftVersion("Apple Swift version 6.4.2 (swiftlang-6.4.2.1.9 clang-2100.4.1.1)\nTarget: arm64-apple-macosx27.0")).toBe("6.4.2")
    expect(xcodeVersion("Xcode 27.2\nBuild version 27B52")).toEqual({ xcode: "27.2", xcodeBuild: "27B52" })
    expect(goVersion("go version go1.27.3 darwin/arm64")).toBe("1.27.3")
  })
  test("unexpected output is an error", () => {
    expect(() => swiftVersion("swift: command not found")).toThrow()
    expect(() => xcodeVersion("xcode-select: error")).toThrow()
    expect(() => goVersion("")).toThrow()
  })
})
