import { useAuthStore } from "@/hooks/use-auth";
import { Users, Calendar, Activity, TrendingUp, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { user, clinic } = useAuthStore();

  const cards = [
    { title: "Всего пациентов", value: "1 248", icon: Users, trend: "+12%", trendUp: true },
    { title: "Приёмов сегодня", value: "24", icon: Calendar, trend: "4 ожидают", trendUp: null },
    { title: "Процедур за месяц", value: "156", icon: Activity, trend: "+8%", trendUp: true },
    { title: "Выручка (MTD)", value: "₽ 45 200", icon: TrendingUp, trend: "+15%", trendUp: true },
  ];

  return (
    <div className="space-y-4 p-4 pb-8">
      {/* Шапка */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground">
            С возвращением, {user?.name.split(' ')[0]}
          </h2>
          <p className="text-muted-foreground mt-1 text-lg">
            Сводка по клинике {clinic?.name} за сегодня.
          </p>
        </div>
        <div className="flex gap-3">
          <button className="px-5 py-2.5 bg-primary text-white font-semibold rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all">
            + Новый пациент
          </button>
        </div>
      </div>

      {/* Красный алерт — для владельца / администратора / врача */}
      {["owner", "admin", "doctor"].includes(user?.role || "") && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-destructive/10 border-2 border-destructive/20 rounded-2xl p-5 flex items-start sm:items-center gap-4"
        >
          <div className="bg-destructive text-white p-2.5 rounded-xl shrink-0 shadow-lg shadow-destructive/20">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-destructive">2 пациента с Красным Алертом</h3>
            <p className="text-destructive/80 font-medium mt-0.5">
              Пациенты сообщили о сильной боли или осложнениях после процедуры в AI-чате.
            </p>
          </div>
          <button className="mt-3 sm:mt-0 sm:ml-auto px-4 py-2 bg-white text-destructive font-bold rounded-lg border border-destructive/20 hover:bg-destructive hover:text-white transition-colors">
            Просмотреть
          </button>
        </motion.div>
      )}

      {/* KPI-карточки */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-card p-6 rounded-2xl border border-border/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-shadow group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-slate-50 text-primary rounded-xl ring-1 ring-border/50">
                <card.icon className="w-6 h-6" />
              </div>
              {card.trendUp !== null && (
                <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${card.trendUp ? "bg-emerald-50 text-emerald-600" : "bg-destructive/10 text-destructive"}`}>
                  {card.trend}
                </span>
              )}
            </div>
            <h3 className="text-muted-foreground font-medium text-sm mb-1">{card.title}</h3>
            <div className="text-3xl font-display font-bold text-foreground">{card.value}</div>
          </motion.div>
        ))}
      </div>

      {/* Контент по ролям */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card rounded-2xl border border-border/50 p-6 shadow-sm min-h-[400px] flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-muted-foreground mb-4">
            <Activity className="w-8 h-8 opacity-50" />
          </div>
          <h3 className="text-xl font-bold font-display">Лента активности</h3>
          <p className="text-muted-foreground max-w-sm mt-2">
            Здесь будут отображаться детальные графики и лента активности на основе данных клиники в реальном времени.
          </p>
        </div>
        
        <div className="bg-card rounded-2xl border border-border/50 p-6 shadow-sm min-h-[400px]">
          <h3 className="text-lg font-bold font-display mb-6">Предстоящие задачи</h3>
          <div className="space-y-4">
            {[1, 2, 3].map((_, i) => (
              <div key={i} className="flex gap-4 p-4 rounded-xl hover:bg-slate-50 border border-transparent hover:border-border transition-colors cursor-pointer">
                <div className="w-2 h-12 bg-primary rounded-full shrink-0" />
                <div>
                  <h4 className="font-semibold text-foreground text-sm">Проверить план лечения</h4>
                  <p className="text-xs text-muted-foreground mt-1">Пациент: Михаил Иванов • 14:00</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
