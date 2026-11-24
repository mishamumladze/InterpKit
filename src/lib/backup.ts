import {
  loadScriptLibrary,
  normalizeScriptLibrary,
  SCRIPTS_STORAGE_KEY,
  type ScriptLibrary,
} from "./scripts";
import {
  loadShiftDraft,
  normalizeShiftDraft,
  SHIFT_DRAFT_STORAGE_KEY,
  type ShiftDraft,
} from "./shift-tracker";
import {
  loadShiftSession,
  normalizeShiftSession,
  SHIFT_SESSION_STORAGE_KEY,
  type ShiftSession,
} from "./shift-session";

const THEME_STORAGE_KEY = "interpkit.theme";
const BACKUP_FORMAT = 1 as const;

export interface BackupData {
  scripts: ScriptLibrary;
  shiftDraft: ShiftDraft;
  shiftSession: ShiftSession;
  theme?: "light" | "dark";
}

export interface BackupPayload {
  app: "InterpKit";
  format: typeof BACKUP_FORMAT;
  exportedAt: string;
  data: BackupData;
}

export interface ParsedBackup {
  payload: BackupPayload;
  scriptCount: number;
  categoryCount: number;
  eventCount: number;
}

export function buildBackup(): BackupPayload {
  const theme = localStorage.getItem(THEME_STORAGE_KEY);

  return {
    app: "InterpKit",
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    data: {
      scripts: loadScriptLibrary(),
      shiftDraft: loadShiftDraft(),
      shiftSession: loadShiftSession(),
      ...(theme === "light" || theme === "dark" ? { theme } : {}),
    },
  };
}

export function downloadBackup(): void {
  const payload = buildBackup();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `interpkit-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseBackup(raw: unknown): ParsedBackup | null {
  if (!raw || typeof raw !== "object") return null;

  const candidate = raw as {
    app?: unknown;
    format?: unknown;
    exportedAt?: unknown;
    data?: Partial<BackupData>;
  };

  if (candidate.app !== "InterpKit" || candidate.format !== BACKUP_FORMAT) {
    return null;
  }
  if (!candidate.data || typeof candidate.data !== "object") return null;

  const scripts = normalizeScriptLibrary(candidate.data.scripts);
  if (!scripts) return null;

  const shiftDraft = normalizeShiftDraft(candidate.data.shiftDraft);
  const shiftSession = normalizeShiftSession(candidate.data.shiftSession);
  const theme =
    candidate.data.theme === "light" || candidate.data.theme === "dark"
      ? candidate.data.theme
      : undefined;

  return {
    payload: {
      app: "InterpKit",
      format: BACKUP_FORMAT,
      exportedAt:
        typeof candidate.exportedAt === "string"
          ? candidate.exportedAt
          : new Date().toISOString(),
      data: {
        scripts,
        shiftDraft,
        shiftSession,
        ...(theme ? { theme } : {}),
      },
    },
    scriptCount: scripts.scripts.length,
    categoryCount: scripts.categories.length,
    eventCount: shiftSession.events.length,
  };
}

export function applyBackup(payload: BackupPayload): void {
  localStorage.setItem(
    SCRIPTS_STORAGE_KEY,
    JSON.stringify(payload.data.scripts)
  );
  localStorage.setItem(
    SHIFT_DRAFT_STORAGE_KEY,
    JSON.stringify(payload.data.shiftDraft)
  );
  localStorage.setItem(
    SHIFT_SESSION_STORAGE_KEY,
    JSON.stringify(payload.data.shiftSession)
  );

  if (payload.data.theme) {
    localStorage.setItem(THEME_STORAGE_KEY, payload.data.theme);
  }
}
