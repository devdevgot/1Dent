# ADR-006: Второй чатбот — дожим и служба заботы

| | |
|---|---|
| **Status** | Proposed |
| **Date** | 2026-07-24 |
| **Context** | Нужно оценить возможность разделить WhatsApp-бота на «запись» и «заботу/дожим» |
| **Related** | `modules/chatbot`, `modules/followups`, `modules/dental-broadcast`, script blocks `followup` / `reminders` / `post_visit` / `reactivation` |

---

## 1. Продуктовая модель (запрос)

| Роль | Задачи |
|------|--------|
| **Бот 1 — запись** | Отвечает на входящие, квалифицирует, записывает на консультацию |
| **Бот 2 — забота / дожим** | Вторые касания, если не ответили / не записались / не пришли; напоминание за ~1 час до визита; после консультации пишет и продаёт повторный визит |

Полный цикл из скрипта Muslim Dent: вход → выявление → запись → **дожим** → **напоминание** → **забота** → **возврат**.

---

## 2. Вердикт

**Отдельный продукт «второй чатбот» — да. Отдельный WhatsApp-номер / отдельный микросервис сейчас — нет.**

Почти весь цикл уже реализован внутри одного clinic-бота и очередей. Правильный шаг — оформить **режим «Служба заботы»** (purpose-aware outbound + reply routing) на **том же номере**, починить доставку и триггеры, и только при жёстком требовании бренда/команды добавить второй Green API номер.

---

## 3. Что уже есть в коде

| Сценарий бота 2 | Статус | Где |
|-----------------|--------|-----|
| Дожим неответивших / незаписавшихся | Есть, но тайминги не те | `chatbot-inactivity.scheduler` + lead nurture в `chatbot.service` (`LEAD_NURTURE_HOURS = 24/72/168`). Скрипт `followup` обещает 20–30 мин / 2–3 ч / следующий день |
| Напоминание о приёме (в т.ч. за 1 ч) | Есть | `appointment-reminders.queue` — типы `24h`, `1h`, `5m` (5m → staff) |
| После приёма — забота | Частично | `postop-followups` queue: 3h / 72h / 168h; скрипт `post_visit` (2–4h / next day) не полностью совпадает с кодом |
| Не пришёл (no-show) | Частично | `triggerReactivation` вызывается при **отмене** процедуры; отдельного детекта «не пришёл» нет |
| Повторная продажа / возврат | Есть | `dental-broadcast` → статус `repeat_sale`; скрипт `reactivation` (3–6 мес) — в основном промпт, без cron |
| Один WhatsApp на клинику | Ограничение | `clinics.greenApi*`; сессия unique `(clinicId, phone)` |

### Важный технический gap

Очереди reminders / postop сейчас шлют через **Meta Cloud API** (`sendWhatsAppMessage`), а живой clinic-чатбот — через **Green API** (`sendToPatient`). Для клиник только на Green API напоминания и post-op могут молча не уходить.

---

## 4. Варианты архитектуры

### A. Один номер, два режима (рекомендуется)

```
WhatsApp (1 Green API)
        │
        ▼
   webhook → router по session.purpose / patient.status
        │
        ├── booking  → агент записи (текущий FSM/agent)
        └── care     → служба заботы (outbound jobs + узкий reply handler)
```

- Один webhook, один инстанс Green API.
- Outbound-джобы (дожим, reminder 1h, post-visit, no-show, upsell) помечают сессию `purpose: "care"`.
- Ответ пациента на care-сообщение обрабатывается care-handler’ом (подтвердить визит / перенести / жалобa → takeover / согласие на запись → handoff в booking).
- В CRM UI: вкладки «Запись» и «Служба заботы» в настройках чатбота (скрипты, тайминги, вкл/выкл), общая лента чата.

**Плюсы:** нет конфликта двух ботов на одном телефоне; быстрее; соответствует текущей схеме.  
**Минусы:** нет визуального разделения «другой номер»; нужна дисциплина routing, чтобы care не открывал полный booking-agent вслепую.

### B. Два WhatsApp-номера (отдельный «бот заботы»)

Нужно:

1. `clinic_whatsapp_channels` (несколько Green API на клинику: `booking` / `care`).
2. Webhook по `instanceId` → `channelId`.
3. Сессии unique `(clinicId, channelId, phone)`.
4. Правила: кто отвечает, если пациент пишет на оба; opt-out; подписи в сообщениях.
5. UI подключения двух номеров + стоимость второго инстанса Green API.

**Когда оправдано:** отдельный бренд «службы заботы», разные команды/SLA, или юридическое разделение маркетинга и записи.  
**Сейчас не нужно** для описанного функционала.

### C. Отдельный микросервис «care-bot»

Отвергаем на текущем этапе: те же таблицы patients/procedures/sessions, дублирование webhook/send, усложнение деплоя без выигрыша при одном номере.

---

## 5. Целевая модель (вариант A)

### 5.1 Роли

| Режим | Inbound | Outbound |
|-------|---------|----------|
| **booking** | Все новые диалоги, запись, перенос/отмена | — |
| **care** | Ответы на care-сообщения (короткий intent) | Дожим, reminders, post-visit, no-show, reactivation/upsell |

### 5.2 Триггеры службы заботы

| # | Триггер | Действие | Предлагаемый тайминг |
|---|---------|----------|----------------------|
| 1 | Лид в воронке, не записался / молчит | Дожим ×3 | 25 мин → 2.5 ч → +1 день (как в скрипте `followup`) |
| 2 | Запись создана | Напоминания | 24h + **1h** (уже в queue) |
| 3 | Визит в прошлом, status всё ещё `scheduled` | No-show → реактивация | +2h после `scheduledAt` (новый джоб) |
| 4 | Процедура completed | Post-visit забота + мягкий upsell | 3h → next day → 7d (выровнять с `post_visit`) |
| 5 | Давно не был | Reactivation / dental-broadcast | 3–6 мес / существующий broadcast |

### 5.3 Routing ответов

```
inbound message
  if humanTakeover → CRM only
  else if open care job / purpose=care / status in (post_op_monitoring, repeat_sale, …)
       → care reply handler (confirm / reschedule / complaint / book-again)
  else
       → booking agent (как сейчас)
```

Жалоба / боль после приёма → `human_takeover` + red alert (уже частично есть в post-op monitoring).

### 5.4 Данные

Минимально без второго номера:

- `session.data.purpose`: `"booking" | "care"`
- опционально таблица `care_jobs` (`type`, `patientId`, `procedureId?`, `sendAt`, `status`, `channel`) для аудита и UI
- конфиг таймингов в `chatbot_settings` (не хардкод 24/72/168)

---

## 6. Что менять в коде (фазы)

### Phase 0 — надёжность доставки (блокер)

- Reminders + postop → `sendToPatient` (Green API first), не только Meta.
- Шаблоны reminders брать из script block `reminders` / настроек клиники.

### Phase 1 — выровнять «бота 2» под продукт

- Lead nurture delays → 25m / 2.5h / 24h (или конфиг из settings).
- Post-op delays/тексты → из `post_visit` (+ upsell CTA на повторный визит).
- No-show detector (scheduled past due → reactivation).
- UI: секция «Служба заботы» в `chatbot.tsx` (вкл/выкл этапов, превью текстов).

### Phase 2 — purpose-aware routing

- Помечать outbound care-сообщения; reply router до booking-agent.
- Не открывать полный booking funnel на каждый ответ «спасибо, всё хорошо».

### Phase 3 — только если продукт требует второй номер

- Multi-channel Green API schema + webhook + UI.
- Care outbound с `channel = care`.

---

## 7. Решение

| Вопрос | Ответ |
|--------|--------|
| Можно ли сделать «второго чатбота»? | **Да**, как продуктовый режим «Служба заботы» |
| Нужен ли второй WhatsApp сейчас? | **Нет** |
| Нужен ли отдельный сервис? | **Нет** |
| База для реализации | Существующие `chatbot` + `followups` + `dental-broadcast` |
| Первый инженерный шаг | Phase 0 (Green API send) + Phase 1 (тайминги, no-show, UI) |

---

## 8. Consequences

**Плюсы**

- Быстрый путь к полному циклу без infra-взрыва.
- Один диалог с пациентом — нет путаницы «с какого номера пишут».
- Переиспользуем agent booking при согласии на повторную запись.

**Минусы / риски**

- Без `purpose` routing care-ответы могут снова запускать длинную воронку записи.
- Пока reminders/postop на Meta — клиники на Green API недополучают «бота 2».
- Второй номер позже всё равно возможен, но дороже в поддержке.

**Не делаем сейчас:** отдельный deployable care-bot; второй Green API «на будущее» без продуктового требования.
