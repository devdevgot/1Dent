import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { CheckCircle2, FileText, Loader2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

interface BundleContract {
  id: string;
  token: string;
  status: string;
  renderedHtml: string | null;
  templateName: string;
  signedAt: string | null;
}

interface BundleData {
  bundleToken: string;
  patientName: string;
  clinicName: string;
  contracts: BundleContract[];
}

export default function BundleViewPage() {
  const { bundleToken } = useParams<{ bundleToken: string }>();
  const [data, setData] = useState<BundleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!bundleToken) return;
    fetch(`/api/contracts/public/bundle/${bundleToken}`)
      .then((r) => r.json())
      .then((json: { success: boolean; data?: BundleData; error?: string }) => {
        if (json.success && json.data) {
          setData(json.data);
          const allSigned = json.data.contracts.every((c) => c.status === "signed");
          if (allSigned) setSigned(true);
          // Auto-expand first contract
          if (json.data.contracts[0]) {
            setExpanded(new Set([json.data.contracts[0].id]));
          }
        } else {
          setError(json.error ?? "Пакет не найден");
        }
      })
      .catch(() => setError("Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [bundleToken]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSignAll = async () => {
    if (!bundleToken) return;
    setSigning(true);
    try {
      const r = await fetch(`/api/contracts/public/bundle/${bundleToken}/sign`, { method: "POST" });
      const json = (await r.json()) as { success: boolean };
      if (json.success) {
        setSigned(true);
        setData((d) =>
          d
            ? {
                ...d,
                contracts: d.contracts.map((c) => ({
                  ...c,
                  status: "signed",
                  signedAt: new Date().toISOString(),
                })),
              }
            : d,
        );
      }
    } catch {
      /* ignore */
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">{error ?? "Пакет не найден"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <span className="text-base">🦷</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Пакет договоров</p>
              <p className="text-xs text-gray-500">{data.clinicName} · {data.contracts.length} документа</p>
            </div>
            {signed && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 text-xs font-semibold rounded-full border border-green-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Подписано
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-3">
        {/* Greeting */}
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
          <p className="text-sm text-amber-800">
            Уважаемый(-ая) <span className="font-semibold">{data.patientName}</span>! Пожалуйста, ознакомьтесь со всеми документами и подпишите их внизу страницы.
          </p>
        </div>

        {/* Contract list */}
        {data.contracts.map((c, idx) => (
          <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
              onClick={() => toggleExpand(c.id)}
            >
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                {c.status === "signed" ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : (
                  <FileText className="w-4 h-4 text-blue-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {idx + 1}. {c.templateName}
                </p>
              </div>
              {expanded.has(c.id) ? (
                <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              )}
            </button>

            {expanded.has(c.id) && (
              <div className="border-t border-gray-50">
                {c.renderedHtml ? (
                  <div
                    className="px-5 py-4 prose prose-sm max-w-none text-gray-800 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: c.renderedHtml }}
                  />
                ) : (
                  <div className="px-5 py-6 text-center text-gray-400 text-sm">
                    Содержимое недоступно
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Sign all button */}
        <div className="pt-2 pb-8">
          {signed ? (
            <div className="flex flex-col items-center gap-2 py-6 bg-green-50 rounded-2xl border border-green-100">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
              <p className="text-sm font-semibold text-green-800">Все документы подписаны</p>
              <p className="text-xs text-green-600">Спасибо! Клиника получила уведомление.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm text-gray-600 mb-1 font-medium text-center">Подписать все документы</p>
              <p className="text-xs text-gray-400 mb-4 text-center">
                Нажимая «Подписать», вы подтверждаете, что ознакомились со всеми документами и согласны с условиями.
              </p>
              <button
                onClick={() => void handleSignAll()}
                disabled={signing}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {signing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Подписываем…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Подписать все документы
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
