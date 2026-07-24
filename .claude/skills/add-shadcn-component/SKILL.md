---
name: add-shadcn-component
description: Add a shadcn/ui component to this project the correct way, including the src/components/ui folder it creates and the cn() helper. Use when the user wants a button, dialog, input, card, or any shadcn primitive.
---

# Add a shadcn/ui component

This project is initialized for shadcn/ui (style `new-york`, base color `neutral`, config in
`components.json`).

## Steps

1. Add the component with the CLI (it writes to `src/components/ui/`):
   ```bash
   pnpm dlx shadcn@latest add <component>
   ```
   Example: `pnpm dlx shadcn@latest add button dialog`.
2. Import it via the alias:
   ```tsx
   import { Button } from "@/components/ui/button";
   ```
3. Compose conditional classes with `cn()` from `@/lib/utils`, never string concatenation.
4. Prefer the lucide-react icon set (already a dependency, configured in `components.json`).

## Notes

- Do not hand-write files into `src/components/ui/`; let the CLI generate them so they stay
  upgradeable.
- If `src/components/` does not exist yet, the CLI creates it on first use. That is expected.
- Keep app-specific components in `src/components/`, outside `ui/`.
