import { useEffect, useRef, useState } from "preact/hooks";
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

const WS_URL = "ws://localhost:8765";
const RECONNECT_DELAY = 2000;
const BOTTOM_SLACK = 60;

export function Captions({ active }: { active: boolean }) {
  const [transcript, setTranscript] = useState("");
  const [displayed, setDisplayed] = useState("");
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [paused, setPaused] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [starting, setStarting] = useState(false);

  const transcriptRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

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
          if (typeof data.text === "string") setTranscript(data.text);
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
  }, [active]);

  useEffect(() => {
    if (!paused) setDisplayed(transcript);
  }, [transcript, paused]);

  useEffect(() => {
    if (paused) return;
    const element = transcriptRef.current;
    if (element && pinnedRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [displayed, paused]);

  useEffect(() => {
    const element = transcriptRef.current;
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
      toast(
        "Stopping the caption service is available in the desktop app."
      );
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
              disabled={!displayed.trim()}
              onClick={() => {
                if (paused) {
                  setPaused(false);
                  setDisplayed(transcript);
                } else {
                  setPaused(true);
                }
              }}
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
              disabled={!displayed.trim()}
              onClick={() => copyText(displayed)}
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
          ref={transcriptRef}
          onScroll={(event) => {
            const element = event.currentTarget;
            pinnedRef.current =
              element.scrollHeight - element.scrollTop - element.clientHeight <
              BOTTOM_SLACK;
          }}
          class="max-h-[55vh] min-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 leading-relaxed text-gray-900 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-100"
          style={{ fontSize: `${fontSize}px` }}
        >
          {displayed.trim() ? (
            displayed
          ) : (
            <div class="flex h-56 flex-col items-center justify-center gap-2 text-center text-sm text-gray-400 dark:text-gray-500">
              <CaptionsIcon size={22} />
              <span>{emptyMessage}</span>
            </div>
          )}
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
