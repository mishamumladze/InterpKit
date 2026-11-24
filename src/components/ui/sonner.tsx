import { useEffect, useState } from "preact/hooks";

let toastListener: ((message: string) => void) | null = null;
const pendingToasts: string[] = [];
let nextToastId = 0;

export function toast(message: string) {
  if (toastListener) {
    toastListener(message);
  } else {
    pendingToasts.push(message);
  }
}

export function Toaster() {
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);

  useEffect(() => {
    const listener = (msg: string) => {
      const id = (nextToastId += 1);
      setToasts((previous) => [...previous, { id, msg }]);
      setTimeout(() => {
        setToasts((previous) => previous.filter((toastItem) => toastItem.id !== id));
      }, 2000);
    };

    toastListener = listener;
    while (pendingToasts.length > 0) {
      listener(pendingToasts.shift() as string);
    }

    return () => {
      toastListener = null;
    };
  }, []);

  return (
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toastItem) => (
        <div
          key={toastItem.id}
          class="pointer-events-auto flex items-center justify-center rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 shadow-lg"
        >
          {toastItem.msg}
        </div>
      ))}
    </div>
  );
}
