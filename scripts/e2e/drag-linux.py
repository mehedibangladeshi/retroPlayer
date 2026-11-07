# Real pointer drag on X11/XWayland through XTest: python3 drag-linux.py x0 y0 dx dy steps
import ctypes, sys, time
x0, y0, dx, dy, steps = map(int, sys.argv[1:6])
X = ctypes.cdll.LoadLibrary('libX11.so.6')
T = ctypes.cdll.LoadLibrary('libXtst.so.6')
X.XOpenDisplay.restype = ctypes.c_void_p
d = ctypes.c_void_p(X.XOpenDisplay(None))
def move(x, y):
    T.XTestFakeMotionEvent(d, -1, x, y, 0); X.XFlush(d)
move(x0, y0); time.sleep(0.15)
T.XTestFakeButtonEvent(d, 1, True, 0); X.XFlush(d); time.sleep(0.15)
for i in range(1, steps + 1):
    move(x0 + dx * i // steps, y0 + dy * i // steps); time.sleep(0.03)
time.sleep(0.15)
T.XTestFakeButtonEvent(d, 1, False, 0); X.XFlush(d)
X.XCloseDisplay(d)
