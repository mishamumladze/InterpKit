export interface ScriptCategory {
  id: string;
  name: string;
  createdAt: number;
}

export interface SavedScript {
  id: string;
  title: string;
  categoryId: string | null;
  english: string;
  lep: string;
  favorite?: boolean;
  lastUsedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ScriptLibrary {
  version: 2;
  categories: ScriptCategory[];
  scripts: SavedScript[];
}

export const SCRIPTS_STORAGE_KEY = "interpkit.scripts.v2";
const LEGACY_ENGLISH_KEY = "interpkit.script.english";
const LEGACY_LEP_KEY = "interpkit.script.lep";

export function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const emptyLibrary = (): ScriptLibrary => ({
  version: 2,
  categories: [],
  scripts: [],
});

const asString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const asTimestamp = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asOptionalTimestamp = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Tolerates partially corrupt storage instead of throwing the whole library away.
 */
function normalizeLibrary(raw: unknown): ScriptLibrary | null {
  if (!raw || typeof raw !== "object") return null;

  const candidate = raw as { categories?: unknown; scripts?: unknown };
  if (!Array.isArray(candidate.categories) || !Array.isArray(candidate.scripts)) {
    return null;
  }

  const categories: ScriptCategory[] = [];
  const categoryIds = new Set<string>();

  for (const entry of candidate.categories) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const id = asString(item.id) || createId();
    const name = asString(item.name).trim();
    if (!name || categoryIds.has(id)) continue;

    categoryIds.add(id);
    categories.push({
      id,
      name,
      createdAt: asTimestamp(item.createdAt, Date.now()),
    });
  }

  const scripts: SavedScript[] = [];
  const scriptIds = new Set<string>();

  for (const entry of candidate.scripts) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const id = asString(item.id) || createId();
    if (scriptIds.has(id)) continue;

    scriptIds.add(id);
    const categoryId = asString(item.categoryId);
    const createdAt = asTimestamp(item.createdAt, Date.now());
    const lastUsedAt = asOptionalTimestamp(item.lastUsedAt);

    scripts.push({
      id,
      title: asString(item.title).trim() || "Untitled script",
      categoryId: categoryId && categoryIds.has(categoryId) ? categoryId : null,
      english: asString(item.english),
      lep: asString(item.lep),
      favorite: item.favorite === true,
      ...(lastUsedAt !== null ? { lastUsedAt } : {}),
      createdAt,
      updatedAt: asTimestamp(item.updatedAt, createdAt),
    });
  }

  return { version: 2, categories, scripts };
}

export function normalizeScriptLibrary(raw: unknown): ScriptLibrary | null {
  return normalizeLibrary(raw);
}

export function saveScriptLibrary(library: ScriptLibrary): void {
  try {
    localStorage.setItem(SCRIPTS_STORAGE_KEY, JSON.stringify(library));
  } catch {
    // Ignore storage failures (private mode, full quota, etc.).
  }
}

/**
 * Loads the script library, migrating the old single English/LEP pair
 * (stored under `interpkit.script.*`) into the new library on first run.
 */
export function loadScriptLibrary(): ScriptLibrary {
  try {
    const stored = localStorage.getItem(SCRIPTS_STORAGE_KEY);
    if (stored) {
      const normalized = normalizeLibrary(JSON.parse(stored));
      if (normalized) return normalized;
    }
  } catch {
    // Corrupt JSON falls through to the legacy migration below.
  }

  const english = localStorage.getItem(LEGACY_ENGLISH_KEY) ?? "";
  const lep = localStorage.getItem(LEGACY_LEP_KEY) ?? "";
  if (!english.trim() && !lep.trim()) return emptyLibrary();

  const now = Date.now();
  const category: ScriptCategory = {
    id: createId(),
    name: "General",
    createdAt: now,
  };
  const migrated: ScriptLibrary = {
    version: 2,
    categories: [category],
    scripts: [
      {
        id: createId(),
        title: "Saved Script",
        categoryId: category.id,
        english,
        lep,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };

  saveScriptLibrary(migrated);
  localStorage.removeItem(LEGACY_ENGLISH_KEY);
  localStorage.removeItem(LEGACY_LEP_KEY);
  return migrated;
}
