"use client";

// Multi-select filter built on the shadcn DropdownMenu: a trigger that reads
// "Raridade · 2", and checkbox items inside. Nothing is selected means "no filter"
// rather than "hide everything", which is what an admin expects from a filter.

import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

interface MultiSelectFilterProps<T extends string> {
  /** Shown on the trigger and as the menu heading. */
  label: string;
  options: readonly FilterOption<T>[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
  className?: string;
}

export function MultiSelectFilter<T extends string>({
  label,
  options,
  selected,
  onChange,
  className,
}: MultiSelectFilterProps<T>) {
  const active = selected.length > 0;

  function toggle(value: T) {
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  }

  return (
    // Not modal: a filter must not hide the table it filters. Radix's modal mode
    // marks the rest of the page aria-hidden and locks scrolling, so an admin could
    // neither read the rows nor scroll them while choosing values.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-1.5", active && "border-primary/60", className)}
        >
          {label}
          {active ? (
            <span className="bg-primary/15 text-primary rounded px-1.5 text-xs tabular-nums">
              {selected.length}
            </span>
          ) : null}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            // Keeps the menu open so several values can be picked in one go.
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => toggle(option.value)}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}

        {active ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>
              <Check className="size-3.5 opacity-0" />
              Limpar seleção
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
