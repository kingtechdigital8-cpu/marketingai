"use client";

import { useState, type ReactNode } from "react";
import { Sparkles, ChevronDown, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

interface ToolLayoutProps {
  formTitle: string;
  formIcon: LucideIcon;
  form: ReactNode;
  resultTitle: string;
  resultIcon?: LucideIcon;
  resultActions?: ReactNode;
  result: ReactNode;
  /** Stacks the form (collapsible) above the result, full width, instead of the default side-by-side layout. */
  stacked?: boolean;
}

export function ToolLayout({
  formTitle,
  formIcon: FormIcon,
  form,
  resultTitle,
  resultIcon: ResultIcon = Sparkles,
  resultActions,
  result,
  stacked = false,
}: ToolLayoutProps) {
  const [formOpen, setFormOpen] = useState(true);

  if (stacked) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <button
              type="button"
              onClick={() => setFormOpen((v) => !v)}
              aria-expanded={formOpen}
              className="flex w-full items-center justify-between gap-4 text-left"
            >
              <CardTitle className="flex items-center gap-2">
                <FormIcon className="h-4 w-4 text-brand" />
                {formTitle}
              </CardTitle>
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 text-muted transition-transform duration-200", formOpen && "rotate-180")}
              />
            </button>
          </CardHeader>
          {/* CSS-only grid-rows collapse (0fr/1fr), not framer-motion's
              animate={{height:"auto"}} — that combination (AnimatePresence +
              a height:"auto" tween) was found to freeze any looping
              motion-component animation nested inside it (e.g. the Auto Clip
              style preview's text/zoom animations), for reasons that didn't
              trace to a simple re-render cause. This CSS approach doesn't
              fight with any child's own animation system and keeps the form
              permanently mounted (required for the grid-rows trick to have
              something to collapse against), so child state survives
              collapse/expand too. */}
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-300 ease-in-out",
              formOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            )}
          >
            <div className="overflow-hidden">
              <CardContent>{form}</CardContent>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ResultIcon className="h-4 w-4 text-brand" />
              {resultTitle}
            </CardTitle>
            {resultActions}
          </CardHeader>
          <CardContent>{result}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FormIcon className="h-4 w-4 text-brand" />
            {formTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>{form}</CardContent>
      </Card>

      <Card className="lg:sticky lg:top-20 lg:col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ResultIcon className="h-4 w-4 text-brand" />
            {resultTitle}
          </CardTitle>
          {resultActions}
        </CardHeader>
        <CardContent>{result}</CardContent>
      </Card>
    </div>
  );
}
