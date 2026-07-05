import { AlertTriangle } from "lucide-react";

export function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
