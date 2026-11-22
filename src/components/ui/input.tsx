import { cn } from "../../lib/utils";

export interface InputProps extends preact.JSX.InputHTMLAttributes<HTMLInputElement> {}

export function Input({ class: className, ...props }: InputProps) {
  return (
    <input
      class={cn(
        "flex h-10 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-100",
        className
      )}
      {...props}
    />
  );
}