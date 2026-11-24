import { useEffect, useRef, useState } from "preact/hooks";
import { Clock, Copy, Timer, Trash } from "lucide-preact";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "../components/ui/sonner";
import { copyText } from "../lib/clipboard";
import {
  loadShiftDraft,
  saveShiftDraft,
  type ShiftDraft,
} from "../lib/shift-tracker";
import {
  breakLabel,
  breakMinutes,
  createShiftEvent,
  emptyShiftSession,
  loadShiftSession,
  saveShiftSession,
  type ShiftEvent,
  type ShiftEventKind,
  type ShiftSession,
} from "../lib/shift-session";
import { cn } from "../lib/utils";

const breakCodes = [
  "RR OUT",
  "RR IN",
  "BRK 1 OUT",
  "BRK 1 IN",
  "BRK 2 OUT",
  "BRK 2 IN",
  "LBRK OUT",
  "LBRK IN",
];

const EVENT_DOT_CLASSES: Record<ShiftEventKind, string> = {
  "shift-start": "bg-emerald-500",
  "shift-end": "bg-gray-400",
  "break-start": "bg-amber-500",
  "break-end": "bg-amber-300",
  call: "bg-indigo-500",
};

const joinParts = (...parts: string[]) =>
  parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" • ");

const buildPrefix = (lang: string, first: string, last: string, id: string) => {
  const name = [first, last]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  return joinParts(lang, name, id.trim() ? `#${id.trim()}` : "");
};

const formatDuration = (milliseconds: number) => {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
};

const formatRemaining = (milliseconds: number) => {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const formatTime = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));

const formatLogDate = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));

export function ShiftTracker() {
  const [draft, setDraft] = useState<ShiftDraft>(loadShiftDraft);
  const [session, setSession] = useState<ShiftSession>(loadShiftSession);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const { lang, first, last, id, customer, message } = draft;

  useEffect(() => {
    saveShiftDraft(draft);
  }, [draft]);

  useEffect(() => {
    saveShiftSession(session);
  }, [session]);

  const update = (field: keyof ShiftDraft, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const prefix = buildPrefix(lang, first, last, id);
  const callFields: [string, string][] = [[customer, " " + message]];

  const startShift = (label: string) => {
    setSession((current) => {
      const event = createShiftEvent("shift-start", label);

      if (current.startedAt && !current.endedAt) {
        return { ...current, events: [...current.events, event] };
      }

      return {
        ...current,
        startedAt: event.at,
        endedAt: null,
        context: prefix,
        activeBreak: null,
        events: [...current.events, event],
      };
    });
  };

  const endShift = (label: string) => {
    setSession((current) => {
      const event = createShiftEvent("shift-end", label);
      return {
        ...current,
        startedAt: current.startedAt ?? event.at,
        endedAt: event.at,
        activeBreak: null,
        events: [...current.events, event],
      };
    });
  };

  const startBreak = (code: string) => {
    setSession((current) => {
      const event = createShiftEvent("break-start", code);
      const durationMs = breakMinutes(code) * 60_000;

      return {
        ...current,
        activeBreak: {
          label: breakLabel(code),
          startedAt: event.at,
          endsAt: event.at + durationMs,
          durationMs,
        },
        events: [...current.events, event],
      };
    });
  };

  const endBreak = (code: string) => {
    setSession((current) => ({
      ...current,
      activeBreak: null,
      events: [...current.events, createShiftEvent("break-end", code)],
    }));
  };

  const logCall = (label: string, detail: string) => {
    setSession((current) => ({
      ...current,
      events: [...current.events, createShiftEvent("call", label, detail)],
    }));
  };

  const copyEntry = (title: string, fields: [string, string][] = []) => {
    const header = joinParts(prefix, `**${title}**`);
    const body = fields
      .filter(([, value]) => value.trim())
      .map(([label, value]) => `${label} **|** ${value.trim()}`);
    copyText([header, ...body].join("\n"));

    const detail = fields
      .map(([label, value]) =>
        [label.trim(), value.trim()].filter(Boolean).join(" · ")
      )
      .filter(Boolean)
      .join(" · ");

    if (title === "SOS" || title === "SOS - MENTORING") {
      startShift(title);
    } else if (title === "EOS") {
      endShift(title);
    } else if (title.endsWith(" OUT")) {
      startBreak(title);
    } else if (title.endsWith(" IN")) {
      endBreak(title);
    } else {
      logCall(title, detail);
    }
  };

  const copyLog = () => {
    const firstTimestamp = session.startedAt ?? session.events[0]?.at;
    const lines = [
      firstTimestamp
        ? `InterpKit shift log · ${formatLogDate(firstTimestamp)}`
        : "InterpKit shift log",
    ];

    const context = session.context || prefix;
    if (context) lines.push(context);
    lines.push("");

    for (const event of session.events) {
      lines.push(
        `${formatTime(event.at)}  ${event.label}${
          event.detail ? ` — ${event.detail}` : ""
        }`
      );
    }

    copyText(lines.join("\n").trim());
  };

  const clearSession = () => {
    setSession(emptyShiftSession());
    setConfirmingClear(false);
    toast("Shift log cleared");
  };

  return (
    <div class="space-y-4">
      <Card>
        <CardContent class="space-y-5 p-5">
          <ShiftStatus session={session} />

          <div class="grid grid-cols-2 gap-3">
            <div>
              <Label>Language</Label>
              <Input
                value={lang}
                onInput={(e) => update("lang", e.currentTarget.value)}
              />
            </div>
            <div>
              <Label>Name</Label>
              <Input
                value={first}
                onInput={(e) => update("first", e.currentTarget.value)}
              />
            </div>
            <div>
              <Label>Last Name</Label>
              <Input
                value={last}
                onInput={(e) => update("last", e.currentTarget.value)}
              />
            </div>
            <div>
              <Label>ID</Label>
              <Input
                value={id}
                onInput={(e) => update("id", e.currentTarget.value)}
              />
            </div>
          </div>

          <div class="min-h-10 wrap-break-word rounded-lg border border-gray-200 bg-gray-100 px-3 py-2.5 text-sm font-medium dark:border-gray-700 dark:bg-gray-900/50">
            {prefix || "\u00A0"}
          </div>

          <div class="space-y-2">
            <Button class="w-full" onClick={() => copyEntry("SOS")}>
              Start of Shift
            </Button>
            <Button class="w-full" onClick={() => copyEntry("SOS - MENTORING")}>
              Start Of Shift With Mentoring
            </Button>
            <Button class="w-full" onClick={() => copyEntry("EOS")}>
              End Of Shift
            </Button>
          </div>

          <div class="grid grid-cols-2 gap-2">
            {breakCodes.map((code) => (
              <Button
                key={code}
                variant="orange"
                onClick={() => copyEntry(code)}
              >
                {code}
              </Button>
            ))}
          </div>

          <div>
            <Label>CALL</Label>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <Label>Customer</Label>
                <Input
                  placeholder="e.g., T-Mobile Contact Centers"
                  value={customer}
                  onInput={(e) => update("customer", e.currentTarget.value)}
                />
              </div>
              <div>
                <Label>Message</Label>
                <Input
                  placeholder="e.g., LEP hung up"
                  value={message}
                  onInput={(e) => update("message", e.currentTarget.value)}
                />
              </div>
            </div>
            <div class="mt-2 grid grid-cols-2 gap-2">
              <Button onClick={() => copyEntry("SHORT CALL", callFields)}>
                Short Call
              </Button>
              <Button
                variant="destructive"
                onClick={() => copyEntry("ERROR", callFields)}
              >
                Error
              </Button>
              <Button
                variant="destructive"
                onClick={() => copyEntry("PROBLEMATIC LEP", callFields)}
              >
                Problematic LEP
              </Button>
              <Button
                variant="destructive"
                onClick={() => copyEntry("PROBLEMATIC CLIENT", callFields)}
              >
                Problematic CLIENT
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="space-y-3 p-5">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 class="text-sm font-semibold">Shift log</h2>
              <p class="text-[11px] text-gray-500 dark:text-gray-400">
                {session.events.length > 0
                  ? `${session.events.length} ${
                      session.events.length === 1 ? "event" : "events"
                    } recorded`
                  : "Events appear here when you copy shift codes."}
              </p>
            </div>

            <div class="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={session.events.length === 0}
                onClick={copyLog}
              >
                <Copy size={14} class="mr-1.5" /> Copy log
              </Button>

              {confirmingClear ? (
                <>
                  <Button variant="destructive" size="sm" onClick={clearSession}>
                    Clear log
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmingClear(false)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  class="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                  title="Clear the shift timer and log"
                  onClick={() => setConfirmingClear(true)}
                >
                  <Trash size={14} class="mr-1.5" /> Clear
                </Button>
              )}
            </div>
          </div>

          {session.events.length > 0 ? (
            <ol class="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {session.events.map((event) => (
                <ShiftLogRow key={event.id} event={event} />
              ))}
            </ol>
          ) : (
            <p class="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-500 dark:border-gray-600 dark:text-gray-400">
              Start a shift or copy a break code to begin the log.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ShiftStatus({ session }: { session: ShiftSession }) {
  const [now, setNow] = useState(() => Date.now());
  const breakNoticeRef = useRef<{
    startedAt: number;
    warned: boolean;
    ended: boolean;
  } | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!session.activeBreak) {
      breakNoticeRef.current = null;
      return;
    }

    const activeBreak = session.activeBreak;
    if (
      !breakNoticeRef.current ||
      breakNoticeRef.current.startedAt !== activeBreak.startedAt
    ) {
      breakNoticeRef.current = {
        startedAt: activeBreak.startedAt,
        warned: false,
        ended: false,
      };
    }

    const state = breakNoticeRef.current;
    const remaining = activeBreak.endsAt - now;

    if (!state.warned && remaining <= 120_000) {
      state.warned = true;
      if (remaining > 0) toast("2 minutes left on your break");
    }

    if (!state.ended && remaining <= 0) {
      state.ended = true;
      toast("Break time is up");
    }
  }, [now, session.activeBreak]);

  const isOnShift = Boolean(session.startedAt) && !session.endedAt;
  const shiftElapsed = session.startedAt
    ? (session.endedAt ?? now) - session.startedAt
    : 0;

  const activeBreak = session.activeBreak;
  const breakRemaining = activeBreak ? activeBreak.endsAt - now : 0;
  const breakProgress = activeBreak
    ? Math.min(
        1,
        Math.max(
          0,
          (now - activeBreak.startedAt) / activeBreak.durationMs
        )
      )
    : 0;
  const breakState = !activeBreak
    ? "idle"
    : breakRemaining <= 0
      ? "overdue"
      : breakRemaining <= 120_000
        ? "soon"
        : "active";

  return (
    <div class="grid gap-3 sm:grid-cols-2">
      <div
        class={cn(
          "rounded-lg border px-3.5 py-3",
          isOnShift
            ? "border-indigo-200 bg-indigo-50/60 dark:border-indigo-500/30 dark:bg-indigo-500/10"
            : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40"
        )}
      >
        <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          <Clock size={13} /> Shift
          {isOnShift && (
            <span class="ml-auto inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Active
            </span>
          )}
          {session.endedAt && <span class="ml-auto text-gray-400">Ended</span>}
        </div>
        <div class="mt-1 text-2xl font-bold tabular-nums">
          {formatDuration(shiftElapsed)}
        </div>
        <div class="text-[11px] text-gray-500 dark:text-gray-400">
          {session.startedAt
            ? session.endedAt
              ? "Total shift time"
              : "Shift in progress"
            : "Copy Start of Shift to begin"}
        </div>
      </div>

      <div
        class={cn(
          "rounded-lg border px-3.5 py-3",
          breakState === "overdue"
            ? "border-red-200 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10"
            : breakState === "soon"
              ? "border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10"
              : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40"
        )}
      >
        <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          <Timer size={13} />
          {activeBreak ? `${activeBreak.label} break` : "Break timer"}
        </div>
        <div
          class={cn(
            "mt-1 text-2xl font-bold tabular-nums",
            breakState === "overdue"
              ? "text-red-600 dark:text-red-400"
              : breakState === "soon"
                ? "text-amber-600 dark:text-amber-400"
                : ""
          )}
        >
          {activeBreak
            ? breakRemaining > 0
              ? formatRemaining(breakRemaining)
              : "Over"
            : "--:--"}
        </div>

        {activeBreak ? (
          <>
            <div class="mt-1 h-1.5 rounded-full bg-black/5 dark:bg-white/10">
              <div
                class={cn(
                  "h-full rounded-full transition-all",
                  breakState === "overdue"
                    ? "bg-red-500"
                    : breakState === "soon"
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                )}
                style={{ width: `${Math.round(breakProgress * 100)}%` }}
              />
            </div>
            <div class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              {breakRemaining > 0
                ? `${Math.round(activeBreak.durationMs / 60_000)} min break`
                : `Over by ${formatRemaining(Math.abs(breakRemaining))}`}
            </div>
          </>
        ) : (
          <div class="text-[11px] text-gray-500 dark:text-gray-400">
            Copy a break OUT code to start
          </div>
        )}
      </div>
    </div>
  );
}

function ShiftLogRow({ event }: { event: ShiftEvent }) {
  return (
    <li class="flex items-start gap-3">
      <span class="w-12 shrink-0 pt-0.5 text-[11px] tabular-nums text-gray-400 dark:text-gray-500">
        {formatTime(event.at)}
      </span>
      <span
        class={cn(
          "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
          EVENT_DOT_CLASSES[event.kind]
        )}
      />
      <span class="min-w-0 flex-1 text-sm">
        <span class="font-medium">{event.label}</span>
        {event.detail && (
          <span class="text-gray-500 dark:text-gray-400"> — {event.detail}</span>
        )}
      </span>
    </li>
  );
}
