import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      className={cn(
        "block w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
        rest.type === "file" && "file:mr-3 file:border-0 file:text-sm file:font-medium file:text-primary",
        className
      )}
      {...rest}
    />
  )
);
Input.displayName = "Input";