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

type CaptureState =
  | "idle"
  | "starting"
  | "running"
  | "waiting"
  | "stopped"
  | "error";

interface CaptionStatusPayload {
  state: CaptureState;
  message?: string;
}

interface CaptionSnapshot {
  running: boolean;
  state: CaptureState;
  message?: string;
  text: string;
}

interface SelectionOffsets {
  start: number;
  end: number;
  backward: boolean;
}

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

export function Captions() {
  const [captureState, setCaptureState] = useState<CaptureState>("stopped");
  const [captureMessage, setCaptureMessage] = useState("");
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
    if (!("__TAURI_INTERNALS__" in window)) {
      setCaptureState("stopped");
      return;
    }

    let disposed = false;
    let unlistenText: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;

    (async () => {
      const [{ listen }, { invoke }] = await Promise.all([
        import("@tauri-apps/api/event"),
        import("@tauri-apps/api/core"),
      ]);

      unlistenText = await listen<string>("captions:text", (event) => {
        if (!disposed) applyTranscript(event.payload);
      });
      if (disposed) {
        unlistenText();
        return;
      }

      unlistenStatus = await listen<CaptionStatusPayload>(
        "captions:status",
        (event) => {
          if (disposed) return;
          setCaptureState(event.payload.state);
          setCaptureMessage(event.payload.message ?? "");
        }
      );
      if (disposed) {
        unlistenStatus();
        unlistenText?.();
        return;
      }

      try {
        const snapshot = await invoke<CaptionSnapshot>("captions_status");
        if (disposed) return;

        setCaptureState(snapshot.state || "stopped");
        setCaptureMessage(snapshot.message ?? "");
        if (snapshot.text) applyTranscript(snapshot.text);
      } catch {
        // The command is only available in the desktop app.
      }
    })();

    return () => {
      disposed = true;
      unlistenText?.();
      unlistenStatus?.();
    };
  }, [applyTranscript]);

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

  const startCapture = async () => {
    if (!("__TAURI_INTERNALS__" in window)) {
      toast("Captions are only available in the desktop app.");
      return;
    }

    setStarting(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<string>("start_captions");
      toast(
        result === "started"
          ? "Capturing Live Captions"
          : "Capture is already running"
      );
    } catch (error) {
      toast(String(error));
    } finally {
      setStarting(false);
    }
  };

  const stopCapture = async () => {
    if (!("__TAURI_INTERNALS__" in window)) {
      toast("Captions are only available in the desktop app.");
      return;
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<string>("stop_captions");
      toast(
        result === "stopped" ? "Capture stopped" : "Capture is not running"
      );
      setCaptureState("stopped");
      setCaptureMessage("");
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

  const captureLabel =
    captureState === "running"
      ? "Live"
      : captureState === "waiting"
        ? "Waiting for Live Captions"
        : captureState === "starting"
          ? "Starting capture…"
          : captureState === "error"
            ? "Capture error"
            : "Stopped";

  const dotClass =
    captureState === "running"
      ? "bg-emerald-500 animate-pulse"
      : captureState === "starting" || captureState === "waiting"
        ? "bg-amber-500 animate-pulse"
        : captureState === "error"
          ? "bg-red-500"
          : "bg-gray-400";

  const emptyMessage =
    captureState === "running"
      ? "Connected. Waiting for audio from Windows Live Captions."
      : captureState === "waiting"
        ? "Open Windows Live Captions with Win + Ctrl + L."
        : captureState === "starting"
          ? "Starting the native capture thread…"
          : captureState === "error"
            ? captureMessage || "Could not read Windows Live Captions."
            : "Click Start capture to read Windows Live Captions.";

  const isCapturing =
    captureState === "running" ||
    captureState === "waiting" ||
    captureState === "starting";

  return (
    <Card>
      <CardContent class="space-y-4 p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class={cn("h-2 w-2 rounded-full", dotClass)} />
              <h2 class="text-lg font-bold">Live Captions</h2>
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {captureLabel}
              </span>
            </div>
            <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Windows 11 Live Captions · read natively through UI Automation
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={starting || isCapturing}
              onClick={startCapture}
            >
              <Play size={14} class="mr-1.5" />
              {starting ? "Starting…" : "Start capture"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!isCapturing}
              onClick={stopCapture}
            >
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
            Captions stay on this device. Open Live Captions first, then start
            capture.
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

        {captureState === "error" && hasText && captureMessage && (
          <p class="text-[11px] text-red-600 dark:text-red-400">
            {captureMessage}
          </p>
        )}

        <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-400">
          <span>
            Captions are read locally from Windows Live Captions and are never
            saved or sent anywhere.
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
