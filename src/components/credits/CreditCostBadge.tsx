import { Coins } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export function CreditCostBadge({ cost }: { cost: number }) {
  return (
    <Badge variant="brand">
      <Coins className="h-3 w-3" />
      {cost} kredit
    </Badge>
  );
}
