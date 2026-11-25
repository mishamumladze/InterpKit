import "./App.css";
import { useState } from "preact/hooks";
import { Settings as SettingsIcon } from "lucide-preact";
import { Button } from "./components/ui/button";
import { Toaster } from "./components/ui/sonner";
import { ThemeToggle } from "./components/theme-toggle";
import { SettingsModal } from "./components/settings-modal";
import { ShiftTracker } from "./pages/ShiftTracker";
import { Scripts } from "./pages/Scripts";
import { Captions } from "./pages/Captions";
import { DialOutNotes } from "./pages/DialOutNotes";

type Tab = "shift" | "scripts" | "captions" | "notes";

const tabs: { id: Tab; label: string }[] = [
  { id: "shift", label: "Shift Tracker" },
  { id: "scripts", label: "Scripts" },
  { id: "captions", label: "Captions" },
  { id: "notes", label: "Dial-Out Notes" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("shift");
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div class="min-h-screen bg-background text-foreground p-5">
      <header class="mb-6 flex justify-between items-start">
        <div>
          <h1 class="text-2xl font-bold mb-3">InterpKit</h1>
          <nav class="flex gap-2">
            {tabs.map((t) => (
              <Button
                key={t.id}
                variant={tab === t.id ? "default" : "secondary"}
                onClick={() => setTab(t.id)}
                class="rounded-full px-4"
                size="sm"
              >
                {t.label}
              </Button>
            ))}
          </nav>
        </div>

        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            class="rounded-full bg-white dark:bg-gray-800"
            aria-label="Settings"
            title="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon size={18} />
          </Button>
          <ThemeToggle />
        </div>
      </header>

      {/* Pages stay mounted so unsaved input survives tab switches. */}
      <div hidden={tab !== "shift"}><ShiftTracker /></div>
      <div hidden={tab !== "scripts"}><Scripts /></div>
      <div hidden={tab !== "captions"}>
        <Captions />
      </div>
      <div hidden={tab !== "notes"}><DialOutNotes /></div>

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} />
      )}

      <Toaster />
    </div>
  );
}
