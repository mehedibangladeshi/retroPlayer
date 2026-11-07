// Real pointer drag on macOS through CGEvent: swift drag-mac.swift x0 y0 dx dy steps (points)
import CoreGraphics
import Foundation
let a = CommandLine.arguments.dropFirst().map { Double($0)! }
let (x0, y0, dx, dy, steps) = (a[0], a[1], a[2], a[3], Int(a[4]))
func post(_ t: CGEventType, _ x: Double, _ y: Double) {
  CGEvent(mouseEventSource: nil, mouseType: t, mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: .left)!.post(tap: .cghidEventTap)
}
post(.mouseMoved, x0, y0); usleep(150_000)
post(.leftMouseDown, x0, y0); usleep(150_000)
for i in 1...steps {
  post(.leftMouseDragged, x0 + dx * Double(i) / Double(steps), y0 + dy * Double(i) / Double(steps)); usleep(30_000)
}
usleep(150_000)
post(.leftMouseUp, x0 + dx, y0 + dy)
