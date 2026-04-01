import { setAuthTokenGetter } from "@workspace/api-client-react";

const AUTH_TOKEN_KEY = "auth_token";

export function saveAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  setAuthTokenGetter(() => token);
}

export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  setAuthTokenGetter(null);
}

export function restoreAuthToken() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    setAuthTokenGetter(() => token);
  }
}
