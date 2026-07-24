# ADR-006: Customer Care Chatbot (второй бот на том же WhatsApp)

| | |
|---|---|
| **Status** | Accepted (product direction) |
| **Date** | 2026-07-24 |
| **Context** | Нужен отдельный бот дожима/заботы; запись остаётся как сейчас |
| **Decision** | Один WhatsApp на клинику; новый модуль `customer-care-chatbot`; **`modules/chatbot` не трогаем** |

---

## 1. Продуктовая модель

| Роль | Номер WhatsApp | Код |
|------|----------------|-----|
| **Chatbot (запись)** | Тот же Green API клиники | `modules/chatbot/*` — **без изменений** |
| **Customer Care Chatbot** | Тот же номер | **новый** `modules/customer-care-chatbot/*` |

Клиники по-прежнему: 1 номер = 1 Green API instance. Два логических бота делят этот канал.

---

## 2. Новый модуль — что добавляем

```
artifacts/api-server/src/modules/customer-care-chatbot/
  customer-care-chatbot.service.ts   ← основной файл (логика + outbound + reply)
  customer-care-chatbot.types.ts     ← типы сценариев / jobs
  customer-care-chatbot.scheduler.ts ← тик: дожим, no-show, post-visit, upsell
  customer-care-templates.ts         ← тексты (дожим / reminder / post-visit / upsell)
  customer-care-chatbot.controller.ts← (позже) API настроек вкл/выкл + превью
```

Тонкий glue **вне** chatbot (не меняя `chatbot.service.ts`):

```
messages.service handleInboundWebhook
  → если у пациента активный care-job / care-сессия
       → CustomerCareChatbotService.processReply(...)
  → иначе
       → ChatbotService.processMessage(...)   // как сейчас
```

Старт scheduler — рядом с существующими в `index.ts` (не внутри chatbot).

---

## 3. Возможности Customer Care Chatbot

| # | Возможность | Триггер | Что делает бот |
|---|-------------|---------|----------------|
| 1 | **Дожим лида** | Пациент писал / был в воронке записи, но не записался / замолчал | 2-е / 3-е касание: предложить время (25 мин → 2.5 ч → +1 день) |
| 2 | **Напоминание о визите** | Есть `procedure` со status `scheduled` | Сообщение за ~1 час (и опционально за день) через `sendToPatient` |
| 3 | **No-show** | Визит прошёл, status всё ещё `scheduled` | «Не дождались вас…» + предложить перенос |
| 4 | **Забота после приёма** | Процедура `completed` | «Как самочувствие?» через 2–4 ч / на следующий день |
| 5 | **Повторная продажа** | После заботы или через N дней | Мягкий upsell: контрольный / следующий этап лечения / запись |
| 6 | **Ответ на care-сообщение** | Пациент ответил на пункт 1–5 | Короткий handler: подтвердить / перенести / жалоба→staff / «хочу записаться»→передать в booking-бот |

Чего **нет** в Customer Care (остаётся в текущем chatbot):

- приветствие и квалификация с нуля;
- подбор врача / слоты / `book_appointment`;
- knowledge / dental_qa;
- human takeover логика записи.

Если пациент в care отвечает «запишите меня» — care **передаёт** диалог в существующий chatbot (handoff), не дублируя booking FSM.

---

## 4. Почему отдельный файл, а не правки текущего

- Текущий chatbot продолжает работать как сейчас (запись не ломаем).
- Care можно включать/выключать per clinic.
- Проще тестировать и ревьюить outbound-сценарии отдельно.
- Один номер → один webhook; разделение только по **активному care-контексту**, не по телефону отправителя клиники.

---

## 5. Данные (минимально)

Новая таблица (или JSON jobs), **не** ломая `chatbot_sessions`:

`customer_care_jobs`

| field | meaning |
|-------|---------|
| clinicId, patientId, phone | адресат |
| type | `lead_nurture` \| `reminder_1h` \| `no_show` \| `post_visit` \| `upsell` |
| status | `pending` \| `sent` \| `replied` \| `cancelled` |
| sendAt | когда слать |
| procedureId? | для reminder / no-show / post-visit |
| step | этап последовательности (1/2/3) |

Пока есть `sent` job с недавним окном ответа — inbound идёт в care; иначе — в booking chatbot.

---

## 6. Фазы реализации

| Phase | Scope |
|-------|--------|
| **0** | Каркас модуля + types + templates + no-op service (этот PR / следующий) |
| **1** | Scheduler: дожим + reminder 1h + no-show (outbound через `sendToPatient`) |
| **2** | Post-visit + upsell |
| **3** | Reply routing в `messages.service` + handoff в booking |
| **4** | UI `/customer-care` в CRM — отдельные шаблоны + AI-промпты; запись после согласия всегда через основной chatbot (`handoff_to_booking`) |

Legacy lead nurture / Meta-only queues в `chatbot` / `followups` **не удаляем** на первом шаге — care работает параллельно за feature flag, потом можно отключить дубли.

---

## 7. Consequences

**Плюсы:** изоляция от booking; один WhatsApp; текущий бот не трогаем.  
**Минусы:** нужен аккуратный router в `messages.service`; временно возможны дубли касаний, пока legacy nurture не выключен флагом.  
**Не делаем:** второй WhatsApp-номер; правки внутри `chatbot.service.ts` для care-логики.
