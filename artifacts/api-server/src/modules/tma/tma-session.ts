import jwt from "jsonwebtoken";
import type { TmaUser } from "./tma.types";

/** TMA admin session lifetime while the mini app stays open. */
export const TMA_SESSION_TTL_SEC = 6 * 60 * 60;
export const TMA_TOKEN_TYP = "tma";

export interface TmaJwtPayload {
  typ: string;
  telegramUserId: string;
  name: string;
}

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    throw new Error("JWT_SECRET is not set. The server should have set it at startup.");
  }
  return secret;
}

export function issueTmaSessionToken(user: TmaUser): string {
  return jwt.sign(
    {
      typ: TMA_TOKEN_TYP,
      telegramUserId: user.telegramUserId,
      name: user.name,
    } satisfies TmaJwtPayload,
    getJwtSecret(),
    { expiresIn: TMA_SESSION_TTL_SEC },
  );
}

export function verifyTmaSessionToken(token: string): TmaJwtPayload | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as TmaJwtPayload;
    if (payload.typ !== TMA_TOKEN_TYP || !payload.telegramUserId) return null;
    return payload;
  } catch {
    return null;
  }
}
