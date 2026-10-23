import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** A freshly created link with a copy button. Links are shown once — the server only keeps a hash. */
export function CopyLinkField({ url, label = "Link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the field is selectable as a fallback.
    }
  };
  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Input readOnly value={url} aria-label={label} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
        <Button type="button" onClick={() => void copy()} className="shrink-0">
          {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Copy it now — for security it won't be shown again.</p>
    </div>
  );
}
