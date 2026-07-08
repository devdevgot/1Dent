import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  text = "Нет данных",
  icon,
}: {
  text?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="py-12 text-center text-muted-foreground">
      {icon ?? <Inbox className="w-10 h-10 mx-auto mb-3 text-[#94a3b8]/50" />}
      <p className="text-sm">{text}</p>
    </div>
  );
}
