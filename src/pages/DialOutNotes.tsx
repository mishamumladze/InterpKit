import { useState } from "preact/hooks";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { toast } from "../components/ui/sonner";

export function DialOutNotes() {
  const [clientName, setClientName] = useState("");
  const [callback, setCallback] = useState("");
  const [lepName, setLepName] = useState("");
  const [lepNumber, setLepNumber] = useState("");
  const [intro, setIntro] = useState("");
  const [voicemail, setVoicemail] = useState("");

  const clearScratchpad = () => {
    setClientName("");
    setCallback("");
    setLepName("");
    setLepNumber("");
    setIntro("");
    setVoicemail("");
    toast("Scratchpad cleared");
  };

  return (
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Input
          class="h-12 rounded-lg bg-transparent px-3.5 dark:bg-transparent dark:placeholder:text-gray-400"
          placeholder="Client Name"
          aria-label="Client Name"
          value={clientName}
          onInput={(event) => setClientName(event.currentTarget.value)}
        />
        <Input
          class="h-12 rounded-lg bg-transparent px-3.5 dark:bg-transparent dark:placeholder:text-gray-400"
          placeholder="Callback #"
          aria-label="Callback number"
          value={callback}
          onInput={(event) => setCallback(event.currentTarget.value)}
        />
        <Input
          class="h-12 rounded-lg bg-transparent px-3.5 dark:bg-transparent dark:placeholder:text-gray-400"
          placeholder="LEP Name"
          aria-label="LEP name"
          value={lepName}
          onInput={(event) => setLepName(event.currentTarget.value)}
        />
        <Input
          class="h-12 rounded-lg bg-transparent px-3.5 dark:bg-transparent dark:placeholder:text-gray-400"
          placeholder="LEP Number"
          aria-label="LEP number"
          value={lepNumber}
          onInput={(event) => setLepNumber(event.currentTarget.value)}
        />
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <Textarea
          class="h-32 rounded-lg bg-transparent px-4 py-3.5 dark:bg-transparent dark:placeholder:text-gray-400"
          placeholder="Intro..."
          aria-label="Caller introduction"
          value={intro}
          onInput={(event) => setIntro(event.currentTarget.value)}
        />
        <Textarea
          class="h-32 rounded-lg bg-transparent px-4 py-3.5 dark:bg-transparent dark:placeholder:text-gray-400"
          placeholder="Voicemail..."
          aria-label="Caller voicemail"
          value={voicemail}
          onInput={(event) => setVoicemail(event.currentTarget.value)}
        />
      </div>

      <div class="flex justify-center pt-0.5">
        <button
          type="button"
          class="text-xs font-medium text-red-600 transition hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          onClick={clearScratchpad}
        >
          [ Clear ]
        </button>
      </div>
    </div>
  );
}
