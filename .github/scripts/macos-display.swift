/**
 * [INPUT]: A GitHub Actions macOS login session and its supported Core Graphics display modes.
 * [OUTPUT]: A session-scoped native desktop of at least 1920 by 1080, with JSON evidence or a failing exit.
 * [POS]: Release-test environment preparation; never runs against an owner's local desktop.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import CoreGraphics
import Foundation

var report: [String: Any] = [:]
func finish(_ passed: Bool, _ error: String? = nil) -> Never {
    report["passed"] = passed
    if let error { report["error"] = error }
    let data = try! JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
    exit(passed ? 0 : 1)
}
guard ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] == "true" else {
    finish(false, "Display preparation is restricted to GitHub Actions")
}
let display = CGMainDisplayID()
func bounds() -> [String: Int] {
    let rect = CGDisplayBounds(display)
    return ["width": Int(rect.width), "height": Int(rect.height)]
}
func sufficient(_ value: [String: Int]) -> Bool {
    value["width", default: 0] >= 1920 && value["height", default: 0] >= 1080
}
report["before"] = bounds()
let modes = CGDisplayCopyAllDisplayModes(display, nil) as? [CGDisplayMode] ?? []
report["availableModes"] = modes.map { ["width": $0.width, "height": $0.height, "pixelWidth": $0.pixelWidth, "pixelHeight": $0.pixelHeight] }
if !sufficient(bounds()) {
    let candidates = modes.filter { $0.width >= 1920 && $0.height >= 1080 && $0.isUsableForDesktopGUI() }
        .sorted { $0.width * $0.height < $1.width * $1.height }
    guard let mode = candidates.first else { finish(false, "No supported native display mode meets 1920 by 1080") }
    var configuration: CGDisplayConfigRef?
    let begin = CGBeginDisplayConfiguration(&configuration)
    guard begin == .success else { finish(false, "Display configuration failed: \(begin.rawValue)") }
    let change = CGConfigureDisplayWithDisplayMode(configuration, display, mode, nil)
    guard change == .success else {
        CGCancelDisplayConfiguration(configuration)
        finish(false, "Display mode selection failed: \(change.rawValue)")
    }
    let complete = CGCompleteDisplayConfiguration(configuration, .forSession)
    guard complete == .success else { finish(false, "Display mode commit failed: \(complete.rawValue)") }
}
report["after"] = bounds()
guard sufficient(bounds()) else { finish(false, "Native desktop bounds remain below the acceptance requirement") }
finish(true)
