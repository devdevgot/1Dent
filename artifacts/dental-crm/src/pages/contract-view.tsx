import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { CheckCircle2, FileText, Loader2, AlertCircle } from "lucide-react";

interface ContractData {
  id: string;
  token: string;
  status: string;
  renderedHtml: string | null;
  templateName: string;
  patientName: string;
  clinicName: string;
  signedAt: string | null;
}

export default function ContractViewPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/contracts/public/contract/${token}`)
      .then((r) => r.json())
      .then((json: { success: boolean; data?: ContractData; error?: string }) => {
        if (json.success && json.data) {
          setData(json.data);
          if (json.data.status === "signed") setSigned(true);
        } else {
          setError(json.error ?? "Договор не найден");
        }
      })
      .catch(() => setError("Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSign = async () => {
    if (!token) return;
    setSigning(true);
    try {
      const r = await fetch(`/api/contracts/public/contract/${token}/sign`, { method: "POST" });
      const json = (await r.json()) as { success: boolean };
      if (json.success) {
        setSigned(true);
        setData((d) => d ? { ...d, status: "signed" } : d);
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
          <p className="text-gray-700 font-medium">{error ?? "Договор не найден"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{data.templateName}</p>
            <p className="text-xs text-gray-500">{data.clinicName}</p>
          </div>
          {signed && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 text-xs font-semibold rounded-full border border-green-200">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Подписан
            </span>
          )}
        </div>
      </div>

      {/* Document body */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {data.renderedHtml ? (
            <div
              className="p-6 md:p-10 prose prose-sm max-w-none text-gray-800 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: data.renderedHtml }}
            />
          ) : (
            <div className="p-10 text-center text-gray-400">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Содержимое договора недоступно</p>
            </div>
          )}
        </div>

        {/* Sign button */}
        <div className="mt-6 pb-8">
          {signed ? (
            <div className="flex flex-col items-center gap-2 py-6 bg-green-50 rounded-2xl border border-green-100">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
              <p className="text-sm font-semibold text-green-800">Договор подписан</p>
              {data.signedAt && (
                <p className="text-xs text-green-600">
                  {new Date(data.signedAt).toLocaleString("ru-RU")}
                </p>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-sm text-gray-600 mb-4 text-center">
                Нажимая «Подписать», вы подтверждаете, что ознакомились с условиями договора и согласны с ними.
              </p>
              <button
                onClick={() => void handleSign()}
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
                    Подписать договор
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
