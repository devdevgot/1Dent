import { boolean, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const tabletVideoSectionEnum = pgEnum("tablet_video_section", [
  "cavity",
  "root_canal",
  "hygiene",
  "crown",
  "implant",
  "extraction_needed",
  "treated",
  "general",
]);

export const tabletVideosTable = pgTable("tablet_videos", {
  id: text("id").primaryKey(),
  section: tabletVideoSectionEnum("section").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull().default("video/mp4"),
  durationSec: integer("duration_sec"),
  fileSize: integer("file_size"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TabletVideo = typeof tabletVideosTable.$inferSelect;
export type TabletVideoSection = TabletVideo["section"];
