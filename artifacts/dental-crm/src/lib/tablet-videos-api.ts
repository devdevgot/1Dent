export interface TabletVideoItem {
  id: string;
  title: string;
  category: string;
  duration: string;
  relatedConditions: string[];
  videoUrl: string;
  section: string;
  sectionLabel: string;
}

export async function fetchTabletVideos(section?: string): Promise<TabletVideoItem[]> {
  const qs = section ? `?section=${encodeURIComponent(section)}` : "";
  const res = await fetch(`/api/tablet/public/videos${qs}`);
  if (!res.ok) {
    throw new Error(`Failed to load tablet videos: ${res.status}`);
  }
  const json = (await res.json()) as {
    success: boolean;
    data: { videos: TabletVideoItem[] };
  };
  return json.data?.videos ?? [];
}
