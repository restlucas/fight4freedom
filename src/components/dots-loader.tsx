import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const dotsLoader = cva("flex items-center", {
  variants: {
    size: {
      sm: "gap-1",
      md: "gap-1.5",
      lg: "gap-2",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const dot = cva(
  "animate-dot-jump rounded-full bg-current motion-reduce:animate-none motion-reduce:opacity-100",
  {
    variants: {
      size: {
        sm: "size-1.5",
        md: "size-2.5",
        lg: "size-3.5",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

interface DotsLoaderProps extends VariantProps<typeof dotsLoader> {
  /** Announced to screen readers; also used as the accessible name. */
  label?: string;
  className?: string;
}

/**
 * Three dots that hop one after the other. Inherits the text color of its
 * parent, so callers set the tone with a `text-*` class.
 */
export function DotsLoader({ size, label = "Carregando", className }: DotsLoaderProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(dotsLoader({ size }), className)}
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn(dot({ size }))}
          // A third of the cycle apart, so the hops never overlap.
          style={{ animationDelay: `${index * 0.3}s` }}
        />
      ))}
    </span>
  );
}
