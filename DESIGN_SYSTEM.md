# 1Dent — Design System

> **Цель:** Единая дизайн-система для всего продукта 1Dent — лендинг, CRM-дашборд, Telegram-бот администратора.  
> **Стиль:** Wyndy-inspired — кремовый минимализм, крупная типографика, синий акцент.  
> **Аудитория:** владельцы и персонал стоматологических клиник в Казахстане/СНГ.

---

## 1. Философия дизайна

| Принцип | Описание |
|---|---|
| **Clean & Calm** | Медицинский контекст — никакого визуального шума. Много воздуха, светлый фон. |
| **Trust first** | Синий акцент ассоциируется с надёжностью и профессионализмом. |
| **Bold type** | Крупные заголовки с весом 800 — сразу понятно что главное. |
| **Consistent** | Одни и те же компоненты, радиусы, тени на всех платформах. |
| **Fast** | GPU-анимации, willChange, минимум reflow. |

---

## 2. Цвета

### 2.1 Базовая палитра (светлая тема — default)

| Токен | HEX | Использование |
|---|---|---|
| `--bg` | `#faf8f4` | Фон сайта, лендинга, кремовых секций, боковой панели |
| `--surface` | `#ffffff` | Карточки, модалки, таблицы, диалоги |
| `--surface-2` | `#f1ede4` | Вторичные карточки, hover-строки, бейджи |
| `--border` | `#e8e3d9` | Все границы: карточки, инпуты, разделители |
| `--border-strong` | `#d4cfc6` | Фокус-граница инпутов, активные состояния |
| `--text` | `#0f172a` | Основной текст, заголовки |
| `--text-secondary` | `#64748b` | Подзаголовки, описания, лейблы |
| `--text-subtle` | `#94a3b8` | Мета-информация, плейсхолдеры, даты |

### 2.2 Акцент (Primary Blue)

| Токен | HEX | Использование |
|---|---|---|
| `--primary` | `#1f75fe` | Кнопки, ссылки, иконки, активный пункт меню |
| `--primary-hover` | `#1a65e8` | Hover-состояние |
| `--primary-active` | `#1555cc` | Active / pressed |
| `--primary-light` | `rgba(31,117,254,0.10)` | Бейджи, highlight, активный фон сайдбара |
| `--primary-fg` | `#ffffff` | Текст поверх синего фона |

### 2.3 Тёмные акценты лендинга (CTA-секции, оверлеи)

> Не путать с полноценной тёмной темой CRM (см. §2.3b). Эти токены — для тёмных блоков на светлом лендинге.

| Токен | HEX | Использование |
|---|---|---|
| `--dark-bg` | `#0f172a` | CTA-секция лендинга, тёмные оверлеи |
| `--dark-surface` | `#1e293b` | Карточки на тёмном фоне |
| `--dark-border` | `rgba(255,255,255,0.10)` | Границы на тёмном |
| `--dark-text` | `#ffffff` | Основной текст на тёмном |
| `--dark-secondary` | `rgba(255,255,255,0.60)` | Вторичный текст на тёмном |
| `--dark-subtle` | `rgba(255,255,255,0.30)` | Мета на тёмном |
| `--blue-glow` | `#1f75fe` | Декоративный blob-glow |
| `--accent-blue-light` | `#60a5fa` | Акцентное слово в заголовке на тёмном |

### 2.3b Тёмная тема приложения (CRM / PWA)

Активируется классом `html.dark`. Режим по умолчанию — **system** (`prefers-color-scheme`); в PWA тема следует смене светлой/тёмной темы на смартфоне. Пользователь может зафиксировать Light / Dark / System в Профиле → Внешний вид.

| Токен | HEX (dark) | Использование |
|---|---|---|
| `--bg` / `--theme-color` | `#0f172a` | Канвас страницы, `theme-color` / status bar PWA |
| `--ds-surface` | `#1e293b` | Карточки, модалки, группы |
| `--surface-2` | `#334155` | Вторичные поверхности, hover |
| `--ds-border` | `rgba(255,255,255,0.12)` | Границы |
| `--text` | `#f1f5f9` | Основной текст |
| `--text-secondary` | `#cbd5e1` | Вторичный текст |
| `--text-subtle` | `#94a3b8` | Мета / плейсхолдеры |
| `--*-light` (semantic) | полупрозрачные | Фоны status-бейджей |

### 2.4 Семантические цвета (статусы)

| Токен | HEX | Использование |
|---|---|---|
| `--success` | `#16a34a` | Успех, оплачено, активно |
| `--success-light` | `#f0fdf4` | Фон success-бейджа |
| `--warning` | `#d97706` | Предупреждение, ожидание |
| `--warning-light` | `#fef3c7` | Фон warning-бейджа |
| `--danger` | `#dc2626` | Ошибка, отменено, долг |
| `--danger-light` | `#fef2f2` | Фон danger-бейджа |
| `--info` | `#0284c7` | Информация, запланировано |
| `--info-light` | `#e0f2fe` | Фон info-бейджа |
| `--neutral` | `#64748b` | Нейтральный статус |
| `--neutral-light` | `#f1f5f9` | Фон neutral-бейджа |

### 2.5 Цвета FDI зубной карты

| Состояние | Заливка | Обводка | Описание |
|---|---|---|---|
| Здоровый | `#ffffff` | `#B0B5C1` | Норма |
| Кариес | `#F5A623` | `#E09420` | Требует лечения |
| Пролечен | `#4A90E2` | `#3A80D2` | Пломба / обработан |
| Коронка | `#F8E71C` | `#E5C100` | Коронка |
| Корневой канал | `#D0021B` | `#B00218` | Эндодонтия |
| Имплант | `#2F9E99` | `#1F8E89` | Имплантат |
| Отсутствует | `transparent` | `#B0B5C1` | Нет зуба |
| Удалить | `#8B0000` | `#6B0000` | Показание к удалению |

### 2.6 Цвета мессенджеров

| Сервис | HEX |
|---|---|
| WhatsApp | `#25d366` |
| Telegram | `#2481cc` |
| Instagram | `#e91e8c` |

### 2.7 Цвета фич-категорий (дашборд + лендинг)

| Модуль | Фон бейджа | Цвет текста |
|---|---|---|
| Канбан / Записи | `#e0e7ff` | `#4f46e5` |
| WhatsApp AI | `#d1fae5` | `#059669` |
| Финансы / Касса | `#fef3c7` | `#d97706` |
| FDI Карта | `#fce7f3` | `#db2777` |
| Договоры | `#e0f2fe` | `#0284c7` |
| Аналитика | `#f0fdf4` | `#16a34a` |
| Склад | `#f5f3ff` | `#7c3aed` |
| Зарплата | `#fff7ed` | `#ea580c` |

---

## 3. Типографика

**Шрифт:** [Manrope](https://fonts.google.com/specimen/Manrope) — единый для всего продукта.

```css
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800;900&display=swap');

body { font-family: 'Manrope', sans-serif; }
```

### 3.1 Размеры заголовков (лендинг — адаптивные)

| Роль | CSS clamp | Диапазон |
|---|---|---|
| Hero H1 | `clamp(48px, 7.5vw, 88px)` | 48–88px, weight 800 |
| Section H2 | `clamp(36px, 5vw, 64px)` | 36–64px, weight 800 |
| CTA H2 | `clamp(40px, 5.5vw, 72px)` | 40–72px, weight 800 |
| Feature H3 | `clamp(24px, 3vw, 36px)` | 24–36px, weight 700 |
| Card H3 | `clamp(32px, 4vw, 52px)` | 32–52px, weight 700 |

### 3.2 Размеры заголовков (дашборд — фиксированные)

| Роль | Размер | Weight | Использование |
|---|---|---|---|
| Page Title | `24px` | 700 | Название страницы (`<h1>`) |
| Section Title | `18px` | 700 | Заголовок блока/карточки |
| Card Title | `16px` | 600 | Заголовок в карточке |
| Widget Title | `14px` | 600 | Виджет, метрика |

### 3.3 Размеры тела

| Роль | Размер | Weight | Tailwind |
|---|---|---|---|
| Body large | 18px | 400 | `text-lg` |
| Body default | 16px | 400 | `text-base` |
| Body small | 14px | 400 | `text-sm` |
| Caption | 12px | 400 | `text-xs` |
| Micro | 10–11px | 500 | `text-[10px]` |

### 3.4 Веса

| Роль | Weight | Tailwind |
|---|---|---|
| Главные заголовки | 800 | `font-extrabold` |
| Подзаголовки | 700 | `font-bold` |
| Кнопки, лейблы | 600 | `font-semibold` |
| Навигация, бейджи | 500 | `font-medium` |
| Обычный текст | 400 | `font-normal` |

---

## 4. Скругления

| Токен | Значение | Использование |
|---|---|---|
| `rounded` | 4px | Мелкие UI-элементы |
| `rounded-lg` | 8px | Тулбары, inline-элементы |
| `rounded-xl` | 12px | Бейджи, теги, инпуты в форме |
| `rounded-2xl` | 16px | Карточки, превью, диалоги |
| `rounded-3xl` | 24px | Крупные блоки, CTA-форма |
| `rounded-full` | 9999px | Кнопки-пилюли, аватары, чипы |

**Правило:** дашборд использует `rounded-xl` / `rounded-2xl`. Лендинг добавляет `rounded-3xl` и `rounded-full`.

---

## 5. Тени

| Класс | CSS | Использование |
|---|---|---|
| `shadow-xs` | `0 1px 2px rgba(0,0,0,0.05)` | Инпуты, мелкие элементы |
| `shadow-sm` | `0 1px 3px rgba(0,0,0,0.08)` | Навбар в скролле, таблицы |
| `shadow-md` | `0 4px 12px rgba(0,0,0,0.08)` | Карточки, превью |
| `shadow-lg` | `0 8px 24px rgba(0,0,0,0.10)` | Hover, дропдауны, тултипы |
| `shadow-xl` | `0 16px 40px rgba(0,0,0,0.12)` | Модалки, sidebar float |

---

## 6. Spacing

### Лендинг

| Элемент | Значение | px |
|---|---|---|
| Вертикальный padding секции | `py-24` | 96px |
| Горизонтальный padding | `px-6` | 24px |
| Максимальная ширина | `max-w-7xl` | 1280px |
| Между заголовком и контентом | `mb-20` | 80px |
| Gap между карточками | `gap-6`–`gap-10` | 24–40px |

### Дашборд

| Элемент | Значение | px |
|---|---|---|
| Sidebar width | `w-64` | 256px |
| Page padding | `p-6` | 24px |
| Между блоками | `gap-4`–`gap-6` | 16–24px |
| Высота хедера | `h-16` | 64px |
| Отступ в карточке | `p-4`–`p-6` | 16–24px |

---

## 7. Анимации (Framer Motion)

### 7.1 Easing

```ts
// Используется везде в лендинге
export const EASE     = [0.22, 1, 0.36, 1]   // Apple spring — для большинства
export const EASE_OUT = [0, 0, 0.2, 1]        // Для fade без движения

// Дашборд — быстрее, менее театрально
export const EASE_DASH = [0.4, 0, 0.2, 1]    // Material-style
```

### 7.2 Пресеты (lib/animations.ts)

```ts
// Лендинг
fadeUp(delay?, distance = 16)   // opacity 0→1 + y ↑
fadeIn(delay?)                  // только opacity
slideLeft(delay?)               // opacity + x←

// Дашборд
quickFade(delay?)               // duration 0.2s, без движения
slideUp(delay?)                 // y 8px→0, duration 0.25s
```

### 7.3 Stagger (группы)

```ts
// Родитель
variants={staggerParentVariants(0.09)}
initial="hidden"
whileInView="visible"
viewport={{ once: true, margin: "-30px" }}

// Ребёнок
variants={staggerChildVariants}
style={{ willChange: "transform, opacity" }}
```

### 7.4 Правила

| Параметр | Лендинг | Дашборд |
|---|---|---|
| duration | 0.5–0.55s | 0.2–0.3s |
| stagger | 0.08–0.10s | 0.04–0.06s |
| once | true | true |
| willChange | обязательно | опционально |
| Триггер | `whileInView` | `animate` / mount |

---

## 8. Компоненты UI

### 8.1 Кнопки

```tsx
// Primary — везде
<button className="
  bg-[#1f75fe] hover:bg-[#1a65e8] active:bg-[#1555cc]
  text-white font-semibold font-manrope
  px-5 py-2.5 rounded-full
  transition-all hover:scale-105 active:scale-95
">

// Secondary / Outline
<button className="
  border border-[#e8e3d9] text-[#0f172a]
  font-semibold font-manrope
  px-5 py-2.5 rounded-full
  hover:bg-[#f1ede4] transition-colors
">

// Ghost (дашборд — меню, тулбары)
<button className="
  text-[#64748b] hover:text-[#0f172a]
  hover:bg-[#f1ede4] rounded-xl
  px-3 py-2 transition-colors
">

// Danger
<button className="
  bg-[#dc2626] hover:bg-[#b91c1c]
  text-white font-semibold rounded-full
  px-5 py-2.5 transition-all
">
```

### 8.2 Badge / Статус-чип

```tsx
// Стандартный (primary)
<span className="
  inline-flex items-center gap-1.5
  bg-[#1f75fe]/10 text-[#1f75fe]
  rounded-full px-3 py-1 text-sm font-medium
">

// Success
<span className="bg-[#f0fdf4] text-[#16a34a] rounded-full px-3 py-1 text-sm font-medium">

// Warning
<span className="bg-[#fef3c7] text-[#d97706] rounded-full px-3 py-1 text-sm font-medium">

// Danger
<span className="bg-[#fef2f2] text-[#dc2626] rounded-full px-3 py-1 text-sm font-medium">
```

### 8.3 Карточка

```tsx
// Базовая (дашборд)
<div className="bg-white rounded-2xl border border-[#e8e3d9] p-6">

// Метрика (дашборд — KPI)
<div className="bg-white rounded-2xl border border-[#e8e3d9] p-5 flex flex-col gap-1">
  <span className="text-sm font-medium text-[#64748b]">Выручка</span>
  <span className="text-2xl font-bold text-[#0f172a]">₸2,400,000</span>
  <span className="text-xs text-[#16a34a]">↑ 12% к прошлой неделе</span>
</div>

// Hover-карточка (лендинг / интерактив)
<div className="
  bg-white rounded-2xl border border-[#e8e3d9] p-6
  hover:shadow-lg hover:-translate-y-1 transition-all duration-300
">
```

### 8.4 Инпут

```tsx
// Светлый (формы в дашборде)
<input className="
  w-full bg-white border border-[#e8e3d9] rounded-xl
  px-4 py-3 text-sm text-[#0f172a]
  placeholder:text-[#94a3b8] font-manrope
  focus:outline-none focus:border-[#1f75fe] focus:ring-2 focus:ring-[#1f75fe]/20
  transition-colors
">

// Тёмный (CTA-форма лендинга)
<input className="
  bg-white/5 border border-white/10 rounded-2xl
  px-4 py-4 text-sm text-white
  placeholder:text-white/30 font-manrope
  focus:outline-none focus:border-[#1f75fe]/50
  transition-colors
">
```

### 8.5 Sidebar (дашборд)

```tsx
// Фон: #faf8f4 (кремовый, совпадает с лендингом)
// Ширина: w-64 (256px) десктоп, drawer на мобиле

// Пункт меню — неактивный
<a className="
  flex items-center gap-3 px-3 py-2.5 rounded-xl
  text-[#64748b] font-medium text-sm
  hover:bg-[#f1ede4] hover:text-[#0f172a] transition-colors
">

// Пункт меню — активный
<a className="
  flex items-center gap-3 px-3 py-2.5 rounded-xl
  bg-[#1f75fe]/10 text-[#1f75fe] font-semibold text-sm
">
```

### 8.6 Table (дашборд)

```tsx
// Хедер строки
<th className="text-left text-xs font-semibold text-[#64748b] uppercase tracking-wide px-4 py-3">

// Строка
<tr className="border-b border-[#e8e3d9] hover:bg-[#faf8f4] transition-colors">

// Ячейка
<td className="px-4 py-3 text-sm text-[#0f172a]">
```

### 8.7 Модальное окно

```tsx
// Overlay
<div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50">

// Dialog
<div className="
  bg-white rounded-2xl border border-[#e8e3d9] shadow-xl
  max-w-lg w-full p-6 mx-4
">
```

---

## 9. Иконки

**Библиотека:** [Lucide React](https://lucide.dev/) — единственная иконочная библиотека.

```tsx
import { Calendar, Users, DollarSign, ... } from 'lucide-react'

// Размеры
size={16}  // Инлайн в тексте, бейджи
size={18}  // Кнопки, пункты меню
size={20}  // Заголовки карточек
size={24}  // Пустые состояния, крупные элементы
```

---

## 10. Структура страниц

### 10.1 Лендинг

| # | Секция | Фон | Ключевой элемент |
|---|---|---|---|
| 1 | `Navbar` | прозрачный → `#faf8f4` | Логотип + CTA |
| 2 | `Hero` | `#faf8f4` | Главный заголовок + blob |
| 3 | `PainPoints` | `#ffffff` | Карточки боли |
| 4 | `Features` | `#faf8f4` | 6 фич + интерфейс |
| 5 | `AiSection` | `#ffffff` | WhatsApp AI |
| 6 | `RolesSection` | `#faf8f4` | Роли пользователей |
| 7 | `PricingSection` | `#ffffff` | Тарифы |
| 8 | `SocialProof` | `#faf8f4` | Отзывы + статистика |
| 9 | `CtaFooter` | `#0f172a` + `#faf8f4` | Форма + футер |

### 10.2 CRM-дашборд (страницы)

| Страница | Путь | Описание |
|---|---|---|
| Dashboard (owner) | `/dashboard` | KPI, выручка, записи |
| Dashboard (doctor) | `/doctor` | Мои пациенты, расписание |
| Dashboard (admin) | `/admin` | Управление, журнал |
| Kanban | `/kanban` | Воронка пациентов |
| Patients | `/patients` | Список пациентов |
| Calendar | `/admin/calendar` | Расписание приёмов |
| Chat | `/chat` | Переписка + ИИ |
| Chatbot | `/chatbot` | Настройка WhatsApp-бота |
| Analytics | `/analytics` | Отчёты, графики |
| Financials | `/financials` | Касса, транзакции |
| Inventory | `/inventory` | Склад, остатки |
| Payroll | `/payroll-my` | Зарплата сотрудника |
| Staff | `/staff` | Персонал |
| Settings | `/settings` | Настройки клиники |
| AI Credits | `/ai-credits` | Баланс ИИ |
| Pricing | `/pricing` | Тарифные планы |

---

## 11. Декоративные элементы

### Blob (фоновые пятна)

```css
.blob {
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.12;
  position: absolute;
  pointer-events: none;
  z-index: 0;
}
```
Используются в Hero и CTA: синий `#1f75fe` и фиолетовый `#a855f7`.

### Gradient text

```css
.gradient-text {
  background: linear-gradient(135deg, #1f75fe, #60a5fa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

---

## 12. Файловая структура (фронтенд)

```
src/
├── styles.css              # CSS-переменные, базовые стили, scrollbar
├── lib/
│   ├── animations.ts       # Framer Motion пресеты
│   └── utils.ts            # cn() utility (clsx + tailwind-merge)
├── components/
│   ├── ui/                 # Базовые компоненты (Button, Input, Badge, Card...)
│   ├── layout/             # Sidebar, Header, Layout
│   ├── landing/            # Секции лендинга
│   ├── dental-chart/       # FDI зубная карта
│   ├── kanban/             # Kanban-доска
│   ├── dashboard/          # Виджеты дашборда
│   └── chatbot/            # WhatsApp AI компоненты
└── pages/                  # Страницы (по роутам)
```

---

## 13. CSS Variables (root)

```css
:root {
  --bg: #faf8f4;
  --surface: #ffffff;
  --surface-2: #f1ede4;
  --border: #e8e3d9;
  --border-strong: #d4cfc6;
  --text: #0f172a;
  --text-secondary: #64748b;
  --text-subtle: #94a3b8;

  --primary: #1f75fe;
  --primary-hover: #1a65e8;
  --primary-active: #1555cc;
  --primary-light: rgba(31, 117, 254, 0.10);
  --primary-fg: #ffffff;

  --success: #16a34a;
  --success-light: #f0fdf4;
  --warning: #d97706;
  --warning-light: #fef3c7;
  --danger: #dc2626;
  --danger-light: #fef2f2;
  --info: #0284c7;
  --info-light: #e0f2fe;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-full: 9999px;
}
```

---

## 14. Принципы редизайна CRM под лендинг-стиль

При переводе CRM на дизайн-систему лендинга:

1. **Фон сайдбара** → `#faf8f4` (не серый, не белый)
2. **Активный пункт меню** → `bg-[#1f75fe]/10 text-[#1f75fe]` (не синий фон)
3. **Все карточки** → `rounded-2xl border border-[#e8e3d9]` (без резких теней)
4. **Шрифт везде** → Manrope (заменить system-ui / Inter)
5. **Кнопки** → `rounded-full` (Primary), `rounded-xl` (Secondary в дашборде)
6. **Таблицы** → hover `#faf8f4`, хедер `text-[#64748b] uppercase text-xs`
7. **Статусы** → только семантическая палитра из п.2.4
8. **Иконки** → только Lucide, не mixing с другими библиотеками
9. **Тени** → убрать агрессивные тени, использовать `shadow-sm` / `shadow-md`
10. **Анимации** → `quickFade` на появление страниц, без театральных эффектов

---

*Обновлён: июнь 2026*
