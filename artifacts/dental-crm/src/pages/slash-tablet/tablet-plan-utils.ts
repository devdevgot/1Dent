import { discountedItemPrice } from "@/components/dental-chart/treatment-stage-config";
import type { PlanItem } from "./mock-data";

export function itemDisplayPrice(item: PlanItem): number {
  return discountedItemPrice(item.price, item.discount ?? 0);
}
