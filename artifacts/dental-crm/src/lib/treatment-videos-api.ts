import { useQuery } from "@tanstack/react-query";
import { getBaseUrl } from "@/lib/base-url";
import type { ToothCondition } from "@/pages/slash-tablet/mock-data";

export interface TreatmentVideo {
  id: string;
  clinicId: string | null;
  title: string;
  category: string;
  storageKey: string;
  thumbnailKey: string | null;
  duration: string;
  durationSec: number | null;
  relatedConditions: ToothCondition[];
  isActive: boolean;
  sortOrder: number;
  playbackUrl: string;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

function getToken() {
  return localStorage.getItem("auth_token") ?? "";
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function fetchTreatmentVideos(params?: {
  category?: string;
  condition?: string;
}): Promise<TreatmentVideo[]> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set("category", params.category);
  if (params?.condition) qs.set("condition", params.condition);
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await apiFetch<{ success: boolean; data: { videos: TreatmentVideo[] } }>(
    `/api/videos${suffix}`,
  );
  return res.data.videos;
}

export async function fetchVideoPlayUrl(videoId: string): Promise<string> {
  const res = await apiFetch<{ success: boolean; data: { url: string } }>(
    `/api/videos/${videoId}/play-url`,
  );
  return res.data.url;
}

export async function createTreatmentVideo(body: {
  objectPath: string;
  title: string;
  category: string;
  relatedConditions: string[];
  durationSec?: number;
  isGlobal?: boolean;
  visibility?: "public" | "private";
}): Promise<TreatmentVideo> {
  const res = await apiFetch<{ success: boolean; data: { video: TreatmentVideo } }>(
    "/api/videos",
    { method: "POST", body: JSON.stringify(body) },
  );
  return res.data.video;
}

export async function deleteTreatmentVideo(id: string): Promise<void> {
  await apiFetch(`/api/videos/${id}`, { method: "DELETE" });
}

export const VIDEO_CATEGORIES = [
  "Эндодонтия",
  "Терапия",
  "Хирургия",
  "Ортопедия",
  "Профилактика",
  "Ортодонтия",
  "Имплантация",
] as const;

export function useTreatmentVideos(params?: { category?: string; condition?: string }) {
  return useQuery({
    queryKey: ["treatment-videos", params?.category, params?.condition],
    queryFn: () => fetchTreatmentVideos(params),
    staleTime: 60_000,
  });
}
