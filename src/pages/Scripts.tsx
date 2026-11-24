import { useEffect, useRef, useState } from "preact/hooks";
import {
  Check,
  ChevronRight,
  Clock,
  Copy,
  FileText,
  FolderOpen,
  Library,
  Pencil,
  Plus,
  Search,
  Star,
  Trash,
  X,
} from "lucide-preact";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Modal } from "../components/ui/modal";
import { Select } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { toast } from "../components/ui/sonner";
import { copyText } from "../lib/clipboard";
import { cn } from "../lib/utils";
import {
  createId,
  loadScriptLibrary,
  saveScriptLibrary,
  type SavedScript,
  type ScriptCategory,
  type ScriptLibrary,
} from "../lib/scripts";

type Overlay =
  | { mode: "read"; id: string }
  | { mode: "edit"; id?: string }
  | null;

interface ScriptDraft {
  title: string;
  categoryId: string | null;
  english: string;
  lep: string;
}

const ALL_SCRIPTS = "all";
const UNCATEGORIZED = "uncategorized";
const FAVORITES = "favorites";
const RECENT = "recent";

const CATEGORY_DOT_CLASSES = [
  "bg-sky-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-orange-500",
];

function categoryDot(name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return CATEGORY_DOT_CLASSES[hash % CATEGORY_DOT_CLASSES.length];
}

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatUpdated(timestamp: number) {
  const updated = new Date(timestamp);
  const today = new Date();

  if (updated.toDateString() === today.toDateString()) return "Updated today";

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (updated.toDateString() === yesterday.toDateString()) return "Updated yesterday";

  return `Updated ${DATE_FORMATTER.format(updated)}`;
}

function deriveTitle(english: string, lep: string) {
  const source = (english.trim() || lep.trim()).replace(/\s+/g, " ").trim();
  if (!source) return "";
  return source.length > 60 ? `${source.slice(0, 57).trimEnd()}...` : source;
}

export function Scripts() {
  const [library, setLibrary] = useState<ScriptLibrary>(loadScriptLibrary);
  const libraryRef = useRef(library);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [filter, setFilter] = useState<string>(ALL_SCRIPTS);
  const [query, setQuery] = useState("");

  const commit = (next: ScriptLibrary) => {
    libraryRef.current = next;
    setLibrary(next);
    saveScriptLibrary(next);
  };

  const sortedCategories = [...library.categories].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const categoriesById = new Map(
    library.categories.map((category) => [category.id, category])
  );
  const categoryIds = new Set(library.categories.map((category) => category.id));

  const counts = new Map<string, number>();
  let uncategorizedCount = 0;
  let favoritesCount = 0;
  let recentCount = 0;

  for (const script of library.scripts) {
    if (script.categoryId && categoryIds.has(script.categoryId)) {
      counts.set(script.categoryId, (counts.get(script.categoryId) ?? 0) + 1);
    } else {
      uncategorizedCount += 1;
    }
    if (script.favorite) favoritesCount += 1;
    if (script.lastUsedAt) recentCount += 1;
  }

  const needle = query.trim().toLowerCase();
  const visibleScripts = library.scripts
    .filter((script) => {
      const categoryId =
        script.categoryId && categoryIds.has(script.categoryId)
          ? script.categoryId
          : null;
      const isCategoryFilter =
        filter !== ALL_SCRIPTS &&
        filter !== UNCATEGORIZED &&
        filter !== FAVORITES &&
        filter !== RECENT;

      if (filter === UNCATEGORIZED && categoryId !== null) return false;
      if (isCategoryFilter && categoryId !== filter) return false;
      if (filter === FAVORITES && !script.favorite) return false;
      if (filter === RECENT && !script.lastUsedAt) return false;

      if (!needle) return true;

      const categoryName = categoryId
        ? categoriesById.get(categoryId)?.name ?? ""
        : "uncategorized";

      return [script.title, script.english, script.lep, categoryName].some((value) =>
        value.toLowerCase().includes(needle)
      );
    })
    .sort((a, b) => {
      if (filter === RECENT) {
        return (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0);
      }
      return (
        Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) ||
        b.updatedAt - a.updatedAt
      );
    });

  const activeCategory =
    filter !== ALL_SCRIPTS &&
    filter !== UNCATEGORIZED &&
    filter !== FAVORITES &&
    filter !== RECENT
      ? categoriesById.get(filter)
      : undefined;

  const heading =
    filter === ALL_SCRIPTS
      ? "All scripts"
      : filter === UNCATEGORIZED
        ? "Uncategorized"
        : filter === FAVORITES
          ? "Favorites"
          : filter === RECENT
            ? "Recently used"
            : activeCategory?.name ?? "All scripts";

  const emptyTitle =
    library.scripts.length === 0
      ? "No scripts saved yet"
      : filter === FAVORITES
        ? "No favorite scripts yet"
        : filter === RECENT
          ? "No recently used scripts yet"
          : "No scripts match";

  const emptyBody =
    library.scripts.length === 0
      ? "Save your English and LEP scripts so you can pull them up during a call."
      : filter === FAVORITES
        ? "Open a script and tap the star to pin it here."
        : filter === RECENT
          ? "Scripts you open or copy will show up here."
          : "Try a different search or clear the category filter.";

  const addCategory = (name: string): ScriptCategory | null => {
    const trimmed = name.trim();
    if (!trimmed) return null;

    const current = libraryRef.current;
    const existing = current.categories.find(
      (category) => category.name.toLowerCase() === trimmed.toLowerCase()
    );

    if (existing) {
      toast(`"${existing.name}" already exists`);
      return existing;
    }

    const category: ScriptCategory = {
      id: createId(),
      name: trimmed,
      createdAt: Date.now(),
    };

    commit({ ...current, categories: [...current.categories, category] });
    toast("Category added");
    return category;
  };

  const saveScript = (draft: ScriptDraft, id?: string) => {
    const current = libraryRef.current;
    const now = Date.now();

    if (id) {
      if (!current.scripts.some((script) => script.id === id)) return;

      commit({
        ...current,
        scripts: current.scripts.map((script) =>
          script.id === id ? { ...script, ...draft, updatedAt: now } : script
        ),
      });
      toast("Script saved!");
      setOverlay({ mode: "read", id });
      return;
    }

    const created: SavedScript = {
      id: createId(),
      ...draft,
      createdAt: now,
      updatedAt: now,
    };

    commit({ ...current, scripts: [created, ...current.scripts] });
    toast("Script saved!");
    setOverlay({ mode: "read", id: created.id });
  };

  const deleteScript = (id: string) => {
    const current = libraryRef.current;
    commit({
      ...current,
      scripts: current.scripts.filter((script) => script.id !== id),
    });
    toast("Script deleted");
    setOverlay(null);
  };

  const markUsed = (id: string) => {
    const current = libraryRef.current;
    if (!current.scripts.some((script) => script.id === id)) return;

    commit({
      ...current,
      scripts: current.scripts.map((script) =>
        script.id === id ? { ...script, lastUsedAt: Date.now() } : script
      ),
    });
  };

  const toggleFavorite = (id: string) => {
    const current = libraryRef.current;
    const script = current.scripts.find((item) => item.id === id);
    if (!script) return;

    commit({
      ...current,
      scripts: current.scripts.map((item) =>
        item.id === id ? { ...item, favorite: !item.favorite } : item
      ),
    });
  };

  const openScript = (id: string) => {
    markUsed(id);
    setOverlay({ mode: "read", id });
  };

  const deleteCategory = (category: ScriptCategory) => {
    const current = libraryRef.current;
    const affected = current.scripts.filter(
      (script) => script.categoryId === category.id
    ).length;

    commit({
      ...current,
      categories: current.categories.filter((item) => item.id !== category.id),
      scripts: current.scripts.map((script) =>
        script.categoryId === category.id
          ? { ...script, categoryId: null }
          : script
      ),
    });

    if (filter === category.id) setFilter(ALL_SCRIPTS);

    toast(
      affected > 0
        ? `${affected} script${affected === 1 ? "" : "s"} moved to Uncategorized`
        : `Category "${category.name}" deleted`
    );
  };

  const renameCategory = (category: ScriptCategory, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return false;

    const current = libraryRef.current;
    const duplicate = current.categories.find(
      (item) =>
        item.id !== category.id &&
        item.name.toLowerCase() === trimmed.toLowerCase()
    );

    if (duplicate) {
      toast(`"${duplicate.name}" already exists`);
      return false;
    }

    if (trimmed === category.name) return true;

    commit({
      ...current,
      categories: current.categories.map((item) =>
        item.id === category.id ? { ...item, name: trimmed } : item
      ),
    });
    toast("Category renamed");
    return true;
  };

  const readerScript =
    overlay?.mode === "read"
      ? library.scripts.find((script) => script.id === overlay.id)
      : undefined;

  const editorScript =
    overlay?.mode === "edit" && overlay.id
      ? library.scripts.find((script) => script.id === overlay.id)
      : undefined;

  const editorInitialCategoryId =
    filter !== ALL_SCRIPTS &&
    filter !== UNCATEGORIZED &&
    categoriesById.has(filter)
      ? filter
      : null;

  const closeEditor = () => {
    if (editorScript) {
      setOverlay({ mode: "read", id: editorScript.id });
    } else {
      setOverlay(null);
    }
  };

  return (
    <>
      <div class="grid items-start gap-4 md:grid-cols-[190px_minmax(0,1fr)]">
        <CategoryRail
          categories={sortedCategories}
          counts={counts}
          total={library.scripts.length}
          uncategorizedCount={uncategorizedCount}
          favoritesCount={favoritesCount}
          recentCount={recentCount}
          filter={filter}
          onSelect={setFilter}
          onAdd={addCategory}
          onDelete={deleteCategory}
          onRename={renameCategory}
        />

        <LibraryView
          scripts={visibleScripts}
          totalScripts={library.scripts.length}
          query={query}
          heading={heading}
          emptyTitle={emptyTitle}
          emptyBody={emptyBody}
          categoriesById={categoriesById}
          onQuery={setQuery}
          onNew={() => setOverlay({ mode: "edit" })}
          onOpen={openScript}
          onFavorite={toggleFavorite}
          onUse={markUsed}
          onClearFilters={() => {
            setQuery("");
            setFilter(ALL_SCRIPTS);
          }}
        />
      </div>

      {overlay?.mode === "read" && readerScript && (
        <Modal
          labelledBy="script-reader-title"
          onClose={() => setOverlay(null)}
        >
          <ScriptReader
            script={readerScript}
            category={
              readerScript.categoryId
                ? categoriesById.get(readerScript.categoryId)
                : undefined
            }
            onClose={() => setOverlay(null)}
            onEdit={() =>
              setOverlay({ mode: "edit", id: readerScript.id })
            }
            onDelete={() => deleteScript(readerScript.id)}
          />
        </Modal>
      )}

      {overlay?.mode === "edit" && (
        <Modal labelledBy="script-editor-title" onClose={closeEditor}>
          <ScriptEditor
            key={editorScript?.id ?? "new"}
            script={editorScript}
            categories={sortedCategories}
            initialCategoryId={editorInitialCategoryId}
            onClose={closeEditor}
            onSave={(draft) => saveScript(draft, editorScript?.id)}
            onCreateCategory={addCategory}
          />
        </Modal>
      )}
    </>
  );
}

interface CategoryRailProps {
  categories: ScriptCategory[];
  counts: Map<string, number>;
  total: number;
  uncategorizedCount: number;
  favoritesCount: number;
  recentCount: number;
  filter: string;
  onSelect: (filter: string) => void;
  onAdd: (name: string) => ScriptCategory | null;
  onDelete: (category: ScriptCategory) => void;
  onRename: (category: ScriptCategory, name: string) => boolean;
}

function CategoryRail({
  categories,
  counts,
  total,
  uncategorizedCount,
  favoritesCount,
  recentCount,
  filter,
  onSelect,
  onAdd,
  onDelete,
  onRename,
}: CategoryRailProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const renameRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editingId) return;
    const input = renameRowRef.current?.querySelector("input");
    input?.focus();
    input?.select();
  }, [editingId]);

  const closeAdd = () => {
    setIsAdding(false);
    setDraftName("");
  };

  const closeRename = () => {
    setEditingId(null);
    setEditName("");
  };

  const submit = () => {
    if (!draftName.trim()) return;
    const created = onAdd(draftName);
    if (!created) return;
    closeAdd();
  };

  const startRename = (category: ScriptCategory) => {
    setConfirmingDeleteId(null);
    setEditingId(category.id);
    setEditName(category.name);
  };

  const submitRename = (category: ScriptCategory) => {
    if (onRename(category, editName)) closeRename();
  };

  return (
    <Card>
      <CardContent class="p-2">
        <div class="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Categories
        </div>

        <div class="space-y-0.5">
          <FilterRow
            active={filter === ALL_SCRIPTS}
            label="All scripts"
            count={total}
            icon={<Library size={14} class="shrink-0 text-gray-400" />}
            onClick={() => onSelect(ALL_SCRIPTS)}
          />

          <FilterRow
            active={filter === FAVORITES}
            label="Favorites"
            count={favoritesCount}
            icon={<Star size={14} class="shrink-0 text-amber-400" />}
            onClick={() => onSelect(FAVORITES)}
          />

          {recentCount > 0 && (
            <FilterRow
              active={filter === RECENT}
              label="Recently used"
              count={recentCount}
              icon={<Clock size={14} class="shrink-0 text-gray-400" />}
              onClick={() => onSelect(RECENT)}
            />
          )}

          {categories.length > 0 && (
            <div class="my-1 border-t border-gray-200 dark:border-gray-700" />
          )}

          {categories.map((category) => (
            <div key={category.id}>
              {editingId === category.id ? (
                <div ref={renameRowRef} class="flex items-center gap-1 px-1">
                  <Input
                    class="h-7 min-w-0 flex-1 text-xs"
                    aria-label={`Rename "${category.name}"`}
                    maxLength={40}
                    autoFocus
                    value={editName}
                    onInput={(event) => setEditName(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        submitRename(category);
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        closeRename();
                      }
                    }}
                  />
                  <button
                    type="button"
                    title="Save category name"
                    aria-label="Save category name"
                    class="shrink-0 rounded p-1 text-green-600 transition hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-500/10"
                    onClick={() => submitRename(category)}
                  >
                    <Check size={13} />
                  </button>
                  <button
                    type="button"
                    title="Cancel rename"
                    aria-label="Cancel rename"
                    class="shrink-0 rounded p-1 text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700/50"
                    onClick={closeRename}
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : confirmingDeleteId === category.id ? (
                <div class="flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs dark:bg-red-500/10">
                  <span class="min-w-0 flex-1 truncate font-medium text-red-700 dark:text-red-300">
                    Delete "{category.name}"?
                  </span>
                  <button
                    type="button"
                    class="shrink-0 font-semibold text-red-600 hover:underline dark:text-red-400"
                    onClick={() => {
                      onDelete(category);
                      setConfirmingDeleteId(null);
                    }}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    class="shrink-0 text-gray-500 hover:underline dark:text-gray-400"
                    onClick={() => setConfirmingDeleteId(null)}
                  >
                    No
                  </button>
                </div>
              ) : (
                <div class="group flex items-center gap-0.5">
                  <FilterRow
                    class="flex-1"
                    active={filter === category.id}
                    label={category.name}
                    count={counts.get(category.id) ?? 0}
                    dotClass={categoryDot(category.name)}
                    onClick={() => onSelect(category.id)}
                  />
                  <button
                    type="button"
                    title={`Rename "${category.name}"`}
                    aria-label={`Rename "${category.name}"`}
                    class="shrink-0 rounded p-1 text-gray-400 opacity-0 transition hover:bg-gray-100 hover:text-gray-700 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-gray-700/50 dark:hover:text-gray-200"
                    onClick={() => startRename(category)}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    title={`Delete "${category.name}"`}
                    aria-label={`Delete "${category.name}"`}
                    class="shrink-0 rounded p-1 text-gray-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                    onClick={() => {
                      setEditingId(null);
                      setConfirmingDeleteId(category.id);
                    }}
                  >
                    <Trash size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}

          {uncategorizedCount > 0 && (
            <FilterRow
              active={filter === UNCATEGORIZED}
              label="Uncategorized"
              count={uncategorizedCount}
              icon={<FolderOpen size={14} class="shrink-0 text-gray-400" />}
              onClick={() => onSelect(UNCATEGORIZED)}
            />
          )}
        </div>

        <div class="mt-2 border-t border-gray-200 pt-2 dark:border-gray-700">
          {isAdding ? (
            <div class="space-y-1.5 px-1">
              <Input
                class="h-8 text-xs"
                placeholder="Category name"
                aria-label="New category name"
                maxLength={40}
                autoFocus
                value={draftName}
                onInput={(event) => setDraftName(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submit();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeAdd();
                  }
                }}
              />
              <div class="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  class="h-7 flex-1 px-2 text-xs"
                  onClick={submit}
                >
                  Add
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  class="h-7 px-2 text-xs"
                  onClick={closeAdd}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                closeRename();
                setIsAdding(true);
              }}
              class="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-gray-100"
            >
              <Plus size={13} /> New category
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface FilterRowProps {
  active: boolean;
  label: string;
  count: number;
  dotClass?: string;
  icon?: preact.ComponentChildren;
  class?: string;
  onClick: () => void;
}

function FilterRow({
  active,
  label,
  count,
  dotClass,
  icon,
  class: className,
  onClick,
}: FilterRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      class={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        active
          ? "bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
          : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/50",
        className
      )}
    >
      {dotClass ? (
        <span class={cn("h-2 w-2 shrink-0 rounded-full", dotClass)} />
      ) : (
        icon
      )}
      <span class="flex-1 truncate">{label}</span>
      <span
        class={cn(
          "text-xs tabular-nums",
          active
            ? "text-indigo-600 dark:text-indigo-300"
            : "text-gray-400 dark:text-gray-500"
        )}
      >
        {count}
      </span>
    </button>
  );
}

interface LibraryViewProps {
  scripts: SavedScript[];
  totalScripts: number;
  query: string;
  heading: string;
  emptyTitle: string;
  emptyBody: string;
  categoriesById: Map<string, ScriptCategory>;
  onQuery: (value: string) => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  onFavorite: (id: string) => void;
  onUse: (id: string) => void;
  onClearFilters: () => void;
}

function LibraryView({
  scripts,
  totalScripts,
  query,
  heading,
  emptyTitle,
  emptyBody,
  categoriesById,
  onQuery,
  onNew,
  onOpen,
  onFavorite,
  onUse,
  onClearFilters,
}: LibraryViewProps) {
  return (
    <div class="min-w-0 space-y-3">
      <div class="flex gap-2">
        <div class="relative min-w-0 flex-1">
          <Search
            size={16}
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <Input
            class="pl-9"
            placeholder="Search scripts..."
            aria-label="Search scripts"
            value={query}
            onInput={(event) => onQuery(event.currentTarget.value)}
          />
        </div>
        <Button variant="green" class="shrink-0" onClick={onNew}>
          <Plus size={16} class="mr-1.5" /> New Script
        </Button>
      </div>

      <div class="flex items-baseline justify-between gap-2 px-1">
        <div class="min-w-0 truncate text-sm font-semibold">{heading}</div>
        <div class="shrink-0 text-xs text-gray-500 dark:text-gray-400">
          {scripts.length} {scripts.length === 1 ? "script" : "scripts"}
        </div>
      </div>

      {scripts.length === 0 ? (
        <div class="rounded-xl border border-dashed border-gray-300 bg-white/60 px-5 py-10 text-center dark:border-gray-600 dark:bg-gray-800/40">
          <div class="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-400">
            <FileText size={20} />
          </div>
          <div class="text-sm font-semibold">{emptyTitle}</div>
          <p class="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {emptyBody}
          </p>
          <Button
            variant={totalScripts === 0 ? "green" : "secondary"}
            size="sm"
            class="mt-4"
            onClick={totalScripts === 0 ? onNew : onClearFilters}
          >
            {totalScripts === 0 ? (
              <>
                <Plus size={14} class="mr-1.5" /> Create your first script
              </>
            ) : (
              "Clear search and filters"
            )}
          </Button>
        </div>
      ) : (
        <div class="space-y-2">
          {scripts.map((script) => (
            <ScriptRow
              key={script.id}
              script={script}
              category={
                script.categoryId
                  ? categoriesById.get(script.categoryId)
                  : undefined
              }
              onOpen={onOpen}
              onFavorite={onFavorite}
              onUse={onUse}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ScriptRow({
  script,
  category,
  onOpen,
  onFavorite,
  onUse,
}: {
  script: SavedScript;
  category?: ScriptCategory;
  onOpen: (id: string) => void;
  onFavorite: (id: string) => void;
  onUse: (id: string) => void;
}) {
  const preview = (script.english.trim() || script.lep.trim()).replace(/\s+/g, " ");

  return (
    <div
      onClick={() => onOpen(script.id)}
      class="group cursor-pointer rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-500/60"
    >
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <div class="truncate font-semibold">{script.title}</div>
          <div class="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
            <span
              class={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                category ? categoryDot(category.name) : "bg-gray-400"
              )}
            />
            <span class="truncate">{category?.name ?? "Uncategorized"}</span>
            <span class="shrink-0">·</span>
            <span class="shrink-0">{formatUpdated(script.updatedAt)}</span>
          </div>
        </div>

        <div
          class="flex shrink-0 items-center gap-1"
          onClick={(event) => event.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon"
            class={cn(
              "h-7 w-7",
              script.favorite
                ? "text-amber-500"
                : "text-gray-400 hover:text-amber-500"
            )}
            title={
              script.favorite
                ? "Remove from favorites"
                : "Add to favorites"
            }
            aria-label={
              script.favorite
                ? `Remove ${script.title} from favorites`
                : `Add ${script.title} to favorites`
            }
            aria-pressed={Boolean(script.favorite)}
            onClick={() => onFavorite(script.id)}
          >
            <Star size={15} class={script.favorite ? "fill-current" : ""} />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            class="h-7 px-2 text-[11px] font-semibold"
            title="Copy English script"
            aria-label={`Copy English script: ${script.title}`}
            disabled={!script.english.trim()}
            onClick={() => {
              onUse(script.id);
              copyText(script.english);
            }}
          >
            EN
          </Button>
          <Button
            variant="secondary"
            size="sm"
            class="h-7 px-2 text-[11px] font-semibold"
            title="Copy LEP script"
            aria-label={`Copy LEP script: ${script.title}`}
            disabled={!script.lep.trim()}
            onClick={() => {
              onUse(script.id);
              copyText(script.lep);
            }}
          >
            LEP
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 text-gray-400"
            title="Open script"
            aria-label={`Open ${script.title}`}
            onClick={() => onOpen(script.id)}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>

      <p class="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
        {preview || "No text saved yet."}
      </p>
    </div>
  );
}

interface ScriptReaderProps {
  script: SavedScript;
  category?: ScriptCategory;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function copyBothLanguages(script: SavedScript) {
  const parts: string[] = [];
  if (script.english.trim()) {
    parts.push(`English:\n${script.english.trim()}`);
  }
  if (script.lep.trim()) {
    parts.push(`LEP:\n${script.lep.trim()}`);
  }
  copyText(parts.join("\n\n"));
}

function ScriptReader({
  script,
  category,
  onClose,
  onEdit,
  onDelete,
}: ScriptReaderProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div class="flex min-h-0 flex-col">
      <div class="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-300">
              <span
                class={cn(
                  "h-1.5 w-1.5 rounded-full",
                  category ? categoryDot(category.name) : "bg-gray-400"
                )}
              />
              {category?.name ?? "Uncategorized"}
            </span>
            <span>{formatUpdated(script.updatedAt)}</span>
          </div>
          <h2
            id="script-reader-title"
            class="mt-1.5 text-xl font-bold wrap-break-word"
          >
            {script.title}
          </h2>
        </div>

        <div class="flex flex-wrap items-center justify-end gap-2">
          {confirmingDelete ? (
            <>
              <Button variant="destructive" size="sm" onClick={onDelete}>
                Delete permanently
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={!script.english.trim() && !script.lep.trim()}
                onClick={() => copyBothLanguages(script)}
              >
                <Copy size={14} class="mr-1.5" /> Copy both
              </Button>
              <Button variant="secondary" size="sm" onClick={onEdit}>
                <Pencil size={14} class="mr-1.5" /> Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash size={14} class="mr-1.5" /> Delete
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8 text-gray-400"
            aria-label="Close script"
            title="Close"
            onClick={onClose}
          >
            <X size={18} />
          </Button>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-5">
        <div class="grid gap-4 md:grid-cols-2">
          <ScriptPanel label="Client (English)" text={script.english} />
          <ScriptPanel label="LEP (Target Language)" text={script.lep} />
        </div>
      </div>
    </div>
  );
}

function ScriptPanel({ label, text }: { label: string; text: string }) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div class="flex min-w-0 flex-col">
      <div class="mb-1.5 flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-baseline gap-2">
          <Label class="mb-0 truncate">{label}</Label>
          {words > 0 && (
            <span class="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
              {words} {words === 1 ? "word" : "words"}
            </span>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          class="shrink-0"
          disabled={!text.trim()}
          onClick={() => copyText(text)}
        >
          <Copy size={14} class="mr-1.5" /> Copy
        </Button>
      </div>
      <div class="min-h-40 flex-1 whitespace-pre-wrap wrap-break-word rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm leading-relaxed dark:border-gray-700 dark:bg-gray-900/40">
        {text.trim() ? (
          text
        ) : (
          <span class="text-gray-400 dark:text-gray-500">
            Nothing saved for this language yet.
          </span>
        )}
      </div>
    </div>
  );
}

interface ScriptEditorProps {
  script?: SavedScript;
  categories: ScriptCategory[];
  initialCategoryId: string | null;
  onClose: () => void;
  onSave: (draft: ScriptDraft) => void;
  onCreateCategory: (name: string) => ScriptCategory | null;
}

function ScriptEditor({
  script,
  categories,
  initialCategoryId,
  onClose,
  onSave,
  onCreateCategory,
}: ScriptEditorProps) {
  const [title, setTitle] = useState(script?.title ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(() => {
    const initial = script?.categoryId ?? initialCategoryId;
    return initial && categories.some((category) => category.id === initial)
      ? initial
      : null;
  });
  const [english, setEnglish] = useState(script?.english ?? "");
  const [lep, setLep] = useState(script?.lep ?? "");
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const closeCategoryForm = () => {
    setNewCategoryName("");
    setIsAddingCategory(false);
  };

  const addCategory = () => {
    const created = onCreateCategory(newCategoryName);
    if (!created) return;
    setCategoryId(created.id);
    closeCategoryForm();
  };

  const save = () => {
    const finalTitle = title.trim() || deriveTitle(english, lep);
    if (!finalTitle) {
      toast("Add a title or some script text first");
      return;
    }
    onSave({ title: finalTitle, categoryId, english, lep });
  };

  return (
    <div class="flex min-h-0 flex-col">
      <div class="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
        <div>
          <h2 id="script-editor-title" class="text-lg font-bold">
            {script ? "Edit script" : "New script"}
          </h2>
          <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Keep the English and LEP versions of the same script together.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8 text-gray-400"
          aria-label="Close editor"
          title="Close"
          onClick={onClose}
        >
          <X size={18} />
        </Button>
      </div>

      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_210px]">
          <div>
            <Label for="script-title">Script title</Label>
            <Input
              id="script-title"
              placeholder="e.g. New patient intake"
              maxLength={120}
              autoFocus={!script}
              value={title}
              onInput={(event) => setTitle(event.currentTarget.value)}
            />
          </div>

          <div>
            <div class="flex items-center justify-between">
              <Label for="script-category">Category</Label>
              {!isAddingCategory && (
                <button
                  type="button"
                  class="mb-1.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  onClick={() => setIsAddingCategory(true)}
                >
                  <Plus size={12} /> New
                </button>
              )}
            </div>
            <Select
              id="script-category"
              value={categoryId ?? ""}
              onChange={(event) =>
                setCategoryId(event.currentTarget.value || null)
              }
            >
              <option value="">Uncategorized</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {isAddingCategory && (
          <div class="flex gap-2">
            <Input
              class="h-9"
              placeholder="New category name"
              aria-label="New category name"
              maxLength={40}
              autoFocus
              value={newCategoryName}
              onInput={(event) =>
                setNewCategoryName(event.currentTarget.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addCategory();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  closeCategoryForm();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              class="h-9 shrink-0"
              onClick={addCategory}
            >
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              class="h-9 shrink-0"
              onClick={closeCategoryForm}
            >
              Cancel
            </Button>
          </div>
        )}

        <div class="grid gap-4 md:grid-cols-2">
          <div class="flex min-w-0 flex-col">
            <div class="mb-1.5 flex items-center justify-between gap-2">
              <Label for="script-english" class="mb-0">
                Client (English)
              </Label>
              <span class="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
                {english.trim()
                  ? `${english.trim().split(/\s+/).length} words`
                  : ""}
              </span>
            </div>
            <Textarea
              id="script-english"
              class="h-56"
              placeholder="Paste the English script here..."
              value={english}
              onInput={(event) => setEnglish(event.currentTarget.value)}
            />
          </div>

          <div class="flex min-w-0 flex-col">
            <div class="mb-1.5 flex items-center justify-between gap-2">
              <Label for="script-lep" class="mb-0">
                LEP (Target Language)
              </Label>
              <span class="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
                {lep.trim() ? `${lep.trim().split(/\s+/).length} words` : ""}
              </span>
            </div>
            <Textarea
              id="script-lep"
              class="h-56"
              placeholder="Paste the LEP script here..."
              value={lep}
              onInput={(event) => setLep(event.currentTarget.value)}
            />
          </div>
        </div>
      </div>

      <div class="flex shrink-0 gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-700">
        <Button variant="green" class="flex-1" onClick={save}>
          <Check size={16} class="mr-1.5" />
          {script ? "Save Changes" : "Save Script"}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
