import { type ReactNode } from "react";
import { Sparkles, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

interface ToolLayoutProps {
  formTitle: string;
  formIcon: LucideIcon;
  form: ReactNode;
  resultTitle: string;
  resultIcon?: LucideIcon;
  resultActions?: ReactNode;
  result: ReactNode;
}

export function ToolLayout({
  formTitle,
  formIcon: FormIcon,
  form,
  resultTitle,
  resultIcon: ResultIcon = Sparkles,
  resultActions,
  result,
}: ToolLayoutProps) {
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
