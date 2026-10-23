import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  invalid?: boolean;
  /** ids of elements (errors, hints) that describe this field */
  describedBy?: string;
  showCapsLockWarning?: boolean;
  children?: React.ReactNode;
};

/** Password input with a show/hide toggle and an optional Caps Lock warning. */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  invalid,
  describedBy,
  showCapsLockWarning = true,
  children,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [caps, setCaps] = useState(false);
  const capsId = `${id}-caps`;
  const described = [describedBy, caps ? capsId : null].filter(Boolean).join(" ") || undefined;

  const trackCaps = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showCapsLockWarning) setCaps(e.getModifierState("CapsLock"));
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={trackCaps}
          onKeyUp={trackCaps}
          onBlur={() => setCaps(false)}
          aria-invalid={invalid || undefined}
          aria-describedby={described}
          className="h-11 min-h-[44px] pr-11"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      {caps ? (
        <p id={capsId} className="text-xs text-[hsl(var(--warning))]">
          Caps Lock is on.
        </p>
      ) : null}
      {children}
    </div>
  );
}
