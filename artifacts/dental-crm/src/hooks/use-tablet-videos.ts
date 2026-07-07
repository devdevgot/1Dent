import { useQuery } from "@tanstack/react-query";
import { fetchTabletVideos, type TabletVideoItem } from "@/lib/tablet-videos-api";
import { VIDEOS, type TreatmentVideo, type ToothCondition } from "@/pages/slash-tablet/mock-data";

export type { TabletVideoItem };

function mockToItem(v: TreatmentVideo): TabletVideoItem {
  return {
    id: v.id,
    title: v.title,
    category: v.category,
    duration: v.duration,
    relatedConditions: v.relatedConditions,
    videoUrl: "",
    section: "general",
    sectionLabel: v.category,
  };
}

export function useTabletVideos() {
  return useQuery({
    queryKey: ["tablet-videos"],
    queryFn: () => fetchTabletVideos(),
    staleTime: 60_000,
    select: (videos) => (videos.length > 0 ? videos : VIDEOS.map(mockToItem)),
  });
}

export function filterVideosByCondition(
  videos: TabletVideoItem[],
  condition: ToothCondition | null,
): TabletVideoItem[] {
  if (!condition) return videos;
  return videos.filter((v) => v.relatedConditions.includes(condition));
}

export function groupVideosByCategory(videos: TabletVideoItem[]): Map<string, TabletVideoItem[]> {
  const map = new Map<string, TabletVideoItem[]>();
  for (const v of videos) {
    const key = v.category || v.sectionLabel;
    const list = map.get(key) ?? [];
    list.push(v);
    map.set(key, list);
  }
  return map;
}
