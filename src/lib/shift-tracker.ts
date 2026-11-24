export interface ShiftDraft {
  lang: string;
  first: string;
  last: string;
  id: string;
  customer: string;
  message: string;
}

const STORAGE_KEY = "interpkit.shift-tracker.v1";

export const emptyShiftDraft = (): ShiftDraft => ({
  lang: "",
  first: "",
  last: "",
  id: "",
  customer: "",
  message: "",
});

export function loadShiftDraft(): ShiftDraft {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyShiftDraft();

    const parsed = JSON.parse(raw) as Partial<Record<keyof ShiftDraft, unknown>>;
    if (!parsed || typeof parsed !== "object") return emptyShiftDraft();

    const draft = emptyShiftDraft();
    for (const key of Object.keys(draft) as (keyof ShiftDraft)[]) {
      const value = parsed[key];
      if (typeof value === "string") draft[key] = value;
    }
    return draft;
  } catch {
    return emptyShiftDraft();
  }
}

export function saveShiftDraft(draft: ShiftDraft): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage failures (private mode, full quota, etc.).
  }
}
