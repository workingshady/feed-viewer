import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, X } from "lucide-react";
import { useState, type ReactNode } from "react";

/** Shared pill look for every filter control, so the bar reads as one family. */
export const pillBase =
  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const pillOn = "border-primary/35 bg-primary/10 text-primary-text";
export const pillOff = "border-border bg-card text-muted-foreground hover:border-primary/25 hover:text-foreground";

export type Option = { value: string; label: string; count?: number };

/** Mutually exclusive choices shown inline (purpose, completion). */
export function Segmented({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-9 items-center rounded-full border border-border bg-card p-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
            {o.count != null && <span className={cn("tabular-nums", on ? "opacity-80" : "opacity-60")}>{o.count.toLocaleString()}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Single-choice chips (beds, baths). Clicking the active chip clears it. */
export function ChipChoice({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? "" : o.value)}
            className={cn(pillBase, "h-8 min-w-[2.5rem] justify-center px-2.5", on ? pillOn : pillOff)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Toggle chip with an optional count (features: has video, has floor plan…). */
export function ToggleChip({
  on,
  onToggle,
  children,
  count,
  icon,
}: {
  on: boolean;
  onToggle: () => void;
  children: ReactNode;
  count?: number;
  icon?: ReactNode;
}) {
  return (
    <button type="button" aria-pressed={on} onClick={onToggle} className={cn(pillBase, "h-8", on ? pillOn : pillOff)}>
      {on ? <Check className="h-3.5 w-3.5" aria-hidden /> : icon}
      {children}
      {count != null && <span className="tabular-nums opacity-60">{count.toLocaleString()}</span>}
    </button>
  );
}

/**
 * Searchable single-select with per-option counts. Plain <Select> is unusable once a feed has
 * hundreds of communities or agents; this filters as you type and keeps the busiest first.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  allLabel,
  placeholder,
  icon,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  allLabel: string;
  placeholder: string;
  icon?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const active = value !== "all";
  const current = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={placeholder}
          className={cn(pillBase, "max-w-full justify-between", active ? pillOn : pillOff, className)}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            {icon}
            <span className="truncate">{active ? current?.label ?? value : allLabel}</span>
          </span>
          {active ? (
            <X
              className="h-3.5 w-3.5 shrink-0 opacity-70 hover:opacity-100"
              aria-label={`Clear ${placeholder}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange("all");
              }}
            />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${placeholder.toLowerCase()}…`} />
          <CommandList className="max-h-72">
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={`__all__ ${allLabel}`}
                onSelect={() => {
                  onChange("all");
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-3.5 w-3.5", active && "opacity-0")} aria-hidden />
                {allLabel}
              </CommandItem>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", o.value !== value && "opacity-0")} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.count != null && <span className="ml-2 text-xs tabular-nums text-muted-foreground">{o.count.toLocaleString()}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export type RangePreset = { label: string; min: string; max: string };

/** Min/max inputs behind a pill, with one-tap presets (price bands, size bands). */
export function RangePopover({
  label,
  min,
  max,
  onChange,
  presets,
  format,
  unit,
  icon,
}: {
  label: string;
  min: string;
  max: string;
  onChange: (min: string, max: string) => void;
  presets: RangePreset[];
  format: (n: number) => string;
  unit?: string;
  icon?: ReactNode;
}) {
  const active = !!(min || max);
  const summary = active
    ? min && max
      ? `${format(Number(min))}–${format(Number(max))}`
      : min
        ? `${format(Number(min))}+`
        : `Up to ${format(Number(max))}`
    : label;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn(pillBase, active ? pillOn : pillOff)} aria-label={label}>
          {icon}
          <span className="truncate">{summary}{active && unit ? ` ${unit}` : ""}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align="start">
        <div className="text-xs font-semibold text-foreground">{label}{unit ? ` (${unit})` : ""}</div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            inputMode="numeric"
            placeholder="Min"
            value={min}
            onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""), max)}
            className="h-9 rounded-lg text-sm"
          />
          <Input
            inputMode="numeric"
            placeholder="Max"
            value={max}
            onChange={(e) => onChange(min, e.target.value.replace(/[^\d.]/g, ""))}
            className="h-9 rounded-lg text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => {
            const on = p.min === min && p.max === max;
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(p.min, p.max)}
                className={cn(pillBase, "h-7 px-2.5 text-[11px]", on ? pillOn : pillOff)}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {active && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange("", "")}>
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Titled group inside the "More filters" panel. */
export function FilterSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-3">
      <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}
