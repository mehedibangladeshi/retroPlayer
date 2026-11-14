// Real right-click on macOS, then Escape to close any menu: swift rclick-mac.swift x y (points)
import CoreGraphics
import Foundation
let a = CommandLine.arguments.dropFirst().map { Double($0)! }
let p = CGPoint(x: a[0], y: a[1])
func post(_ t: CGEventType) { CGEvent(mouseEventSource: nil, mouseType: t, mouseCursorPosition: p, mouseButton: .right)!.post(tap: .cghidEventTap) }
CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left)!.post(tap: .cghidEventTap); usleep(150_000)
post(.rightMouseDown); usleep(100_000)
post(.rightMouseUp); usleep(1_000_000)
for down in [true, false] { CGEvent(keyboardEventSource: nil, virtualKey: 0x35, keyDown: down)!.post(tap: .cghidEventTap) }
