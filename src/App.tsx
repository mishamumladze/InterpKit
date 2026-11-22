import "./App.css";
import { useState } from "preact/hooks";
import { Button } from "./components/ui/button";
import { Toaster } from "./components/ui/sonner";
import { ThemeToggle } from "./components/theme-toggle";
import { ShiftTracker } from "./pages/ShiftTracker";
import { Scripts } from "./pages/Scripts";
import { DialOutNotes } from "./pages/DialOutNotes";

type Tab = "shift" | "scripts" | "notes";

const tabs: { id: Tab; label: string }[] = [
  { id: "shift", label: "Shift Tracker" },
  { id: "scripts", label: "Scripts" },
  { id: "notes", label: "Dial-Out Notes" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("shift");

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

        <ThemeToggle />
      </header>

      {/* Pages stay mounted so unsaved input survives tab switches. */}
      <div hidden={tab !== "shift"}><ShiftTracker /></div>
      <div hidden={tab !== "scripts"}><Scripts /></div>
      <div hidden={tab !== "notes"}><DialOutNotes /></div>

      <Toaster />
    </div>
  );
}
