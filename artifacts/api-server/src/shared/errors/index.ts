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
  constructor(message = "Conflict") {
    super(message, 409, "CONFLICT");
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
