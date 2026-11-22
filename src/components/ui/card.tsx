import { cn } from "../../lib/utils";

export function Card({ class: className, ...props }: preact.JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      class={cn("rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm", className)}
      {...props}
    />
  );
}

export function CardContent({ class: className, ...props }: preact.JSX.HTMLAttributes<HTMLDivElement>) {
  return <div class={cn("p-6 pt-0", className)} {...props} />;
}