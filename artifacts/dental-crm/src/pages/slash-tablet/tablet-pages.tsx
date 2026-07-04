import { useState } from "react";
import { useLocation } from "wouter";
import {
  Calendar, Clock, ChevronRight, MessageCircle, BarChart3, Wallet,
  ClipboardList, FileText, ExternalLink, Monitor, LogOut, Plus,
  TrendingUp, Users, Send, CheckCircle2, Eye,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { cn } from "@/lib/utils";
import { PATIENTS, fmtTenge, initials, CABINET } from "./mock-data";
import type { TabletSession } from "./tablet-session";
import { TABLET_QUICK_ACTIONS } from "./tablet-nav";

// ── Расписание ────────────────────────────────────────────────────────────────
export function TabletSchedulePage({ onSelectPatient }: { onSelectPatient: (id: string) => void }) {
  const hours = ["09:00", "10:30", "11:00", "13:30", "14:00", "15:30"];
  return (
    <div className="h-full overflow-auto p-5">
      <h1 className="mb-1 text-2xl font-extrabold text-[#0f172a]">Расписание</h1>
      <p className="mb-5 text-sm text-[#64748b]">Сегодня · {PATIENTS.length} приёмов</p>
      <div className="space-y-2">
        {PATIENTS.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelectPatient(p.id)}
            className={cn(
              "flex w-full items-center gap-4 rounded-2xl border bg-white p-4 text-left transition-all hover:shadow-md active:scale-[0.99]",
              p.isNow ? "border-[#1f75fe] ring-2 ring-[#1f75fe]/15" : "border-[#e8e3d9]",
            )}
          >
            <div className="w-14 shrink-0 text-center">
              <p className="text-lg font-extrabold text-[#0f172a]">{hours[i] ?? p.appointmentTime}</p>
              {p.isNow && <p className="text-[10px] font-bold text-[#1f75fe]">Сейчас</p>}
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1f75fe]/10 text-sm font-bold text-[#1f75fe]">
              {initials(p.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-[#0f172a]">{p.name}</p>
              <p className="text-sm text-[#64748b]">{p.visitType}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-[#cbd5e1]" />
          </button>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-[#94a3b8]">
        Демо-данные · после бэкенда — реальное расписание из /schedule
      </p>
    </div>
  );
}

// ── Чат ─────────────────────────────────────────────────────────────────────
const MOCK_CHATS = [
  { id: "c1", name: "Мария Садыкова", last: "Спасибо, жду напоминание", time: "12:04", unread: 0 },
  { id: "c2", name: "Ерлан Мухтаров", last: "Можно перенести на понедельник?", time: "11:20", unread: 2 },
  { id: "c3", name: "Аружан Абдуллаева", last: "Документы получила ✓", time: "Вчера", unread: 0 },
];

export function TabletChatPage() {
  const [active, setActive] = useState<string | null>(null);
  const chat = MOCK_CHATS.find((c) => c.id === active);

  if (chat) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-[#e8e3d9] bg-white px-5 py-3">
          <button type="button" onClick={() => setActive(null)} className="text-sm font-semibold text-[#1f75fe]">← Назад</button>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366]/15">
            <FaWhatsapp className="h-5 w-5 text-[#25D366]" />
          </div>
          <p className="font-bold text-[#0f172a]">{chat.name}</p>
        </div>
        <div className="flex-1 space-y-3 overflow-auto p-5">
          <div className="mr-12 rounded-2xl rounded-tl-sm bg-white border border-[#e8e3d9] px-4 py-3 text-sm text-[#0f172a]">
            Здравствуйте! Напоминаем о завтрашнем приёме в 10:00.
          </div>
          <div className="ml-12 rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-4 py-3 text-sm text-[#0f172a]">
            {chat.last}
          </div>
        </div>
        <div className="border-t border-[#e8e3d9] bg-white p-4">
          <div className="flex gap-2">
            <input placeholder="Сообщение…" className="flex-1 rounded-xl border border-[#e8e3d9] px-4 py-3 text-sm outline-none focus:border-[#1f75fe]" />
            <button type="button" className="rounded-xl bg-[#25D366] px-4 py-3 text-white"><Send className="h-5 w-5" /></button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-5">
      <h1 className="mb-5 text-2xl font-extrabold text-[#0f172a]">WhatsApp чат</h1>
      <div className="space-y-2">
        {MOCK_CHATS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActive(c.id)}
            className="flex w-full items-center gap-3 rounded-2xl border border-[#e8e3d9] bg-white p-4 text-left hover:shadow-sm"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366]/10">
              <MessageCircle className="h-6 w-6 text-[#25D366]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="font-bold text-[#0f172a]">{c.name}</p>
                <span className="text-xs text-[#94a3b8]">{c.time}</span>
              </div>
              <p className="truncate text-sm text-[#64748b]">{c.last}</p>
            </div>
            {c.unread > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1f75fe] text-[10px] font-bold text-white">{c.unread}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Аналитика ─────────────────────────────────────────────────────────────────
export function TabletAnalyticsPage({ role }: { role: string }) {
  const stats = [
    { label: "Выручка за месяц", value: "1 240 000 ₸", icon: TrendingUp, color: "#1f75fe" },
    { label: "Пациентов принято", value: "47", icon: Users, color: "#16a34a" },
    { label: "Конверсия в план", value: "68%", icon: BarChart3, color: "#7c3aed" },
    { label: "Средний чек", value: "26 400 ₸", icon: Wallet, color: "#d97706" },
  ];
  return (
    <div className="h-full overflow-auto p-5">
      <h1 className="mb-1 text-2xl font-extrabold text-[#0f172a]">
        {role === "owner" ? "Моя аналитика" : "Аналитика врача"}
      </h1>
      <p className="mb-5 text-sm text-[#64748b]">Период: текущий месяц</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-[#e8e3d9] bg-white p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: s.color + "18" }}>
              <s.icon className="h-5 w-5" style={{ color: s.color }} />
            </div>
            <p className="text-2xl font-extrabold text-[#0f172a]">{s.value}</p>
            <p className="mt-1 text-sm text-[#64748b]">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Зарплата ──────────────────────────────────────────────────────────────────
export function TabletPayrollPage({ role }: { role: string }) {
  return (
    <div className="h-full overflow-auto p-5">
      <h1 className="mb-5 text-2xl font-extrabold text-[#0f172a]">
        {role === "owner" ? "Моя зарплата (врач)" : "Моя зарплата"}
      </h1>
      <div className="rounded-3xl border border-[#e8e3d9] bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-[#94a3b8]">Июль 2026 · предварительно</p>
        <p className="mt-2 text-4xl font-extrabold text-[#0f172a]">{fmtTenge(485000)}</p>
        <p className="mt-2 text-sm text-[#64748b]">Оклад 300 000 ₸ + 15% от выручки</p>
        <div className="mt-6 space-y-2 border-t border-[#f1ede4] pt-4">
          {[
            { label: "Оклад", amount: 300000 },
            { label: "Комиссия", amount: 185000 },
          ].map((row) => (
            <div key={row.label} className="flex justify-between text-sm">
              <span className="text-[#64748b]">{row.label}</span>
              <span className="font-semibold text-[#0f172a]">{fmtTenge(row.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Услуги ────────────────────────────────────────────────────────────────────
const MOCK_SERVICES = [
  { code: "T01", name: "Лечение кариеса, световая пломба", price: 18500, cat: "Терапия" },
  { code: "E01", name: "Депульпирование, обработка каналов", price: 28000, cat: "Эндодонтия" },
  { code: "O01", name: "Коронка металлокерамика", price: 55000, cat: "Ортопедия" },
  { code: "H01", name: "Профессиональная чистка", price: 12000, cat: "Гигиена" },
  { code: "S01", name: "Удаление зуба (сложное)", price: 15000, cat: "Хирургия" },
];

export function TabletServicesPage() {
  return (
    <div className="h-full overflow-auto p-5">
      <h1 className="mb-5 text-2xl font-extrabold text-[#0f172a]">Прайс-лист услуг</h1>
      <div className="space-y-2">
        {MOCK_SERVICES.map((s) => (
          <div key={s.code} className="flex items-center justify-between rounded-2xl border border-[#e8e3d9] bg-white px-4 py-3">
            <div>
              <p className="text-sm font-bold text-[#0f172a]">{s.name}</p>
              <p className="text-xs text-[#94a3b8]">{s.cat} · {s.code}</p>
            </div>
            <p className="text-sm font-extrabold text-[#1f75fe]">{fmtTenge(s.price)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Договоры (общий список) ───────────────────────────────────────────────────
export function TabletContractsPage() {
  const templates = [
    { name: "Договор на лечение", updated: "12 июн 2026" },
    { name: "Информированное согласие", updated: "3 мая 2026" },
    { name: "Акт выполненных работ", updated: "1 апр 2026" },
  ];
  return (
    <div className="h-full overflow-auto p-5">
      <h1 className="mb-5 text-2xl font-extrabold text-[#0f172a]">Шаблоны договоров</h1>
      <div className="space-y-2">
        {templates.map((t) => (
          <div key={t.name} className="flex items-center gap-3 rounded-2xl border border-[#e8e3d9] bg-white p-4">
            <FileText className="h-5 w-5 text-[#1f75fe]" />
            <div className="flex-1">
              <p className="font-semibold text-[#0f172a]">{t.name}</p>
              <p className="text-xs text-[#94a3b8]">Обновлён {t.updated}</p>
            </div>
            <Eye className="h-4 w-4 text-[#94a3b8]" />
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-[#94a3b8]">Договоры пациента — во вкладке «Договоры» в карточке</p>
    </div>
  );
}

// ── Меню ──────────────────────────────────────────────────────────────────────
export function TabletMenuPage({
  session,
  onLogout,
}: {
  session: TabletSession;
  onLogout: () => void;
}) {
  const [, navigate] = useLocation();
  const crmPath = session.role === "owner" ? "/dashboard" : session.role === "admin" ? "/dashboard/admin" : "/dashboard/doctor";

  return (
    <div className="h-full overflow-auto p-5">
      <h1 className="mb-5 text-2xl font-extrabold text-[#0f172a]">Ещё</h1>
      <div className="space-y-2">
        <button type="button" onClick={() => navigate(crmPath)} className="flex w-full items-center gap-3 rounded-2xl border border-[#e8e3d9] bg-white p-4 text-left">
          <ExternalLink className="h-5 w-5 text-[#1f75fe]" />
          <span className="font-semibold text-[#0f172a]">Открыть полный CRM</span>
        </button>
        <button type="button" onClick={() => navigate("/tablet")} className="flex w-full items-center gap-3 rounded-2xl border border-[#e8e3d9] bg-white p-4 text-left">
          <Monitor className="h-5 w-5 text-[#64748b]" />
          <span className="font-semibold text-[#0f172a]">Режим кабинета (QR)</span>
        </button>
        {TABLET_QUICK_ACTIONS.map((a) => (
          <button key={a.path} type="button" onClick={() => navigate(a.path)} className="flex w-full items-center gap-3 rounded-2xl border border-[#e8e3d9] bg-white p-4 text-left">
            <a.icon className="h-5 w-5 text-[#64748b]" />
            <span className="font-semibold text-[#0f172a]">{a.label}</span>
          </button>
        ))}
        <button type="button" onClick={onLogout} className="flex w-full items-center gap-3 rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4 text-left">
          <LogOut className="h-5 w-5 text-[#dc2626]" />
          <span className="font-semibold text-[#dc2626]">Выйти</span>
        </button>
      </div>
      <p className="mt-6 text-center text-xs text-[#94a3b8]">{CABINET.clinicName}</p>
    </div>
  );
}

// ── Договоры в карточке пациента ──────────────────────────────────────────────
export function TabletPatientContracts({ patientName }: { patientName: string }) {
  const [sent, setSent] = useState(false);
  return (
    <div className="space-y-4 p-4">
      <div className="rounded-2xl border border-[#e8e3d9] bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5 text-[#1f75fe]" />
          <h3 className="text-base font-bold text-[#0f172a]">Пакет документов</h3>
        </div>
        <p className="mb-4 text-sm text-[#64748b]">
          Договор на лечение и информированное согласие для {patientName}
        </p>
        <div className="space-y-2">
          {[
            { name: "Договор на оказание стоматологических услуг", status: sent ? "sent" : "draft" },
            { name: "Информированное согласие", status: sent ? "viewed" : "draft" },
          ].map((doc) => (
            <div key={doc.name} className="flex items-center justify-between rounded-xl bg-[#faf8f4] px-3 py-2.5">
              <p className="text-sm font-medium text-[#0f172a]">{doc.name}</p>
              {doc.status === "draft" ? (
                <span className="text-xs text-[#94a3b8]">Черновик</span>
              ) : doc.status === "sent" ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-sky-600"><Send className="h-3 w-3" /> Отправлен</span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-semibold text-amber-600"><Eye className="h-3 w-3" /> Просмотрен</span>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSent(true)}
          disabled={sent}
          className={cn(
            "mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white transition-colors",
            sent ? "bg-[#16a34a]" : "bg-[#25D366] hover:bg-[#20bd5a]",
          )}
        >
          {sent ? <><CheckCircle2 className="h-4 w-4" /> Отправлено в WhatsApp</> : <><FaWhatsapp className="h-5 w-5" /> Отправить договоры в WhatsApp</>}
        </button>
      </div>
    </div>
  );
}
