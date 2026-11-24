import { useRef, useState } from "preact/hooks";
import { Download, ShieldCheck, Upload, X } from "lucide-preact";
import packageJson from "../../package.json";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import {
  applyBackup,
  downloadBackup,
  parseBackup,
  type ParsedBackup,
} from "../lib/backup";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ParsedBackup | null>(null);
  const [error, setError] = useState("");

  const handleFile = async (file: File | null) => {
    if (!file) return;

    setError("");
    setPending(null);

    try {
      const text = await file.text();
      const parsed = parseBackup(JSON.parse(text));
      if (!parsed) {
        setError("That file is not a valid InterpKit backup.");
        return;
      }
      setPending(parsed);
    } catch {
      setError("Could not read that file. Choose an InterpKit backup JSON file.");
    }
  };

  const restore = () => {
    if (!pending) return;
    applyBackup(pending.payload);
    window.location.reload();
  };

  return (
    <Modal labelledBy="settings-title" onClose={onClose} class="max-w-lg">
      <div class="flex min-h-0 flex-col">
        <div class="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div>
            <h2 id="settings-title" class="text-lg font-bold">
              Settings
            </h2>
            <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Backup, restore, and app information.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8 text-gray-400"
            aria-label="Close settings"
            title="Close"
            onClick={onClose}
          >
            <X size={18} />
          </Button>
        </div>

        <div class="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
          <section class="space-y-2">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Backup & restore
            </h3>
            <p class="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              A backup includes your scripts, categories, Shift Tracker details,
              shift log, and theme. Keep it somewhere safe.
            </p>

            <div class="flex items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-400">
                <Download size={17} />
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium">Export backup</div>
                <div class="text-[11px] text-gray-500 dark:text-gray-400">
                  Download a JSON file with all app data.
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                class="shrink-0"
                onClick={downloadBackup}
              >
                Export
              </Button>
            </div>

            <div class="flex items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-400">
                <Upload size={17} />
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium">Import backup</div>
                <div class="text-[11px] text-gray-500 dark:text-gray-400">
                  Restore data from an InterpKit backup file.
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                class="shrink-0"
                onClick={() => fileRef.current?.click()}
              >
                Choose file
              </Button>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              class="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                event.currentTarget.value = "";
                void handleFile(file);
              }}
            />

            {error && (
              <p class="text-xs font-medium text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            {pending && (
              <div class="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                <div class="text-sm font-medium text-amber-900 dark:text-amber-200">
                  Replace current data?
                </div>
                <p class="text-xs leading-relaxed text-amber-800 dark:text-amber-200/80">
                  This backup contains {pending.scriptCount}{" "}
                  {pending.scriptCount === 1 ? "script" : "scripts"},{" "}
                  {pending.categoryCount}{" "}
                  {pending.categoryCount === 1 ? "category" : "categories"}, and{" "}
                  {pending.eventCount} shift{" "}
                  {pending.eventCount === 1 ? "event" : "events"}. Importing will
                  replace the data on this device.
                </p>
                <div class="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={restore}>
                    Replace data
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPending(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </section>

          <section class="space-y-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              About
            </h3>
            <div class="flex items-center gap-3">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                <ShieldCheck size={17} />
              </div>
              <div>
                <div class="text-sm font-medium">
                  InterpKit v{packageJson.version}
                </div>
                <div class="text-[11px] text-gray-500 dark:text-gray-400">
                  Local-first. Your data never leaves this device.
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </Modal>
  );
}
