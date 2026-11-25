import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  Captions as CaptionsIcon,
  Copy,
  Pause,
  Play,
  Square,
} from "lucide-preact";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { toast } from "../components/ui/sonner";
import { copyText } from "../lib/clipboard";
import { cn } from "../lib/utils";

type ConnectionState = "idle" | "connecting" | "live" | "disconnected";

interface SelectionOffsets {
  start: number;
  end: number;
  backward: boolean;
}

const WS_URL = "ws://localhost:8765";
const RECONNECT_DELAY = 2000;
const BOTTOM_SLACK = 60;

function selectionOffsets(node: Text): SelectionOffsets | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (range.startContainer !== node || range.endContainer !== node) {
    return null;
  }

  return {
    start: range.startOffset,
    end: range.endOffset,
    backward:
      (selection as Selection & { direction?: string }).direction === "backward",
  };
}

function restoreSelection(
  node: Text,
  saved: SelectionOffsets,
  length: number
) {
  const selection = window.getSelection();
  if (!selection) return;

  const start = Math.min(saved.start, length);
  const end = Math.min(saved.end, length);
  if (start >= end) return;

  if (saved.backward && typeof selection.setBaseAndExtent === "function") {
    selection.setBaseAndExtent(node, end, node, start);
    return;
  }

  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  selection.removeAllRanges();
  selection.addRange(range);
}

function hasSelection(node: Text): boolean {
  const selection = window.getSelection();
  return Boolean(
    selection &&
      !selection.isCollapsed &&
      selection.rangeCount > 0 &&
      selection.getRangeAt(0).commonAncestorContainer === node
  );
}

export function Captions({ active }: { active: boolean }) {
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [paused, setPaused] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [starting, setStarting] = useState(false);
  const [hasText, setHasText] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textHostRef = useRef<HTMLDivElement>(null);
  const textNodeRef = useRef<Text | null>(null);
  const renderedTextRef = useRef("");
  const latestTextRef = useRef("");
  const draggingRef = useRef(false);
  const pendingTextRef = useRef<string | null>(null);
  const pausedRef = useRef(false);
  const pinnedRef = useRef(true);

  const ensureTextNode = useCallback((): Text | null => {
    const host = textHostRef.current;
    if (!host) return null;

    if (textNodeRef.current && textNodeRef.current.parentNode === host) {
      return textNodeRef.current;
    }

    const node = document.createTextNode(renderedTextRef.current);
    host.appendChild(node);
    textNodeRef.current = node;
    return node;
  }, []);

  const applyTranscript = useCallback(
    (next: string) => {
      const node = ensureTextNode();
      if (!node) return;

      const previous = renderedTextRef.current;
      if (next === previous) return;

      const selection = draggingRef.current ? null : selectionOffsets(node);
      let common = 0;
      const max = Math.min(previous.length, next.length);
      while (
        common < max &&
        previous.charCodeAt(common) === next.charCodeAt(common)
      ) {
        common += 1;
      }

      if (common === previous.length) {
        node.appendData(next.slice(common));
      } else {
        node.replaceData(common, previous.length - common, next.slice(common));
      }

      renderedTextRef.current = next;
      latestTextRef.current = next;
      setHasText(next.length > 0);

      if (selection && common < selection.end) {
        restoreSelection(node, selection, next.length);
      }

      const scroller = scrollRef.current;
      if (scroller && pinnedRef.current && !hasSelection(node)) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    },
    [ensureTextNode]
  );

  useEffect(() => {
    ensureTextNode();
  }, [ensureTextNode]);

  useEffect(() => {
    if (!active) {
      setConnection("idle");
      return;
    }

    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let disposed = false;

    const connect = () => {
      if (disposed) return;

      setConnection("connecting");
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        if (!disposed) setConnection("live");
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (typeof data.text !== "string") return;

          latestTextRef.current = data.text;
          if (pausedRef.current) return;
          if (draggingRef.current) {
            pendingTextRef.current = data.text;
            return;
          }

          applyTranscript(data.text);
        } catch {
          // Ignore malformed messages.
        }
      };

      socket.onclose = () => {
        if (disposed) return;
        setConnection("disconnected");
        retryTimer = window.setTimeout(connect, RECONNECT_DELAY);
      };

      socket.onerror = () => socket?.close();
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, [active, applyTranscript]);

  useEffect(() => {
    const endDrag = () => {
      if (!draggingRef.current) return;

      draggingRef.current = false;
      const pending = pendingTextRef.current;
      pendingTextRef.current = null;

      if (pending !== null && !pausedRef.current) {
        applyTranscript(pending);
      }
    };

    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    window.addEventListener("blur", endDrag);

    return () => {
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("blur", endDrag);
    };
  }, [applyTranscript]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setFontSize((size) =>
        Math.min(36, Math.max(12, size - Math.sign(event.deltaY) * 2))
      );
    };

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, []);

  const startService = async () => {
    if (!("__TAURI_INTERNALS__" in window)) {
      toast(
        "Launching the caption service is available in the desktop app. You can also run python capture.py manually."
      );
      return;
    }

    setStarting(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<string>("start_captions");
      toast(
        result === "started"
          ? "Caption service started"
          : "Caption service is already running"
      );
      setConnection("connecting");
    } catch (error) {
      toast(String(error));
    } finally {
      setStarting(false);
    }
  };

  const stopService = async () => {
    if (!("__TAURI_INTERNALS__" in window)) {
      toast("Stopping the caption service is available in the desktop app.");
      return;
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<string>("stop_captions");
      toast(
        result === "stopped"
          ? "Caption service stopped"
          : "No caption service started by InterpKit is running"
      );
    } catch (error) {
      toast(String(error));
    }
  };

  const togglePause = () => {
    const next = !paused;
    pausedRef.current = next;
    setPaused(next);

    if (!next) {
      applyTranscript(latestTextRef.current);
    }
  };

  const connectionLabel =
    connection === "live"
      ? "Live"
      : connection === "connecting"
        ? "Connecting to captions…"
        : connection === "disconnected"
          ? "Disconnected"
          : "Captions off";

  const dotClass =
    connection === "live"
      ? "bg-emerald-500 animate-pulse"
      : connection === "connecting"
        ? "bg-amber-500 animate-pulse"
        : connection === "disconnected"
          ? "bg-red-500"
          : "bg-gray-400";

  const emptyMessage =
    connection === "live"
      ? "Connected. Open Windows Live Captions and play some audio."
      : connection === "connecting"
        ? "Connecting to the caption service…"
        : "Start the caption service or run capture.py to see live captions.";

  return (
    <Card>
      <CardContent class="space-y-4 p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class={cn("h-2 w-2 rounded-full", dotClass)} />
              <h2 class="text-lg font-bold">Live Captions</h2>
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {connectionLabel}
              </span>
            </div>
            <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Windows 11 Live Captions · Win + Ctrl + L opens the caption window
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={starting}
              onClick={startService}
            >
              <Play size={14} class="mr-1.5" />
              {starting ? "Starting…" : "Start service"}
            </Button>
            <Button variant="ghost" size="sm" onClick={stopService}>
              <Square size={13} class="mr-1.5" /> Stop
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!hasText}
              onClick={togglePause}
            >
              {paused ? (
                <Play size={14} class="mr-1.5" />
              ) : (
                <Pause size={14} class="mr-1.5" />
              )}
              {paused ? "Resume" : "Pause"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!hasText}
              onClick={() => copyText(renderedTextRef.current)}
            >
              <Copy size={14} class="mr-1.5" /> Copy
            </Button>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-400">
          <span>
            Captions stay on this device. Start the service after opening Live
            Captions.
          </span>
          <div class="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              class="h-7 px-2 text-xs"
              aria-label="Decrease caption text size"
              onClick={() => setFontSize((size) => Math.max(12, size - 2))}
            >
              A−
            </Button>
            <span class="w-9 text-center tabular-nums">{fontSize}px</span>
            <Button
              variant="ghost"
              size="sm"
              class="h-7 px-2 text-xs"
              aria-label="Increase caption text size"
              onClick={() => setFontSize((size) => Math.min(36, size + 2))}
            >
              A+
            </Button>
          </div>
        </div>

        <div
          ref={scrollRef}
          onPointerDown={() => {
            draggingRef.current = true;
          }}
          onScroll={(event) => {
            const element = event.currentTarget;
            pinnedRef.current =
              element.scrollHeight - element.scrollTop - element.clientHeight <
              BOTTOM_SLACK;
          }}
          class="relative max-h-[55vh] min-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 leading-relaxed text-gray-900 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-100"
          style={{ fontSize: `${fontSize}px` }}
        >
          <div ref={textHostRef} class="whitespace-pre-wrap" />

          <div
            class={cn(
              "pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-sm text-gray-400 dark:text-gray-500",
              hasText && "hidden"
            )}
          >
            <CaptionsIcon size={22} />
            <span>{emptyMessage}</span>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-400">
          <span>
            Service launching requires Python 3 with{" "}
            <code class="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-700">
              comtypes
            </code>{" "}
            and{" "}
            <code class="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-700">
              websockets
            </code>
            .
          </span>
          <span>Ctrl + scroll to zoom</span>
        </div>

        {paused && (
          <p class="text-[11px] text-amber-600 dark:text-amber-400">
            Updates are paused. Resume to show the latest captions.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
