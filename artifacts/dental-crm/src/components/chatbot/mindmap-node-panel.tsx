import {
  GitBranch,
  Layers,
  MessageSquareText,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { CHATBOT_FSM_STATES } from "@/lib/chatbot-fsm-states";
import { cn } from "@/lib/utils";
import { getFsmTone } from "./mindmap-theme";
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
  const tone = getFsmTone(data.fsmState);
  const fsmLabel = data.fsmState
    ? CHATBOT_FSM_STATES.find((s) => s.value === data.fsmState)?.label ?? data.fsmState
    : null;

  return (
    <div className="flex flex-col h-full bg-white">
      <div
        className="shrink-0 px-4 py-4 border-b border-[#e8e3d9]"
        style={{ background: `linear-gradient(135deg, ${tone.accentSoft} 0%, #ffffff 70%)` }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-white shadow-sm"
                style={{ backgroundColor: tone.accent }}
              >
                <Layers className="h-3.5 w-3.5" />
              </span>
              <p className="text-sm font-semibold text-[#0f172a] truncate">
                {data.label || "Без названия"}
              </p>
            </div>
            {fsmLabel && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: tone.badge, color: tone.badgeText }}
              >
                <Sparkles className="h-3 w-3" />
                {fsmLabel}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/5 transition-colors shrink-0"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4 text-[#64748b]" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-[#64748b] mb-2">
            <MessageSquareText className="h-3.5 w-3.5" />
            Название шага
          </label>
          <input
            className="w-full text-sm font-medium rounded-xl border border-[#e8e3d9] bg-[#faf8f4] px-3.5 py-2.5 outline-none focus:border-[var(--ds-primary)] focus:bg-white focus:ring-2 focus:ring-[var(--ds-primary)]/15 text-[#0f172a] transition-all"
            value={data.label}
            onChange={(e) => onUpdate(nodeId, e.target.value, data.content, data.fsmState)}
          />
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-[#64748b] mb-2">
            Инструкция для бота
          </label>
          <textarea
            className="w-full text-sm text-[#0f172a] rounded-xl border border-[#e8e3d9] bg-[#faf8f4] px-3.5 py-3 outline-none focus:border-[var(--ds-primary)] focus:bg-white focus:ring-2 focus:ring-[var(--ds-primary)]/15 resize-y min-h-[180px] leading-relaxed transition-all"
            rows={8}
            value={data.content}
            onChange={(e) => onUpdate(nodeId, data.label, e.target.value, data.fsmState)}
            placeholder="Опишите, что бот должен сказать и сделать на этом шаге…"
          />
          <p className="text-[11px] text-[#94a3b8] mt-2">
            Этот текст использует AI при ведении диалога по сценарию.
          </p>
        </div>

        <div>
          <label className="text-xs font-semibold text-[#64748b] mb-2 block">Этап FSM</label>
          <select
            value={data.fsmState ?? ""}
            onChange={(e) => onUpdate(nodeId, data.label, data.content, e.target.value || undefined)}
            className="w-full text-sm border border-[#e8e3d9] rounded-xl px-3.5 py-2.5 bg-[#faf8f4] text-[#0f172a] focus:border-[var(--ds-primary)] focus:bg-white focus:ring-2 focus:ring-[var(--ds-primary)]/15 outline-none transition-all"
          >
            {CHATBOT_FSM_STATES.map((opt) => (
              <option key={opt.value || "none"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-3.5 border-t border-[#e8e3d9] bg-[#faf8f4]">
        <button
          type="button"
          onClick={() => onAddChild(nodeId)}
          className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ds-primary)] hover:bg-[var(--ds-primary)]/10 px-3 py-2 rounded-xl transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Следующий шаг
        </button>
        <button
          type="button"
          onClick={() => onFork(nodeId)}
          className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:bg-violet-50 px-3 py-2 rounded-xl transition-colors"
        >
          <GitBranch className="h-3.5 w-3.5" />
          Ветка
        </button>
        {!data.isRoot && (
          <button
            type="button"
            onClick={() => onRemove(nodeId)}
            className={cn(
              "ml-auto flex items-center gap-1.5 text-xs font-semibold text-red-500",
              "hover:bg-red-50 px-3 py-2 rounded-xl transition-colors",
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
