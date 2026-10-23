import * as React from "react";
import {
  Toaster as Sonner,
  toast as sonnerToast,
  type ExternalToast,
} from "sonner";
import { useTheme } from "@/hooks/useTheme";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/** Strip app-only flags before passing options to Sonner. */
export type AppToastOptions = ExternalToast & { skipCopyDetails?: boolean };

function pickSonnerOpts(opts?: AppToastOptions): ExternalToast {
  if (!opts) return {};
  const { skipCopyDetails: _s, ...rest } = opts;
  return rest;
}

function buildCopyableText(
  message: Parameters<typeof sonnerToast.success>[0],
  opts?: Pick<AppToastOptions, "description">,
): string | null {
  if (typeof message !== "string") return null;
  const d = opts?.description;
  if (d == null || d === "") return message;
  if (typeof d === "string") {
    const t = d.trim();
    return t ? `${message}\n\n${t}` : message;
  }
  return `${message}\n\n(Additional details are shown in the toast but are not plain text for copying.)`;
}

async function copyToastDetails(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    sonnerToast.success("Copied to clipboard", pickSonnerOpts({ duration: 2200, skipCopyDetails: true }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sonnerToast.error(
      "Could not copy to clipboard",
      pickSonnerOpts({ description: msg, duration: 4500, skipCopyDetails: true }),
    );
  }
}

function withCopyDetails(
  message: Parameters<typeof sonnerToast.success>[0],
  opts?: AppToastOptions,
): ExternalToast | undefined {
  if (opts?.skipCopyDetails) return pickSonnerOpts(opts);
  if (opts?.action) return pickSonnerOpts(opts);
  const text = buildCopyableText(message, opts);
  if (!text) return opts ? pickSonnerOpts(opts) : undefined;
  const clean = pickSonnerOpts(opts);
  return {
    ...clean,
    action: {
      label: "Copy details",
      onClick: () => void copyToastDetails(text),
    },
  };
}

export const toast = Object.assign(
  (message: Parameters<typeof sonnerToast>[0], data?: AppToastOptions) =>
    sonnerToast(message, withCopyDetails(message, data)),
  {
    success: (message: Parameters<typeof sonnerToast.success>[0], data?: AppToastOptions) =>
      sonnerToast.success(message, withCopyDetails(message, data)),
    error: (message: Parameters<typeof sonnerToast.error>[0], data?: AppToastOptions) =>
      sonnerToast.error(message, withCopyDetails(message, data)),
    info: (message: Parameters<typeof sonnerToast.info>[0], data?: AppToastOptions) =>
      sonnerToast.info(message, withCopyDetails(message, data)),
    warning: (message: Parameters<typeof sonnerToast.warning>[0], data?: AppToastOptions) =>
      sonnerToast.warning(message, withCopyDetails(message, data)),
    message: (message: Parameters<typeof sonnerToast.message>[0], data?: AppToastOptions) =>
      sonnerToast.message(message, withCopyDetails(message, data)),
    promise: sonnerToast.promise,
    dismiss: sonnerToast.dismiss,
    loading: (message: Parameters<typeof sonnerToast.loading>[0], data?: AppToastOptions) =>
      sonnerToast.loading(message, pickSonnerOpts({ ...data, skipCopyDetails: true })),
    custom: sonnerToast.custom,
  },
);

const Toaster = ({ ...props }: ToasterProps) => {
  // Sonner needs the resolved theme, not the mode — it has no concept of "system".
  const { resolved } = useTheme();
  return (
    <Sonner
      theme={resolved}
      className="toaster group"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-left",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
