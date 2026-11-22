import { toast } from "../components/ui/sonner";

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied!");
  } catch {
    toast("Copy failed");
  }
}
