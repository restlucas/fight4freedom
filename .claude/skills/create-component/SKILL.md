---
name: create-component
description: Scaffold a shared React component with typed props, optional CVA variants and a colocated test, following this project's conventions. Use when the user wants a new custom (non-shadcn) component.
---

# Create a component

For shadcn/ui primitives use the `add-shadcn-component` skill instead. This skill is for
custom components.

## Decide where it lives first

- Generic, used by 2+ pages/features -> `src/components/`
- Belongs to a business domain -> `src/features/<name>/components/`
- Used by a single route only -> colocate next to the route

## Steps

1. Create the file in kebab-case, e.g. `src/components/page-header.tsx`:

   ```tsx
   import { cn } from "@/lib/utils";

   interface PageHeaderProps {
     title: string;
     description?: string;
     className?: string;
   }

   export function PageHeader({ title, description, className }: PageHeaderProps) {
     return (
       <div className={cn("flex flex-col gap-1", className)}>
         <h1 className="text-2xl font-semibold">{title}</h1>
         {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
       </div>
     );
   }
   ```

2. If the component has visual variants, use CVA instead of ternaries:

   ```tsx
   import { cva, type VariantProps } from "class-variance-authority";

   const badgeVariants = cva("inline-flex items-center rounded-md px-2 py-0.5 text-xs", {
     variants: {
       variant: {
         default: "bg-primary text-primary-foreground",
         outline: "border-border border",
       },
     },
     defaultVariants: { variant: "default" },
   });

   interface BadgeProps extends VariantProps<typeof badgeVariants> {
     children: React.ReactNode;
     className?: string;
   }

   export function Badge({ variant, className, children }: BadgeProps) {
     return <span className={cn(badgeVariants({ variant }), className)}>{children}</span>;
   }
   ```

3. Add a colocated test `page-header.test.tsx`:

   ```tsx
   import { render, screen } from "@testing-library/react";
   import { describe, expect, it } from "vitest";
   import { PageHeader } from "./page-header";

   describe("PageHeader", () => {
     it("renders title and description", () => {
       render(<PageHeader title="Settings" description="Manage your account" />);
       expect(screen.getByRole("heading", { name: /settings/i })).toBeInTheDocument();
       expect(screen.getByText(/manage your account/i)).toBeInTheDocument();
     });
   });
   ```

4. Run `pnpm test` and `pnpm type-check`.

## Notes

- Server Component by default; add `"use client"` only for state, effects or event handlers.
- Always accept and merge `className` so callers can adjust layout.
- Named exports, one component per file.
