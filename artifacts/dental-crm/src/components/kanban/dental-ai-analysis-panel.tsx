import { useGetDentalAiAnalysis } from "@workspace/api-client-react";
import { Brain, RefreshCw, Clock } from "lucide-react";

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
  const { data, isLoading, isFetching, refetch } = useGetDentalAiAnalysis(patientId, {
    query: {
      refetchInterval: (query) => {
        const result = query.state.data;
        return !result?.data ? 4000 : false;
      },
    },
  });

  const analysis = data?.data ?? null;

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
          <p className="font-semibold text-gray-800 text-sm">Анализ ещё не готов</p>
          <p className="text-xs text-gray-400 mt-1 max-w-[220px]">
            Сохраните диагноз во вкладке «Зубная карта» — ИИ автоматически проанализирует состояние и&nbsp;даст рекомендации
          </p>
        </div>
        {isFetching && (
          <div className="flex items-center gap-2 text-xs text-primary animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            Анализируем данные…
          </div>
        )}
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
          <div className="flex items-start justify-between mb-4">
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
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-40"
              title="Обновить анализ"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Report */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-0.5">
            {formatReportText(analysis.reportText)}
          </div>

          {isFetching && (
            <div className="mt-3 flex items-center gap-2 text-xs text-primary">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Обновляем анализ…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
