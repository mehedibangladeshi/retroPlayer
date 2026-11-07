# Activate a window the way a taskbar does on X11 (_NET_ACTIVE_WINDOW, source 2 = pager): python3 activate-linux.py xid
import ctypes, sys
X = ctypes.cdll.LoadLibrary('libX11.so.6')
X.XOpenDisplay.restype = ctypes.c_void_p
X.XInternAtom.restype = ctypes.c_ulong
X.XInternAtom.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
X.XDefaultRootWindow.restype = ctypes.c_ulong
X.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
X.XSendEvent.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_long, ctypes.c_void_p]
class ClientMessage(ctypes.Structure):
    _fields_ = [('type', ctypes.c_int), ('serial', ctypes.c_ulong), ('send_event', ctypes.c_int), ('display', ctypes.c_void_p),
                ('window', ctypes.c_ulong), ('message_type', ctypes.c_ulong), ('format', ctypes.c_int), ('data', ctypes.c_long * 5)]
class XEvent(ctypes.Union):
    _fields_ = [('xclient', ClientMessage), ('pad', ctypes.c_long * 24)]
d = ctypes.c_void_p(X.XOpenDisplay(None))
e = XEvent()
m = e.xclient
m.type = 33  # ClientMessage
m.send_event = 1
m.window = int(sys.argv[1])
m.message_type = X.XInternAtom(d, b'_NET_ACTIVE_WINDOW', 0)
m.format = 32
m.data[0] = 2  # source: pager/taskbar
SUBSTRUCTURE_NOTIFY, SUBSTRUCTURE_REDIRECT = 1 << 19, 1 << 20
X.XSendEvent(d, X.XDefaultRootWindow(d), 0, SUBSTRUCTURE_NOTIFY | SUBSTRUCTURE_REDIRECT, ctypes.byref(e))
X.XFlush(d)
X.XCloseDisplay(d)
