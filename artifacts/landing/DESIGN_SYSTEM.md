# 1Dent Design System

**Стиль:** Wyndy-style — кремовый минимализм, крупная типографика, синий акцент.  
**Язык:** Русский. **Аудитория:** владельцы стоматологий в Казахстане/СНГ.

---

## Цвета

### Базовые

| Токен | HEX | Использование |
|---|---|---|
| `background` | `#faf8f4` | Фон всего сайта, светлых секций |
| `foreground` | `#0f172a` | Основной текст, заголовки |
| `card` | `#ffffff` | Карточки, модалки, превью |
| `border` | `#e8e3d9` | Границы карточек, разделители |
| `secondary` | `#f1ede4` | Бейджи, подложки, мuted-bg |
| `muted-foreground` | `#64748b` | Второстепенный текст, подписи |
| `subtle` | `#94a3b8` | Плейсхолдеры, дата, meta |

### Акцент (Primary)

| Токен | HEX | Использование |
|---|---|---|
| `primary` | `#1f75fe` | Кнопки, ссылки, иконки, кольца фокуса |
| `primary-hover` | `#1a65e8` | Hover-состояние кнопок |
| `primary-light` | `#1f75fe1a` | Фон бейджей, highlight-блоки (10% opacity) |
| `primary-foreground` | `#ffffff` | Текст на синем фоне |
| `ring` | `#1f75fe` | Outline при фокусе |

### Тёмные секции (CTA / Hero overlay)

| Токен | HEX | Использование |
|---|---|---|
| `dark-bg` | `#0f172a` | Фон CTA-секции |
| `dark-footer` | `#080d18` | Старый фон футера (не используется) |
| `dark-text` | `#ffffff` | Текст на тёмном фоне |
| `dark-muted` | `rgba(255,255,255,0.6)` | Второстепенный текст на тёмном |
| `dark-subtle` | `rgba(255,255,255,0.3)` | Подписи на тёмном |
| `dark-border` | `rgba(255,255,255,0.1)` | Границы на тёмном фоне |
| `blue-light` | `#60a5fa` | Акцентный текст на тёмном (слово в заголовке) |

### Семантические цвета (FDI карта / статусы)

| Название | HEX | Использование |
|---|---|---|
| `tooth-healthy` | `#ffffff` / stroke `#B0B5C1` | Здоровый зуб |
| `tooth-cavity` | `#F5A623` | Кариес |
| `tooth-treated` | `#4A90E2` | Пролечен / пломба |
| `tooth-crown` | `#F8E71C` / stroke `#E5C100` | Коронка |
| `tooth-root-canal` | `#D0021B` | Канал |
| `tooth-implant` | `#2F9E99` | Имплант |
| `tooth-missing` | `transparent` / stroke `#B0B5C1` | Отсутствует |
| `tooth-extraction` | `#8B0000` | Нужно удаление |

### Цвета фич-карточек (Feature badges)

| Фича | Фон | Акцент |
|---|---|---|
| Канбан | `#e0e7ff` | `#4f46e5` |
| WhatsApp | `#d1fae5` | `#059669` |
| Финансы | `#fef3c7` | `#d97706` |
| FDI карта | `#fce7f3` | `#db2777` |
| Договоры | `#e0f2fe` | `#0284c7` |
| Аналитика | `#f0fdf4` | `#16a34a` |

### Мессенджеры

| Сервис | HEX |
|---|---|
| WhatsApp | `#25d366` |
| Telegram | `#2481cc` |
| Instagram | `#e91e8c` |

---

## Типографика

**Шрифт:** [Manrope](https://fonts.google.com/specimen/Manrope) — единственный шрифт на всём лендинге.  
**Import:** `https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800;900&display=swap`  
**Класс:** `font-manrope` (Tailwind utility)

### Размеры заголовков (адаптивные через `clamp`)

| Роль | CSS | Примерный размер |
|---|---|---|
| Hero H1 (главный) | `clamp(48px, 7.5vw, 88px)` | 48–88px |
| Hero H1 (альт) | `clamp(48px, 6vw, 80px)` | 48–80px |
| Section H2 | `clamp(36px, 5vw, 64px)` | 36–64px |
| CTA H2 | `clamp(40px, 5.5vw, 72px)` | 40–72px |
| Feature H3 | `clamp(24px, 3vw, 36px)` | 24–36px |
| Card H3 | `clamp(32px, 4vw, 52px)` | 32–52px |
| Sub-section H3 | `clamp(32px, 4.5vw, 56px)` | 32–56px |

### Веса

| Роль | Weight | Tailwind |
|---|---|---|
| Главные заголовки | 800 | `font-extrabold` |
| Подзаголовки, карточки | 700 | `font-bold` |
| Кнопки, лейблы | 600 | `font-semibold` |
| Навигация, бейджи | 500 | `font-medium` |
| Обычный текст | 400 | `font-normal` |

### Размеры текста (body)

| Роль | Размер |
|---|---|
| Основной body | `text-lg` (18px) |
| Карточки, описания | `text-base` (16px) |
| Мета, лейблы | `text-sm` (14px) |
| Мелкие подписи | `text-xs` (12px) |
| Микро-текст (превью) | `text-[10px]`, `text-[9px]` |

---

## Скругления

| Токен | Значение | Использование |
|---|---|---|
| `rounded-lg` | 8px | Мелкие элементы |
| `rounded-xl` | 12px | Бейджи, теги, инпуты |
| `rounded-2xl` | 16px | Карточки, превью |
| `rounded-3xl` | 24px | Крупные блоки, форма CTA |
| `rounded-full` | 9999px | Кнопки, аватары, пиллы |

---

## Тени

| Класс | Использование |
|---|---|
| `shadow-sm` | Навбар в скролле, мелкие карточки |
| `shadow-md` | Превью-карточки в Features |
| `shadow-lg` | Hover-эффекты, всплывающие блоки |

---

## Spacing (секции)

| Элемент | Значение |
|---|---|
| Padding секции (вертикаль) | `py-24` (96px) |
| Padding секции (горизонталь) | `px-6` (24px) |
| Максимальная ширина контента | `max-w-7xl` (1280px) |
| Отступ между header и content | `mb-20` |
| Отступ между карточками | `gap-6` — `gap-10` |

---

## Анимации (Framer Motion)

### Easing

```ts
EASE     = [0.22, 1, 0.36, 1]   // Apple-style spring — для большинства анимаций
EASE_OUT = [0, 0, 0.2, 1]       // Для fade без движения
```

### Пресеты

```ts
fadeUp(delay?, distance?)   // opacity 0→1 + y движение вниз→вверх (default 16px)
fadeIn(delay?)              // только opacity, без движения
slideLeft(delay?)           // opacity + x слева
```

### Stagger (группы карточек)

```ts
// На родителе:
variants={staggerParentVariants(0.09)}
initial="hidden"
whileInView="visible"
viewport={{ once: true, margin: "-30px" }}

// На каждом ребёнке:
variants={staggerChildVariants}
style={{ willChange: "transform, opacity" }}
```

### Параметры

| Параметр | Значение |
|---|---|
| duration | `0.5`–`0.55s` |
| stagger между детьми | `0.08`–`0.1s` |
| viewport margin | `-30px` (stagger) / `-40px` (fadeUp) |
| once | `true` — анимируется только при первом появлении |
| willChange | `transform, opacity` — обязательно на анимированных элементах |

---

## Компоненты UI

### Кнопка Primary
```
bg-[#1f75fe] hover:bg-[#1a65e8] text-white font-manrope font-semibold
px-5 py-2.5 rounded-full transition-all hover:scale-105
```

### Кнопка Secondary (outline)
```
border border-[#e8e3d9] text-[#0f172a] font-manrope font-semibold
px-5 py-2.5 rounded-full hover:bg-[#f1ede4] transition-colors
```

### Badge / Pill
```
inline-flex items-center gap-2 bg-[#1f75fe]/10 text-[#1f75fe]
rounded-full px-4 py-2 text-sm font-manrope font-medium
```

### Карточка
```
bg-white rounded-2xl border border-[#e8e3d9] p-6
```

### Инпут (тёмный фон)
```
bg-white/5 border border-white/10 rounded-2xl px-4 py-4
font-manrope text-white placeholder:text-white/30 text-sm
focus:outline-none focus:border-[#1f75fe]/50 transition-colors
```

---

## Декоративные элементы

### Blob (фоновые размытые пятна)
```css
.blob {
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.12;
  position: absolute;
  pointer-events: none;
}
```
Используются в тёмных секциях: синий (`#1f75fe`) и фиолетовый (`purple-500`) glow.

### Разделитель челюстей (FDI карта)
```
w-px bg-gray-200/60  (вертикальная линия посередине)
border-b border-gray-100  (горизонтальная между верхней и нижней)
```

---

## Структура секций лендинга

| # | Компонент | Фон | Ключевой элемент |
|---|---|---|---|
| 1 | `Navbar` | прозрачный → `#faf8f4` | Логотип + CTA кнопка |
| 2 | `Hero` | `#faf8f4` | Главный заголовок + blob |
| 3 | `PainPoints` | `#ffffff` | Карточки боли клиник |
| 4 | `Features` | `#faf8f4` | 6 фич + превью интерфейса |
| 5 | `AiSection` | `#ffffff` | ИИ-чатбот WhatsApp |
| 6 | `RolesSection` | `#faf8f4` | Роли пользователей |
| 7 | `PricingSection` | `#ffffff` | 3 тарифных плана |
| 8 | `SocialProof` | `#faf8f4` | Статистика + отзывы |
| 9 | `CtaFooter` | `#0f172a` + `#faf8f4` | Форма заявки + футер |

---

## Файлы

| Файл | Содержимое |
|---|---|
| `src/web/styles.css` | CSS переменные, базовые стили, scrollbar, GPU-оптимизации |
| `src/web/lib/animations.ts` | Все Framer Motion пресеты |
| `src/web/lib/utils.ts` | `cn()` утилита (clsx + tailwind-merge) |
| `src/web/components/dental-chart/fdi-chart.tsx` | FDI зубная карта, `CONDITION_CONFIG`, `COLORS` |
