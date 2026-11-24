export interface ShiftDraft {
  lang: string;
  first: string;
  last: string;
  id: string;
  customer: string;
  message: string;
}

export const SHIFT_DRAFT_STORAGE_KEY = "interpkit.shift-tracker.v1";

export const emptyShiftDraft = (): ShiftDraft => ({
  lang: "",
  first: "",
  last: "",
  id: "",
  customer: "",
  message: "",
});

export function normalizeShiftDraft(raw: unknown): ShiftDraft {
  if (!raw || typeof raw !== "object") return emptyShiftDraft();

  const parsed = raw as Partial<Record<keyof ShiftDraft, unknown>>;
  const draft = emptyShiftDraft();
  for (const key of Object.keys(draft) as (keyof ShiftDraft)[]) {
    const value = parsed[key];
    if (typeof value === "string") draft[key] = value;
  }
  return draft;
}

export function loadShiftDraft(): ShiftDraft {
  try {
    const raw = localStorage.getItem(SHIFT_DRAFT_STORAGE_KEY);
    if (!raw) return emptyShiftDraft();
    return normalizeShiftDraft(JSON.parse(raw));
  } catch {
    return emptyShiftDraft();
  }
}

export function saveShiftDraft(draft: ShiftDraft): void {
  try {
    localStorage.setItem(SHIFT_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage failures (private mode, full quota, etc.).
  }
}
