r"""Scrape the Windows 11 Live Captions window and stream the transcript over WebSocket.

Why UI Automation and not pywinauto:
    pywinauto's UIA backend enumerates every top-level window on the desktop when
    connecting, which hangs on some machines. Talking to UIAutomationCore directly
    lets us jump straight to the Live Captions window handle (found with Win32
    EnumWindows), which takes a few milliseconds per poll.

Usage:
    python capture.py
    python capture.py --no-web   # WebSocket only; no built-in viewer on :8000
    open http://localhost:8000

Requires: comtypes, websockets  (pip install comtypes websockets)
"""

import asyncio
import ctypes
import functools
import json
import sys
import threading
from ctypes import wintypes
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import comtypes
import comtypes.client
import websockets

try:
    from comtypes.gen import UIAutomationClient as UIA
except ImportError:  # generated on first run on a fresh machine
    comtypes.client.GetModule("UIAutomationCore.dll")
    from comtypes.gen import UIAutomationClient as UIA

WINDOW_CLASS = "LiveCaptionsDesktopWindow"
CAPTION_AUTO_IDS = ("CaptionsTextBlock", "CaptionsScrollViewer")
POLL_INTERVAL = 0.25
HOST = "localhost"
PORT = 8765
WEB_PORT = 8000
WEB_ROOT = Path(__file__).resolve().parent

user32 = ctypes.WinDLL("user32", use_last_error=True)
EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

connected_clients = set()
last_text = ""
transcript = ""


def find_caption_window():
    """Return the HWND of the Live Captions window, or None."""
    hwnds = []

    def _callback(hwnd, _lparam):
        name = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, name, 256)
        if name.value == WINDOW_CLASS:
            hwnds.append(hwnd)
            return False
        return True

    user32.EnumWindows(EnumWindowsProc(_callback), 0)
    return hwnds[0] if hwnds else None


def read_caption_text(uia, hwnd):
    """Read the current caption text from the Live Captions window."""
    root = uia.ElementFromHandle(hwnd)

    for auto_id in CAPTION_AUTO_IDS:
        condition = uia.CreatePropertyCondition(
            UIA.UIA_AutomationIdPropertyId, auto_id
        )
        node = root.FindFirst(UIA.TreeScope_Descendants, condition)
        if node is not None:
            text = node.CurrentName
            if text:
                return text

    # Last resort: any non-empty Text control under the window.
    is_text = uia.CreatePropertyCondition(
        UIA.UIA_ControlTypePropertyId, UIA.UIA_TextControlTypeId
    )
    node = root.FindFirst(UIA.TreeScope_Descendants, is_text)
    if node is not None:
        text = node.CurrentName
        if text and text.strip():
            return text

    return None


class CaptionWatcher(threading.Thread):
    """Owns the UIA COM object on its own thread and pushes text to the event loop."""

    def __init__(self, loop, on_text):
        super().__init__(name="caption-watcher", daemon=True)
        self.loop = loop
        self.on_text = on_text
        self._stop = threading.Event()

    def stop(self):
        self._stop.set()

    def run(self):
        comtypes.CoInitialize()
        try:
            uia = comtypes.client.CreateObject(
                UIA.CUIAutomation, interface=UIA.IUIAutomation
            )
            previous = None
            warned = False

            while not self._stop.is_set():
                hwnd = find_caption_window()
                if hwnd is None:
                    if not warned:
                        print("[warn] Live Captions window not found. Open it with Win+Ctrl+L.")
                        warned = True
                    previous = None  # resend state when the window comes back
                    self._stop.wait(POLL_INTERVAL)
                    continue

                if warned:
                    print("[info] Live Captions window found.")
                    warned = False

                try:
                    text = read_caption_text(uia, hwnd)
                except Exception as exc:
                    print(f"[error] reading captions failed: {type(exc).__name__}: {exc}")
                    text = None

                if text is not None and text != previous:
                    previous = text
                    asyncio.run_coroutine_threadsafe(self.on_text(text), self.loop)

                self._stop.wait(POLL_INTERVAL)
        finally:
            comtypes.CoUninitialize()


async def broadcast(message):
    if connected_clients:
        await asyncio.gather(
            *[client.send(message) for client in connected_clients],
            return_exceptions=True,
        )


SNAPSHOT_LIMIT = 8000  # Live Captions never exposes more than a screenful
OVERLAP_LIMIT = 20000  # how much of our transcript we are willing to re-match
MIN_OVERLAP = 8  # shorter coincidences ("s", "on") are noise, not a continuation


def split_live_line(text):
    """Split a snapshot into (settled lines, newest line).

    The last line is the one Live Captions is still working on: it grows word by
    word and is rewritten whenever recognition is revised ("Hello guys it's" ->
    "Hello guys it's your boy"). Every line above it is final.
    """
    text = text.rstrip()
    settled, _, live = text.rpartition("\n")
    return settled, live


def longest_overlap(transcript, update):
    """Length of the longest suffix of `transcript` that occurs inside `update`."""
    max_len = min(len(transcript), len(update))
    lo, hi = 0, max_len  # lo is always a valid (empty) match
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if transcript[-mid:] in update:
            lo = mid
        else:
            hi = mid - 1
    return lo


def merge_transcript(transcript, update):
    """Stitch a Live Captions snapshot onto what we already have.

    Live Captions only exposes a rolling window of its newest lines, and that
    window slides, grows and shrinks as lines scroll in and out. Two consequences:

    1. The new snapshot does not necessarily start where our transcript ends, so
       we cannot anchor on a prefix of the update. We look for the longest
       suffix of our settled text that appears *anywhere* in the snapshot's
       settled text, then append whatever follows it.
    2. The last line is unstable, so matching on it never succeeds -- the old
       code appended the whole snapshot instead, which is what duplicated whole
       blocks over and over. We match only settled lines and always take the
       live line verbatim from the newest snapshot.
    """
    update = update.replace("\r\n", "\n")
    transcript = transcript.rstrip()
    update = update.rstrip()
    if not transcript:
        return update
    if not update:
        return transcript

    if len(update) > SNAPSHOT_LIMIT:
        # Keep the newest text, but never start on a half-cut line.
        update = update[-SNAPSHOT_LIMIT:].split("\n", 1)[-1]

    settled = split_live_line(transcript)[0]
    snapshot_settled, snapshot_live = split_live_line(update)

    if not settled:
        # Nothing settled yet, so the whole transcript is one still-changing line.
        body = snapshot_settled
    else:
        tail = settled[-OVERLAP_LIMIT:]
        matched = longest_overlap(tail, snapshot_settled)
        # A snapshot whose settled text we already have end-to-end is a match
        # even when it is only a few characters long (nothing new was spoken).
        if matched >= MIN_OVERLAP or (snapshot_settled and matched == len(snapshot_settled)):
            anchor = snapshot_settled.rfind(tail[-matched:])
            body = settled + snapshot_settled[anchor + matched:]
        elif snapshot_settled:
            # No overlap at all: the window scrolled past everything we had.
            body = settled + "\n" + snapshot_settled
        else:
            body = settled

    if snapshot_live:
        return body + "\n" + snapshot_live
    return body


async def publish(raw_text):
    global last_text, transcript
    transcript = merge_transcript(transcript, raw_text)
    if transcript == last_text:
        return
    last_text = transcript
    lines = [line for line in transcript.strip().splitlines() if line.strip()]
    print(f"[caption] {lines[-1] if lines else ''}")
    await broadcast(json.dumps({"text": transcript}))


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass


def start_web_server():
    """Serve this folder (index.html) on port 8000 from a background thread."""
    try:
        httpd = ThreadingHTTPServer(
            ("", WEB_PORT), functools.partial(QuietHandler, directory=str(WEB_ROOT))
        )
    except OSError as exc:
        print(f"[warn] Could not serve the page on port {WEB_PORT}: {exc}")
        return None
    threading.Thread(
        target=httpd.serve_forever, daemon=True, name="web-server"
    ).start()
    return httpd


async def handler(websocket):
    connected_clients.add(websocket)
    print(f"[ws] Client connected. Total: {len(connected_clients)}")
    if last_text:
        try:
            await websocket.send(json.dumps({"text": last_text}))
        except Exception:
            pass
    try:
        await websocket.wait_closed()
    finally:
        connected_clients.discard(websocket)
        print(f"[ws] Client disconnected. Total: {len(connected_clients)}")


async def main():
    loop = asyncio.get_running_loop()
    watcher = CaptionWatcher(loop, publish)
    watcher.start()

    web_server = None
    if "--no-web" not in sys.argv:
        web_server = start_web_server()
        if web_server is None:
            print(
                f"[warn] Port {WEB_PORT} is busy; open the page from whatever is already serving it."
            )

    async with websockets.serve(handler, HOST, PORT):
        print(f"WebSocket server running on ws://{HOST}:{PORT}")
        if web_server is not None:
            print(f"Viewer ready at http://localhost:{WEB_PORT}  (Ctrl+C to quit)")
        else:
            print("Press Ctrl+C to quit.")
        try:
            await asyncio.Future()
        finally:
            watcher.stop()
            if web_server is not None:
                web_server.shutdown()


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nShutting down.")
