import { cn } from "../../lib/utils";

export interface LabelProps extends preact.JSX.LabelHTMLAttributes<HTMLLabelElement> {}

export function Label({ class: className, ...props }: LabelProps) {
  return (
    <label
      class={cn(
        "block text-xs font-semibold text-gray-600 dark:text-gray-400 tracking-wide uppercase mb-1.5",
        className
      )}
      {...props}
    />
  );
}
