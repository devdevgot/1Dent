import { AppIcon } from "@/components/ui/app-icon";

/**
 * 3D app-style icon used across the Profile page rows.
 * Mirrors the icon language of the Home (dashboard) and Services (menu) pages.
 */
export function SettingsRowIcon({
  img,
  className,
}: {
  img: string;
  className?: string;
}) {
  return <AppIcon src={img} size="md" eager className={className} />;
}
