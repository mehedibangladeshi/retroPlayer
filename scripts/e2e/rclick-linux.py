# Real right-click on X11/XWayland through XTest, then Escape to close any menu: python3 rclick-linux.py x y
import ctypes, sys, time
x, y = map(int, sys.argv[1:3])
X = ctypes.cdll.LoadLibrary('libX11.so.6')
T = ctypes.cdll.LoadLibrary('libXtst.so.6')
X.XOpenDisplay.restype = ctypes.c_void_p
d = ctypes.c_void_p(X.XOpenDisplay(None))
T.XTestFakeMotionEvent(d, -1, x, y, 0); X.XFlush(d); time.sleep(0.15)
T.XTestFakeButtonEvent(d, 3, True, 0); X.XFlush(d); time.sleep(0.1)
T.XTestFakeButtonEvent(d, 3, False, 0); X.XFlush(d); time.sleep(1)
esc = X.XKeysymToKeycode(d, 0xff1b)
T.XTestFakeKeyEvent(d, esc, True, 0); T.XTestFakeKeyEvent(d, esc, False, 0); X.XFlush(d)
X.XCloseDisplay(d)
