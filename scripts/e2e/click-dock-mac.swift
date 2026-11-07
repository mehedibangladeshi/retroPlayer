// A real mouse click on an app's Dock icon: swift click-dock-mac.swift <title regex> [index]
// Lists the Dock items (Accessibility), clicks the index-th (default 0) whose title matches. Exit 2 when none, 3 when
// this process may not use Accessibility.
import AppKit
let args = CommandLine.arguments
let match = args[1], index = args.count > 2 ? Int(args[2])! : 0
guard AXIsProcessTrusted() else { print("accessibility not allowed"); exit(3) }
let dock = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.dock").first!
func attr(_ e: AXUIElement, _ a: String) -> AnyObject? {
  var v: AnyObject?
  AXUIElementCopyAttributeValue(e, a as CFString, &v)
  return v
}
var hits: [CGPoint] = []
for list in (attr(AXUIElementCreateApplication(dock.processIdentifier), kAXChildrenAttribute) as? [AXUIElement]) ?? [] {
  for item in (attr(list, kAXChildrenAttribute) as? [AXUIElement]) ?? [] {
    let title = attr(item, kAXTitleAttribute) as? String ?? ""
    var p = CGPoint.zero, s = CGSize.zero
    if let v = attr(item, kAXPositionAttribute) { AXValueGetValue(v as! AXValue, .cgPoint, &p) }
    if let v = attr(item, kAXSizeAttribute) { AXValueGetValue(v as! AXValue, .cgSize, &s) }
    print("item: \(title) at \(p) \(s)")
    if title.range(of: match, options: .regularExpression) != nil { hits.append(CGPoint(x: p.x + s.width / 2, y: p.y + s.height / 2)) }
  }
}
print("matches: \(hits.count)")
guard index < hits.count else { exit(2) }
let c = hits[index]
for t in [CGEventType.mouseMoved, .leftMouseDown, .leftMouseUp] {
  CGEvent(mouseEventSource: nil, mouseType: t, mouseCursorPosition: c, mouseButton: .left)!.post(tap: .cghidEventTap)
  usleep(t == .mouseMoved ? 200_000 : 80_000)
}
