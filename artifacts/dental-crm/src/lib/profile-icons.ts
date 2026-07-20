/**
 * 3D icon assets for the Profile page, matching the Home/Services icon style.
 * Files live in /public/icons/profile/*.png (compressed ~128×128 pastels).
 */
export const PROFILE_ICONS = {
  profile: "/icons/profile/profile.png",
  email: "/icons/profile/email.png",
  password: "/icons/profile/password.png",
  language: "/icons/profile/language.png",
  aiCredits: "/icons/profile/ai-credits.png",
  logs: "/icons/profile/logs.png",
  security: "/icons/profile/security.png",
  fingerprint: "/icons/profile/fingerprint.png",
  notifications: "/icons/profile/notifications.png",
  logout: "/icons/profile/logout.png",
  salary: "/icons/menu/financials.png",
} as const;

/** Warm browser/HTTP cache so Profile rows don't paint empty circles. */
export function prefetchProfileIcons() {
  if (typeof window === "undefined") return;
  for (const src of Object.values(PROFILE_ICONS)) {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
  }
}

/** Unified card look shared with the Home & Services pages. */
export const PROFILE_CARD_CLASS =
  "rounded-[20px] border-[#e8e3d9] shadow-[0_1px_2px_rgba(15,23,42,0.03)]";
