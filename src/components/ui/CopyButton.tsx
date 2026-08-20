"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

// navigator.clipboard only exists in a secure context (HTTPS, or localhost
// during dev) — accessing it directly on an insecure origin throws before
// any UI feedback runs, which looks exactly like the button doing nothing.
// document.execCommand('copy') is deprecated but still works everywhere as a
// fallback, via a temporary offscreen textarea.
function copyToClipboard(text: string): boolean {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    return true;
  }
  return fallbackCopy(text);
}

function fallbackCopy(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let succeeded = false;
  try {
    succeeded = document.execCommand("copy");
  } catch {
    succeeded = false;
  }
  document.body.removeChild(textarea);
  return succeeded;
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        if (!copyToClipboard(text)) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-white/[.06] hover:text-foreground"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Tersalin" : "Salin"}
    </button>
  );
}
