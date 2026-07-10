import { GitBranch, Plus, Trash2, X } from "lucide-react";
import { CHATBOT_FSM_STATES } from "@/lib/chatbot-fsm-states";
import { cn } from "@/lib/utils";
import type { ScriptMindMapNodeData } from "./script-mindmap";

interface MindMapNodePanelProps {
  nodeId: string;
  data: ScriptMindMapNodeData;
  onClose: () => void;
  onUpdate: (id: string, label: string, content: string, fsmState?: string) => void;
  onAddChild: (parentId: string) => void;
  onFork: (siblingId: string) => void;
  onRemove: (id: string) => void;
}

export function MindMapNodePanel({
  nodeId,
  data,
  onClose,
  onUpdate,
  onAddChild,
  onFork,
  onRemove,
}: MindMapNodePanelProps) {
  return (
    <div className="flex flex-col h-full bg-white border-l border-[#e8e3d9] shadow-lg">
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-[#e8e3d9]">
        <p className="text-sm font-semibold text-[#0f172a] truncate">Редактирование узла</p>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[#f1ede4] transition-colors shrink-0"
          aria-label="Закрыть"
        >
          <X className="h-4 w-4 text-[#64748b]" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="text-xs font-medium text-[#64748b] mb-1.5 block">Название</label>
          <input
            className="w-full text-sm font-semibold rounded-lg border border-[#e8e3d9] px-3 py-2 outline-none focus:border-[#1f75fe] text-[#0f172a]"
            value={data.label}
            onChange={(e) => onUpdate(nodeId, e.target.value, data.content, data.fsmState)}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-[#64748b] mb-1.5 block">Инструкция для бота</label>
          <textarea
            className="w-full text-sm text-[#0f172a] rounded-lg border border-[#e8e3d9] px-3 py-2 outline-none focus:border-[#1f75fe] resize-y min-h-[160px] leading-relaxed"
            rows={8}
            value={data.content}
            onChange={(e) => onUpdate(nodeId, data.label, e.target.value, data.fsmState)}
            placeholder="Что делает бот на этом шаге…"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-[#64748b] mb-1.5 block">Этап FSM</label>
          <select
            value={data.fsmState ?? ""}
            onChange={(e) => onUpdate(nodeId, data.label, data.content, e.target.value || undefined)}
            className="w-full text-sm border border-[#e8e3d9] rounded-lg px-3 py-2 bg-white text-[#0f172a]"
          >
            {CHATBOT_FSM_STATES.map((opt) => (
              <option key={opt.value || "none"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-3 border-t border-[#e8e3d9] bg-[#faf8f4]">
        <button
          type="button"
          onClick={() => onAddChild(nodeId)}
          className="flex items-center gap-1 text-xs font-medium text-[#1f75fe] hover:bg-[#1f75fe]/10 px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Шаг
        </button>
        <button
          type="button"
          onClick={() => onFork(nodeId)}
          className="flex items-center gap-1 text-xs font-medium text-violet-600 hover:bg-violet-50 px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <GitBranch className="h-3.5 w-3.5" />
          Ветка
        </button>
        {!data.isRoot && (
          <button
            type="button"
            onClick={() => onRemove(nodeId)}
            className={cn(
              "ml-auto flex items-center gap-1 text-xs font-medium text-red-500",
              "hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors",
            )}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Удалить
          </button>
        )}
      </div>
    </div>
  );
}
