import { createContext, useContext, type RefObject } from "react";

/** Ref updated synchronously on drag start/end — cards read it without prop churn. */
export const KanbanDragActiveRefContext = createContext<RefObject<boolean>>({
  current: false,
});

export function useKanbanDragActiveRef() {
  return useContext(KanbanDragActiveRefContext);
}
