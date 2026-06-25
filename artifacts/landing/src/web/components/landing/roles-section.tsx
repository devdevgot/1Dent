import { motion } from "framer-motion";
import { Crown, Settings, Stethoscope, Calculator, Package, ShieldCheck } from "lucide-react";
import { fadeUp, staggerParentVariants, staggerChildVariants } from "../../lib/animations";

const roles = [
  {
    icon: Crown,
    title: "Владелец",
    color: "#fef3c7",
    accent: "#d97706",
    perms: [
      "Полный доступ ко всему",
      "Финансы и расходы",
      "Аналитика по клинике",
      "Управление сотрудниками",
      "Настройка тарифа",
    ],
  },
  {
    icon: Settings,
    title: "Администратор",
    color: "#e0e7ff",
    accent: "#4f46e5",
    perms: [
      "Управление расписанием",
      "Все пациенты",
      "WhatsApp переписка",
      "Финансовые операции",
      "Документы / договоры",
    ],
  },
  {
    icon: Stethoscope,
    title: "Врач",
    color: "#d1fae5",
    accent: "#059669",
    perms: [
      "Только свои пациенты",
      "Зубная карта (FDI)",
      "История лечения",
      "Процедуры и назначения",
      "Телефоны — скрыты",
    ],
    antiTheft: true,
  },
  {
    icon: Calculator,
    title: "Бухгалтер",
    color: "#fce7f3",
    accent: "#db2777",
    perms: [
      "Финансовые отчёты",
      "Выгрузка данных",
      "Зарплаты сотрудников",
      "Только чтение",
    ],
  },
  {
    icon: Package,
    title: "Склад",
    color: "#e0f2fe",
    accent: "#0284c7",
    perms: [
      "Управление запасами",
      "Учёт расходников",
      "Уведомления о нехватке",
    ],
  },
];

export function RolesSection() {
  return (
    <section className="bg-white py-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          {...fadeUp(0)}
          className="text-center mb-6"
        >
          <div className="inline-flex items-center gap-2 bg-[#1f75fe]/10 text-[#1f75fe] rounded-full px-4 py-2 text-sm font-manrope font-medium mb-6">
            <ShieldCheck size={14} />
            <span>Безопасность и роли</span>
          </div>
          <h2
            className="font-manrope font-extrabold text-[#0f172a] leading-tight"
            style={{ fontSize: "clamp(32px, 4.5vw, 56px)" }}
          >
            Каждый видит только своё
          </h2>
        </motion.div>

        <motion.p
          {...fadeUp(0.1)}
          className="text-center font-manrope text-[#64748b] text-lg max-w-2xl mx-auto mb-16"
          style={{ willChange: "transform, opacity" }}
        >
          5 ролей с разными правами доступа. Ни один сотрудник не видит лишнего — данные клиники под защитой.
        </motion.p>

        {/* Roles grid — stagger */}
        <motion.div
          variants={staggerParentVariants(0.08)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-30px" }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5"
        >
          {roles.map((role, i) => (
            <motion.div
              key={i}
              variants={staggerChildVariants}
              style={{ willChange: "transform, opacity" }}
              whileHover={{ scale: 1.03 }}
              className="bg-white rounded-3xl p-6 border border-[#e8e3d9] shadow-sm hover:shadow-md transition-all"
            >
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                style={{ backgroundColor: role.color }}
              >
                <role.icon size={22} style={{ color: role.accent }} />
              </div>

              <h3 className="font-manrope font-bold text-[#0f172a] text-lg mb-4">{role.title}</h3>

              <ul className="space-y-2">
                {role.perms.map((perm, j) => (
                  <li key={j} className="flex items-start gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                      style={{ backgroundColor: role.accent }}
                    />
                    <span
                      className={`font-manrope text-xs leading-snug ${
                        perm === "Телефоны — скрыты"
                          ? "text-orange-500 font-semibold"
                          : "text-[#64748b]"
                      }`}
                    >
                      {perm}
                    </span>
                  </li>
                ))}
              </ul>

              {role.antiTheft && (
                <div className="mt-4 flex items-center gap-2 bg-orange-50 rounded-xl p-3">
                  <ShieldCheck size={14} className="text-orange-500 flex-shrink-0" />
                  <span className="font-manrope text-xs text-orange-600 font-medium">
                    Защита от кражи базы пациентов
                  </span>
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>

        {/* Anti-theft highlight */}
        <motion.div
          {...fadeUp(0.1)}
          style={{ willChange: "transform, opacity" }}
          className="mt-12 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 rounded-3xl p-8 flex gap-6 items-center flex-wrap"
        >
          <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={24} className="text-orange-500" />
          </div>
          <div>
            <h4 className="font-manrope font-bold text-[#0f172a] text-xl mb-1">
              Anti-theft защита базы пациентов
            </h4>
            <p className="font-manrope text-[#64748b] max-w-2xl">
              Врачи видят телефоны в формате <strong className="text-[#0f172a]">+7 *** *** **XX</strong> — нельзя скопировать базу и унести к конкуренту. Ваши пациенты остаются с вами.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
