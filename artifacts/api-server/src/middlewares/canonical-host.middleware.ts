import type { RequestHandler } from "express";
import { buildCanonicalRedirectUrl } from "../shared/canonical-host";

/** Permanent redirect from apex domain (1dent.kz) to the canonical www host. */
export const canonicalHostMiddleware: RequestHandler = (req, res, next) => {
  const redirectUrl = buildCanonicalRedirectUrl(req.hostname, req.originalUrl, {
    protocol: req.get("x-forwarded-proto") ?? req.protocol,
  });
  if (!redirectUrl) {
    next();
    return;
  }
  res.redirect(301, redirectUrl);
};
