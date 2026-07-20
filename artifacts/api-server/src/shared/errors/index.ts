export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(
    message = "Conflict",
    public readonly details?: unknown,
    code: string = "CONFLICT",
  ) {
    super(message, 409, code);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed") {
    super(message, 400, "VALIDATION_ERROR");
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests") {
    super(message, 429, "TOO_MANY_REQUESTS");
  }
}

export class WhatsappNotConnectedError extends AppError {
  constructor(message = "WhatsApp не подключён для этой клиники") {
    super(message, 422, "WHATSAPP_NOT_CONNECTED");
  }
}

export class InsufficientAiCreditsError extends AppError {
  constructor(
    message = "AI-кредиты закончились. Докупите дополнительные кредиты или смените тариф.",
  ) {
    super(message, 402, "AI_CREDITS_EXHAUSTED");
  }
}

export class PlanLimitExceededError extends AppError {
  constructor(
    public readonly limitKey: string,
    public readonly limit: number | null,
    message?: string,
  ) {
    const labels: Record<string, string> = {
      staff: "сотрудников",
      branches: "филиалов",
      aiCredits: "AI-кредитов",
      chatbotDialogs: "диалогов чат-бота",
      documentTemplates: "шаблонов договоров",
    };
    const label = labels[limitKey] ?? "ресурсов";
    const limitText =
      limitKey === "documentTemplates" && limit == null
        ? "без лимита"
        : limit != null
          ? String(limit)
          : "0";
    super(
      message ??
        `Достигнут лимит ${label} по вашему тарифу (${limitText}). Перейдите на тариф с большим лимитом.`,
      403,
      "PLAN_LIMIT_EXCEEDED",
    );
  }
}

export class OpenRouterNotConfiguredError extends AppError {
  constructor(
    message = "AI-чатбот недоступен: не настроен OPENROUTER_API_KEY. Добавьте ключ OpenRouter в переменные окружения сервера.",
  ) {
    super(message, 503, "OPENROUTER_NOT_CONFIGURED");
  }
}

export class OpenRouterAiFailedError extends AppError {
  constructor(
    message = "AI не смог сгенерировать ответ. Проверьте баланс OpenRouter и настройки модели.",
  ) {
    super(message, 502, "OPENROUTER_AI_FAILED");
  }
}

export class TabletPinSetupRequiredError extends AppError {
  constructor(
    public readonly linkToken: string,
    message = "Установите PIN-код для входа в планшетный кабинет",
  ) {
    super(message, 428, "TABLET_PIN_SETUP_REQUIRED");
  }
}

export class TabletPinRequiredError extends AppError {
  constructor(message = "Введите PIN-код планшета") {
    super(message, 401, "TABLET_PIN_REQUIRED");
  }
}

export class TabletPinInvalidError extends AppError {
  constructor(message = "Неверный PIN-код") {
    super(message, 401, "TABLET_PIN_INVALID");
  }
}

export class TabletCabinetStaleError extends AppError {
  constructor(
    message = "Привязка к кабинету устарела. На планшете нажмите «Обновить код» и отсканируйте новый QR.",
  ) {
    super(message, 404, "TABLET_CABINET_STALE");
  }
}

export class TabletNotPairedByOwnerError extends AppError {
  constructor(
    message = "Владелец еще не подключил этот планшет",
  ) {
    super(message, 403, "TABLET_NOT_PAIRED_BY_OWNER");
  }
}
