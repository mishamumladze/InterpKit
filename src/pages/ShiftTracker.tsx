import { useEffect, useState } from "preact/hooks";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { copyText } from "../lib/clipboard";
import {
  loadShiftDraft,
  saveShiftDraft,
  type ShiftDraft,
} from "../lib/shift-tracker";

const breakCodes = [
  "RR OUT",
  "RR IN",
  "BRK 1 OUT",
  "BRK 1 IN",
  "BRK 2 OUT",
  "BRK 2 IN",
  "LBRK OUT",
  "LBRK IN",
];

const joinParts = (...parts: string[]) =>
  parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" • ");

const buildPrefix = (lang: string, first: string, last: string, id: string) => {
  const name = [first, last]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  return joinParts(lang, name, id.trim() ? `#${id.trim()}` : "");
};

export function ShiftTracker() {
  const [draft, setDraft] = useState<ShiftDraft>(loadShiftDraft);
  const { lang, first, last, id, customer, message } = draft;

  useEffect(() => {
    saveShiftDraft(draft);
  }, [draft]);

  const update = (field: keyof ShiftDraft, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const prefix = buildPrefix(lang, first, last, id);

  const callFields: [string, string][] = [[customer, " " + message]];

  const copyEntry = (title: string, fields: [string, string][] = []) => {
    const header = joinParts(prefix, `**${title}**`);
    const body = fields
      .filter(([, value]) => value.trim())
      .map(([label, value]) => `${label} **|** ${value.trim()}`);
    copyText([header, ...body].join("\n"));
  };

  return (
    <Card>
      <CardContent class="p-5 space-y-5">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <Label>Language</Label>
            <Input
              value={lang}
              onInput={(e) => update("lang", e.currentTarget.value)}
            />
          </div>
          <div>
            <Label>Name</Label>
            <Input
              value={first}
              onInput={(e) => update("first", e.currentTarget.value)}
            />
          </div>
          <div>
            <Label>Last Name</Label>
            <Input
              value={last}
              onInput={(e) => update("last", e.currentTarget.value)}
            />
          </div>
          <div>
            <Label>ID</Label>
            <Input
              value={id}
              onInput={(e) => update("id", e.currentTarget.value)}
            />
          </div>
        </div>

        <div class="bg-gray-100 dark:bg-gray-900/50 rounded-lg px-3 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 min-h-10 wrap-break-word">
          {prefix || "\u00A0"}
        </div>

        <div class="space-y-2">
          <Button class="w-full" onClick={() => copyEntry("SOS")}>
            Start of Shift
          </Button>
          <Button class="w-full" onClick={() => copyEntry("SOS - MENTORING")}>
            Start Of Shift With Mentoring
          </Button>
          <Button class="w-full" onClick={() => copyEntry("EOS")}>
            End Of Shift
          </Button>
        </div>

        <div class="grid grid-cols-2 gap-2">
          {breakCodes.map((b) => (
            <Button key={b} variant="orange" onClick={() => copyEntry(b)}>
              {b}
            </Button>
          ))}
        </div>

        <div>
          <Label>CALL</Label>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <Label>Customer</Label>
              <Input
                placeholder="e.g., T-Mobile Contact Centers"
                value={customer}
                onInput={(e) => update("customer", e.currentTarget.value)}
              />
            </div>
            <div>
              <Label>Message</Label>
              <Input
                placeholder="e.g., LEP hung up"
                value={message}
                onInput={(e) => update("message", e.currentTarget.value)}
              />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2 mt-2">
            <Button onClick={() => copyEntry("SHORT CALL", callFields)}>
              Short Call
            </Button>
            <Button
              variant="destructive"
              onClick={() => copyEntry("ERROR", callFields)}
            >
              Error
            </Button>
            <Button
              variant="destructive"
              onClick={() => copyEntry("PROBLEMATIC LEP", callFields)}
            >
              Problematic LEP
            </Button>
            <Button
              variant="destructive"
              onClick={() => copyEntry("PROBLEMATIC CLIENT", callFields)}
            >
              Problematic CLIENT
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
