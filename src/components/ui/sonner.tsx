import { useState, useEffect } from "preact/hooks";

let toastListener: (msg: string) => void;

export function toast(message: string) {
  if (toastListener) toastListener(message);
}

export function Toaster() {
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);

  useEffect(() => {
    toastListener = (msg: string) => {
      const id = Date.now();
      setToasts((prev) => [...prev, { id, msg }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 2000);
    };
    return () => {
      toastListener = null as any;
    };
  }, []);

  return (
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          class="pointer-events-auto flex items-center justify-center rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 shadow-lg"
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}