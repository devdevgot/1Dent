/**
 * 3D icon assets for the Profile page, matching the Home/Services icon style.
 * Files live in /public/icons/profile/*.png (512×512, pastel squircle renders).
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

/** Unified card look shared with the Home & Services pages. */
export const PROFILE_CARD_CLASS =
  "rounded-[20px] border-[#e8e3d9] shadow-[0_1px_2px_rgba(15,23,42,0.03)]";
