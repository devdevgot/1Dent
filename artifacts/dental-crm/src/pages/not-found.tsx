import { Link } from "wouter";
import { AlertCircle, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full text-center bg-white p-8 rounded-3xl border border-border shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10 text-muted-foreground" />
        </div>
        <h1 className="text-4xl font-display font-bold text-foreground mb-3">404</h1>
        <h2 className="text-xl font-semibold text-slate-700 mb-2">Страница не найдена</h2>
        <p className="text-muted-foreground mb-8">
          Страница не существует или была перемещена.
        </p>
        <Link 
          href="/" 
          className="inline-flex items-center justify-center px-6 py-3 bg-primary text-white font-semibold rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Вернуться на главную
        </Link>
      </div>
    </div>
  );
}
