export type CustomFetchOptions = RequestInit & {
  responseType?: "json" | "text" | "blob" | "auto";
};

export type FetchWithAuthOptions = RequestInit & {
  /** When true, do not attach x-clinic-branch-id (e.g. retry after stale branch 403). */
  skipBranchHeader?: boolean;
};

export type ErrorType<T = unknown> = ApiError<T>;

export type BodyType<T> = T;

export type AuthTokenGetter = () => Promise<string | null> | string | null;
export type BranchIdGetter = () => Promise<string | null> | string | null;
export type UnauthorizedHandler = () => void;

/** Optional offline/outbox interceptor registered by the CRM PWA. */
export type OfflineMutationInterceptor = (args: {
  url: string;
  method: string;
  body: string | null;
  headers: Headers;
}) => Promise<unknown | null>;

/** Optional offline read interceptor — return cached payload or null. */
export type OfflineReadInterceptor = (args: {
  url: string;
  method: string;
}) => Promise<unknown | null>;

/** Optional body rewriter (e.g. inject baseUpdatedAt for optimistic concurrency). */
export type RequestBodyRewriter = (args: {
  url: string;
  method: string;
  body: string | null;
}) => string | null;

const NO_BODY_STATUS = new Set([204, 205, 304]);
const DEFAULT_JSON_ACCEPT = "application/json, application/problem+json";

const SKIP_UNAUTHORIZED_PATHS = [
  "/api/auth/login",
  "/api/auth/me",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/tablet/public/",
];
const SKIP_BRANCH_HEADER_PATHS = ["/api/auth/", "/api/clinic-branches"];

// ---------------------------------------------------------------------------
// Module-level configuration
// ---------------------------------------------------------------------------

let _baseUrl: string | null = null;
let _authTokenGetter: AuthTokenGetter | null = null;
let _branchIdGetter: BranchIdGetter | null = null;
let _unauthorizedHandler: UnauthorizedHandler | null = null;
let _unauthorizedFired = false;
let _offlineMutationInterceptor: OfflineMutationInterceptor | null = null;
let _offlineReadInterceptor: OfflineReadInterceptor | null = null;
let _requestBodyRewriter: RequestBodyRewriter | null = null;

/**
 * Register a handler that is called once when any API response returns 401.
 * Typical use: clear auth state and redirect to /login.
 * Pass `null` to clear the handler.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  _unauthorizedHandler = handler;
  _unauthorizedFired = false;
}

/**
 * Set a base URL that is prepended to every relative request URL
 * (i.e. paths that start with `/`).
 *
 * Useful for Expo bundles that need to call a remote API server.
 * Pass `null` to clear the base URL.
 */
export function setBaseUrl(url: string | null): void {
  _baseUrl = url ? url.replace(/\/+$/, "") : null;
}

export function getBaseUrl(): string | null {
  return _baseUrl;
}

/**
 * Register a getter that supplies a bearer auth token.  Before every fetch
 * the getter is invoked; when it returns a non-null string, an
 * `Authorization: Bearer <token>` header is attached to the request.
 *
 * Useful for Expo bundles making token-gated API calls.
 * Pass `null` to clear the getter.
 */
export function setAuthTokenGetter(getter: AuthTokenGetter | null): void {
  _authTokenGetter = getter;
}

export function setBranchIdGetter(getter: BranchIdGetter | null): void {
  _branchIdGetter = getter;
}

/**
 * Register an interceptor that can queue mutating API calls while offline
 * and return a synthetic success payload so the UI stays usable.
 * Return `null` to fall through to the network.
 */
export function setOfflineMutationInterceptor(
  interceptor: OfflineMutationInterceptor | null,
): void {
  _offlineMutationInterceptor = interceptor;
}

/**
 * Register an interceptor that serves cached GET responses while offline.
 * Return `null` to fall through (or fail) normally.
 */
export function setOfflineReadInterceptor(
  interceptor: OfflineReadInterceptor | null,
): void {
  _offlineReadInterceptor = interceptor;
}

/** Rewrite JSON bodies before send (used to inject baseUpdatedAt). */
export function setRequestBodyRewriter(rewriter: RequestBodyRewriter | null): void {
  _requestBodyRewriter = rewriter;
}

function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isRequest(input: RequestInfo | URL): input is Request {
  return typeof Request !== "undefined" && input instanceof Request;
}

function resolveMethod(input: RequestInfo | URL, explicitMethod?: string): string {
  if (explicitMethod) return explicitMethod.toUpperCase();
  if (isRequest(input)) return input.method.toUpperCase();
  return "GET";
}

// Use loose check for URL — some runtimes (e.g. React Native) polyfill URL
// differently, so `instanceof URL` can fail.
function isUrl(input: RequestInfo | URL): input is URL {
  return typeof URL !== "undefined" && input instanceof URL;
}

function applyBaseUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (!_baseUrl) return input;
  const url = resolveUrl(input);
  // Only prepend to relative paths (starting with /)
  if (!url.startsWith("/")) return input;

  const absolute = `${_baseUrl}${url}`;
  if (typeof input === "string") return absolute;
  if (isUrl(input)) return new URL(absolute);
  return new Request(absolute, input as Request);
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (isUrl(input)) return input.toString();
  return input.url;
}

function mergeHeaders(...sources: Array<HeadersInit | undefined>): Headers {
  const headers = new Headers();

  for (const source of sources) {
    if (!source) continue;
    new Headers(source).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headers;
}

function getMediaType(headers: Headers): string | null {
  const value = headers.get("content-type");
  return value ? value.split(";", 1)[0].trim().toLowerCase() : null;
}

function isJsonMediaType(mediaType: string | null): boolean {
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}

function isTextMediaType(mediaType: string | null): boolean {
  return Boolean(
    mediaType &&
      (mediaType.startsWith("text/") ||
        mediaType === "application/xml" ||
        mediaType === "text/xml" ||
        mediaType.endsWith("+xml") ||
        mediaType === "application/x-www-form-urlencoded"),
  );
}

// Use strict equality: in browsers, `response.body` is `null` when the
// response genuinely has no content.  In React Native, `response.body` is
// always `undefined` because the ReadableStream API is not implemented —
// even when the response carries a full payload readable via `.text()` or
// `.json()`.  Loose equality (`== null`) matches both `null` and `undefined`,
// which causes every React Native response to be treated as empty.
function hasNoBody(response: Response, method: string): boolean {
  if (method === "HEAD") return true;
  if (NO_BODY_STATUS.has(response.status)) return true;
  if (response.headers.get("content-length") === "0") return true;
  if (response.body === null) return true;
  return false;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function getStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = (value as Record<string, unknown>)[key];
  if (typeof candidate !== "string") return undefined;

  const trimmed = candidate.trim();
  return trimmed === "" ? undefined : trimmed;
}

function truncate(text: string, maxLength = 300): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function buildErrorMessage(response: Response, data: unknown): string {
  const prefix = `HTTP ${response.status} ${response.statusText}`;

  if (typeof data === "string") {
    const text = data.trim();
    return text ? `${prefix}: ${truncate(text)}` : prefix;
  }

  const title = getStringField(data, "title");
  const detail = getStringField(data, "detail");
  const message =
    getStringField(data, "message") ??
    getStringField(data, "error_description") ??
    getStringField(data, "error");

  if (title && detail) return `${prefix}: ${title} — ${detail}`;
  if (detail) return `${prefix}: ${detail}`;
  if (message) return `${prefix}: ${message}`;
  if (title) return `${prefix}: ${title}`;

  return prefix;
}

export class ApiError<T = unknown> extends Error {
  readonly name = "ApiError";
  readonly status: number;
  readonly statusText: string;
  readonly data: T | null;
  readonly headers: Headers;
  readonly response: Response;
  readonly method: string;
  readonly url: string;

  constructor(
    response: Response,
    data: T | null,
    requestInfo: { method: string; url: string },
  ) {
    super(buildErrorMessage(response, data));
    Object.setPrototypeOf(this, new.target.prototype);

    this.status = response.status;
    this.statusText = response.statusText;
    this.data = data;
    this.headers = response.headers;
    this.response = response;
    this.method = requestInfo.method;
    this.url = response.url || requestInfo.url;
  }
}

export class ResponseParseError extends Error {
  readonly name = "ResponseParseError";
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly response: Response;
  readonly method: string;
  readonly url: string;
  readonly rawBody: string;
  readonly cause: unknown;

  constructor(
    response: Response,
    rawBody: string,
    cause: unknown,
    requestInfo: { method: string; url: string },
  ) {
    super(
      `Failed to parse response from ${requestInfo.method} ${response.url || requestInfo.url} ` +
        `(${response.status} ${response.statusText}) as JSON`,
    );
    Object.setPrototypeOf(this, new.target.prototype);

    this.status = response.status;
    this.statusText = response.statusText;
    this.headers = response.headers;
    this.response = response;
    this.method = requestInfo.method;
    this.url = response.url || requestInfo.url;
    this.rawBody = rawBody;
    this.cause = cause;
  }
}

async function parseJsonBody(
  response: Response,
  requestInfo: { method: string; url: string },
): Promise<unknown> {
  const raw = await response.text();
  const normalized = stripBom(raw);

  if (normalized.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(normalized);
  } catch (cause) {
    throw new ResponseParseError(response, raw, cause, requestInfo);
  }
}

async function parseErrorBody(response: Response, method: string): Promise<unknown> {
  if (hasNoBody(response, method)) {
    return null;
  }

  const mediaType = getMediaType(response.headers);

  // Fall back to text when blob() is unavailable (e.g. some React Native builds).
  if (mediaType && !isJsonMediaType(mediaType) && !isTextMediaType(mediaType)) {
    return typeof response.blob === "function" ? response.blob() : response.text();
  }

  const raw = await response.text();
  const normalized = stripBom(raw);
  const trimmed = normalized.trim();

  if (trimmed === "") {
    return null;
  }

  if (isJsonMediaType(mediaType) || looksLikeJson(normalized)) {
    try {
      return JSON.parse(normalized);
    } catch {
      return raw;
    }
  }

  return raw;
}

function inferResponseType(response: Response): "json" | "text" | "blob" {
  const mediaType = getMediaType(response.headers);

  if (isJsonMediaType(mediaType)) return "json";
  if (isTextMediaType(mediaType) || mediaType == null) return "text";
  return "blob";
}

async function parseSuccessBody(
  response: Response,
  responseType: "json" | "text" | "blob" | "auto",
  requestInfo: { method: string; url: string },
): Promise<unknown> {
  if (hasNoBody(response, requestInfo.method)) {
    return null;
  }

  const effectiveType =
    responseType === "auto" ? inferResponseType(response) : responseType;

  switch (effectiveType) {
    case "json":
      return parseJsonBody(response, requestInfo);

    case "text": {
      const text = await response.text();
      return text === "" ? null : text;
    }

    case "blob":
      if (typeof response.blob !== "function") {
        throw new TypeError(
          "Blob responses are not supported in this runtime. " +
            "Use responseType \"json\" or \"text\" instead.",
        );
      }
      return response.blob();
  }
}

async function attachAuthHeaders(
  input: RequestInfo | URL,
  headers: Headers,
  options: { skipBranchHeader?: boolean; method?: string } = {},
): Promise<{ method: string; url: string }> {
  const method = resolveMethod(input, options.method);

  if (_authTokenGetter && !headers.has("authorization")) {
    const token = await _authTokenGetter();
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
  }

  const requestUrl = resolveUrl(input);
  const shouldAttachBranchHeader =
    !options.skipBranchHeader &&
    !SKIP_BRANCH_HEADER_PATHS.some((p) => requestUrl.includes(p));
  if (_branchIdGetter && shouldAttachBranchHeader && !headers.has("x-clinic-branch-id")) {
    const branchId = await _branchIdGetter();
    if (branchId) {
      headers.set("x-clinic-branch-id", branchId);
    }
  }

  return { method, url: requestUrl };
}

/** Low-level authenticated fetch that returns the raw Response (for file downloads). */
export async function fetchWithAuth(
  input: RequestInfo | URL,
  options: FetchWithAuthOptions = {},
): Promise<Response> {
  input = applyBaseUrl(input);
  const { skipBranchHeader = false, headers: headersInit, ...init } = options;
  const method = resolveMethod(input, init.method);

  if (init.body != null && (method === "GET" || method === "HEAD")) {
    throw new TypeError(`fetchWithAuth: ${method} requests cannot have a body.`);
  }

  const headers = mergeHeaders(isRequest(input) ? input.headers : undefined, headersInit);
  await attachAuthHeaders(input, headers, { skipBranchHeader, method });

  return fetch(input, { ...init, method, headers, credentials: "include" });
}

export async function customFetch<T = unknown>(
  input: RequestInfo | URL,
  options: CustomFetchOptions = {},
): Promise<T> {
  input = applyBaseUrl(input);
  const { responseType = "auto", headers: headersInit, ...init } = options;

  const method = resolveMethod(input, init.method);

  if (init.body != null && (method === "GET" || method === "HEAD")) {
    throw new TypeError(`customFetch: ${method} requests cannot have a body.`);
  }

  const headers = mergeHeaders(isRequest(input) ? input.headers : undefined, headersInit);

  let body =
    typeof init.body === "string"
      ? init.body
      : init.body == null
        ? null
        : null;

  // Only rewrite string JSON bodies (Orval always sends JSON.stringify).
  if (typeof init.body === "string" && _requestBodyRewriter) {
    body = _requestBodyRewriter({
      url: resolveUrl(input),
      method,
      body: init.body,
    });
  } else if (typeof init.body === "string") {
    body = init.body;
  }

  if (
    typeof body === "string" &&
    !headers.has("content-type") &&
    looksLikeJson(body)
  ) {
    headers.set("content-type", "application/json");
  }

  if (responseType === "json" && !headers.has("accept")) {
    headers.set("accept", DEFAULT_JSON_ACCEPT);
  }

  const requestInfo = await attachAuthHeaders(input, headers, { method });
  const offline = isBrowserOffline();

  if (offline && method === "GET" && _offlineReadInterceptor) {
    const cached = await _offlineReadInterceptor({
      url: requestInfo.url,
      method,
    });
    if (cached !== null) {
      return cached as T;
    }
  }

  if (
    offline &&
    _offlineMutationInterceptor &&
    method !== "GET" &&
    method !== "HEAD"
  ) {
    const synthetic = await _offlineMutationInterceptor({
      url: requestInfo.url,
      method,
      body,
      headers,
    });
    if (synthetic !== null) {
      return synthetic as T;
    }
  }

  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      method,
      headers,
      body: body ?? init.body,
      credentials: "include",
    });
  } catch (networkErr) {
    if (method === "GET" && _offlineReadInterceptor) {
      const cached = await _offlineReadInterceptor({
        url: requestInfo.url,
        method,
      });
      if (cached !== null) {
        return cached as T;
      }
    }
    if (
      _offlineMutationInterceptor &&
      method !== "GET" &&
      method !== "HEAD"
    ) {
      const synthetic = await _offlineMutationInterceptor({
        url: requestInfo.url,
        method,
        body,
        headers,
      });
      if (synthetic !== null) {
        return synthetic as T;
      }
    }
    throw networkErr;
  }

  if (!response.ok) {
    const errorData = await parseErrorBody(response, method);
    const apiError = new ApiError(response, errorData, requestInfo);

    if (
      response.status === 401 &&
      _unauthorizedHandler &&
      !_unauthorizedFired &&
      !SKIP_UNAUTHORIZED_PATHS.some((p) => requestInfo.url.includes(p))
    ) {
      _unauthorizedFired = true;
      setTimeout(() => {
        _unauthorizedHandler?.();
      }, 0);
    }

    if (
      response.status >= 400 &&
      // 429 is expected under burst traffic (PTR) — don't spam the error pipeline.
      response.status !== 429 &&
      !requestInfo.url.includes("/api/errors/report")
    ) {
      const skipAuthNoise =
        response.status === 401 &&
        SKIP_UNAUTHORIZED_PATHS.some((p) => requestInfo.url.includes(p));

      if (!skipAuthNoise) {
        void fetch("/api/errors/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            source: "dental-crm",
            severity: response.status >= 500 ? "error" : "warning",
            message: apiError.message,
            code: `HTTP_${response.status}`,
            url: requestInfo.url,
            metadata: {
              method: requestInfo.method,
              statusText: response.statusText,
              data: errorData,
            },
          }),
        }).catch(() => {});
      }
    }

    throw apiError;
  }

  return (await parseSuccessBody(response, responseType, requestInfo)) as T;
}
