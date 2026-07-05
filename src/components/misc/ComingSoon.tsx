import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";

export function ComingSoon({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Icon className="h-6 w-6" />
        </span>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="max-w-sm text-sm text-muted">{description}</p>
      </CardContent>
    </Card>
  );
}
