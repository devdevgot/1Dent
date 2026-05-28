import { useState } from "react";
import {
  useGetDentalAiAnalysis,
  useTriggerDentalAiAnalysis,
  getDentalAiAnalysisQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Brain, RefreshCw, Clock, Sparkles } from "lucide-react";

interface Props {
  patientId: string;
}

function formatReportText(text: string): JSX.Element[] {
  const lines = text.split("\n");
  const elements: JSX.Element[] = [];
  let key = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={key++} className="h-2" />);
      continue;
    }
    if (trimmed.startsWith("## ")) {
      elements.push(
        <h3 key={key++} className="text-sm font-semibold text-gray-800 mt-4 mb-1 flex items-center gap-1.5">
          <span className="w-1 h-4 rounded-full bg-primary inline-block shrink-0" />
          {trimmed.slice(3)}
        </h3>,
      );
    } else if (/^\d+\./.test(trimmed)) {
      elements.push(
        <p key={key++} className="text-sm text-gray-700 pl-4">
          {trimmed}
        </p>,
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      elements.push(
        <p key={key++} className="text-sm text-gray-700 pl-4 before:content-['•'] before:mr-1.5 before:text-primary">
          {trimmed.slice(2)}
        </p>,
      );
    } else {
      elements.push(
        <p key={key++} className="text-sm text-gray-700 leading-relaxed">
          {trimmed}
        </p>,
      );
    }
  }
  return elements;
}

export function DentalAiAnalysisPanel({ patientId }: Props) {
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);

  // Fetch once — no auto-polling, staleTime = Infinity so page navigation won't re-run AI
  const { data, isLoading } = useGetDentalAiAnalysis(patientId, {
    query: {
      staleTime: Infinity,
    },
  });

  const { mutateAsync: triggerAnalysis } = useTriggerDentalAiAnalysis();

  const analysis = data?.data ?? null;

  async function handleTrigger() {
    setIsGenerating(true);
    try {
      await triggerAnalysis(patientId);
      // Poll until the new result arrives (backend is async — typically 5-15 s)
      const pollInterval = setInterval(async () => {
        await queryClient.invalidateQueries({ queryKey: getDentalAiAnalysisQueryKey(patientId) });
        const fresh = queryClient.getQueryData<typeof data>(getDentalAiAnalysisQueryKey(patientId));
        if (fresh?.data) {
          clearInterval(pollInterval);
          setIsGenerating(false);
        }
      }, 3000);

      // Safety net: stop after 60 s regardless
      setTimeout(() => {
        clearInterval(pollInterval);
        setIsGenerating(false);
        queryClient.invalidateQueries({ queryKey: getDentalAiAnalysisQueryKey(patientId) });
      }, 60_000);
    } catch {
      setIsGenerating(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-7 h-7 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Brain className="w-7 h-7 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-gray-800 text-sm">Анализ не проводился</p>
          <p className="text-xs text-gray-400 mt-1 max-w-[220px]">
            Заполните зубную карту и нажмите кнопку ниже для получения ИИ-анализа
          </p>
        </div>

        <button
          onClick={handleTrigger}
          disabled={isGenerating}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium
                     hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Анализируем…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Провести анализ
            </>
          )}
        </button>
      </div>
    );
  }

  const updatedAt = new Date(analysis.updatedAt);
  const formattedDate = updatedAt.toLocaleDateString("ru", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const formattedTime = updatedAt.toLocaleTimeString("ru", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="px-6 py-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Brain className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">ИИ-анализ зубной карты</p>
                <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" />
                  {formattedDate}, {formattedTime}
                </p>
              </div>
            </div>

            {/* Re-analyze button */}
            <button
              onClick={handleTrigger}
              disabled={isGenerating}
              title="Обновить анализ"
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200
                         text-xs text-gray-500 hover:bg-gray-50 hover:border-primary/30 hover:text-primary
                         active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin text-primary" : ""}`} />
              {isGenerating ? "Анализируем…" : "Обновить"}
            </button>
          </div>

          {/* Report */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-0.5">
            {formatReportText(analysis.reportText)}
          </div>
        </div>
      </div>
    </div>
  );
}
