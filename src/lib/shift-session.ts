export type ShiftEventKind =
  | "shift-start"
  | "shift-end"
  | "break-start"
  | "break-end"
  | "call";

export interface ShiftEvent {
  id: string;
  kind: ShiftEventKind;
  label: string;
  at: number;
  detail?: string;
}

export interface ActiveBreak {
  label: string;
  startedAt: number;
  endsAt: number;
  durationMs: number;
}

export interface ShiftSession {
  startedAt: number | null;
  endedAt: number | null;
  context: string;
  events: ShiftEvent[];
  activeBreak: ActiveBreak | null;
}

export const SHIFT_SESSION_STORAGE_KEY = "interpkit.shift-session.v1";

const BREAK_MINUTES: Record<string, number> = {
  RR: 15,
  "BRK 1": 15,
  "BRK 2": 15,
  LBRK: 30,
};

export const emptyShiftSession = (): ShiftSession => ({
  startedAt: null,
  endedAt: null,
  context: "",
  events: [],
  activeBreak: null,
});

export function breakLabel(code: string): string {
  return code.replace(/\s+(OUT|IN)$/i, "").trim();
}

export function breakMinutes(code: string): number {
  return BREAK_MINUTES[breakLabel(code)] ?? 15;
}

const createEventId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

export function createShiftEvent(
  kind: ShiftEventKind,
  label: string,
  detail?: string,
  at = Date.now()
): ShiftEvent {
  return {
    id: createEventId(),
    kind,
    label,
    at,
    ...(detail ? { detail } : {}),
  };
}

const EVENT_KINDS: ShiftEventKind[] = [
  "shift-start",
  "shift-end",
  "break-start",
  "break-end",
  "call",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asTimestamp = (value: unknown, fallback: number | null): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function normalizeShiftSession(raw: unknown): ShiftSession {
  if (!isRecord(raw)) return emptyShiftSession();

  const startedAt = asTimestamp(raw.startedAt, null);
  const endedAt = asTimestamp(raw.endedAt, null);
  const context = typeof raw.context === "string" ? raw.context : "";
  const events: ShiftEvent[] = [];

  if (Array.isArray(raw.events)) {
    for (const entry of raw.events) {
      if (!isRecord(entry)) continue;

      const kind = EVENT_KINDS.includes(entry.kind as ShiftEventKind)
        ? (entry.kind as ShiftEventKind)
        : "call";
      const label = typeof entry.label === "string" ? entry.label : "";
      const at = asTimestamp(entry.at, null);
      if (!label || at === null) continue;

      const detail =
        typeof entry.detail === "string" && entry.detail
          ? entry.detail
          : undefined;

      events.push({
        id: typeof entry.id === "string" ? entry.id : createEventId(),
        kind,
        label,
        at,
        ...(detail ? { detail } : {}),
      });
    }
  }

  events.sort((a, b) => a.at - b.at);

  let activeBreak: ActiveBreak | null = null;
  if (isRecord(raw.activeBreak)) {
    const label =
      typeof raw.activeBreak.label === "string" ? raw.activeBreak.label : "";
    const started = asTimestamp(raw.activeBreak.startedAt, null);
    const ends = asTimestamp(raw.activeBreak.endsAt, null);
    const duration = asTimestamp(raw.activeBreak.durationMs, null);

    if (
      label &&
      started !== null &&
      ends !== null &&
      duration !== null &&
      duration > 0
    ) {
      activeBreak = {
        label,
        startedAt: started,
        endsAt: ends,
        durationMs: duration,
      };
    }
  }

  return { startedAt, endedAt, context, events, activeBreak };
}

export function loadShiftSession(): ShiftSession {
  try {
    const raw = localStorage.getItem(SHIFT_SESSION_STORAGE_KEY);
    if (!raw) return emptyShiftSession();
    return normalizeShiftSession(JSON.parse(raw));
  } catch {
    return emptyShiftSession();
  }
}

export function saveShiftSession(session: ShiftSession): void {
  try {
    localStorage.setItem(SHIFT_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage failures (private mode, full quota, etc.).
  }
}
