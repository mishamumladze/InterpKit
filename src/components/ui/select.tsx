import { cn } from "../../lib/utils";

export interface SelectProps extends preact.JSX.SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ class: className, ...props }: SelectProps) {
  return (
    <select
      class={cn(
        "flex h-10 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
