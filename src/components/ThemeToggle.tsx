import { Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/hooks/useTheme";
import { isThemeMode, type ThemeMode } from "@/lib/theme";

const MODE_LABEL: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

/**
 * Theme switcher for the app header.
 *
 * A radio group, not three buttons or a cycling toggle: the modes are mutually
 * exclusive and Radix gives correct `aria-checked` semantics for free.
 *
 * The trigger icon reflects the *resolved* theme (what you're looking at) while
 * the checked item reflects the *mode* (what you chose) — those differ under
 * System, which is exactly when the distinction matters.
 *
 * `className` comes from the caller so the header can pass its own chip recipe
 * (including the transparent-over-hero variant) rather than this component
 * duplicating that styling.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { mode, resolved, setMode } = useTheme();

  const TriggerIcon = mode === "system" ? Monitor : resolved === "dark" ? Moon : Sun;
  const label = mode === "system" ? `System (${resolved})` : MODE_LABEL[mode];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={className} aria-label={`Theme: ${label}`} title={`Theme: ${label}`}>
          <TriggerIcon className="w-3.5 h-3.5 shrink-0" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(next) => {
            // Radix hands back a plain string; validate before trusting it.
            if (isThemeMode(next)) setMode(next);
          }}
        >
          <DropdownMenuRadioItem value="light">
            <Sun className="w-4 h-4 mr-2" aria-hidden />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="w-4 h-4 mr-2" aria-hidden />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor className="w-4 h-4 mr-2" aria-hidden />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
