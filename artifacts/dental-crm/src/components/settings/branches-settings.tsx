import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Plus, Trash2, Loader2, Send, CheckCircle2, Bot, Navigation, Search, X, Pencil, ExternalLink, Unlink, Download, LogIn, LogOut, ChevronLeft, ChevronRight, ClipboardList, FileSpreadsheet, FileText, Users, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getBaseUrl } from "@/lib/base-url";
import { ListRowsSkeleton } from "@/components/skeletons";

interface Branch {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

interface TelegramSettings {
  telegramBotToken: string | null;
  telegramOwnerChatId: string | null;
  telegramPlatformChatId: string | null;
  telegramConnectToken: string | null;
}

declare global {
  interface Window {
    ymaps: {
      ready: (fn: () => void) => void;
      Map: new (el: HTMLElement, opts: object) => YMap;
      Placemark: new (coords: number[], props: object, opts: object) => YPlacemark;
      Circle: new (coords: [number[], number], props: object, opts: object) => YCircle;
      GeoObjectCollection: new () => YCollection;
      geocode: (query: string, opts?: object) => Promise<{
        geoObjects: {
          get: (i: number) => { geometry: { getCoordinates: () => number[] }; properties: { get: (k: string) => string } } | null;
          getLength: () => number;
        };
      }>;
    };
    _ymapsLoaded?: boolean;
  }
}

interface YMap {
  geoObjects: { add: (obj: unknown) => void; remove: (obj: unknown) => void; removeAll: () => void };
  events: { add: (event: string, fn: (e: { get: (k: string) => number[] }) => void) => void };
  setCenter: (coords: number[], zoom?: number) => void;
  destroy: () => void;
}
interface YPlacemark { geometry: { getCoordinates: () => number[] }; options: { set: (k: string, v: unknown) => void } }
interface YCircle { geometry: { getCoordinates: () => [number[], number] } }
interface YCollection { add: (obj: unknown) => void }

function getToken() {
  return localStorage.getItem("auth_token");
}

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ success: boolean; data: Record<string, unknown> }>;
}

function loadYandexMaps(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window._ymapsLoaded) { resolve(); return; }
    const script = document.createElement("script");
    const key = apiKey ? `&apikey=${apiKey}` : "";
    script.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU${key}`;
    script.async = true;
    script.onload = () => {
      window._ymapsLoaded = true;
      window.ymaps.ready(resolve);
    };
    script.onerror = () => reject(new Error("Failed to load Yandex Maps"));
    document.head.appendChild(script);
  });
}

const RADIUS_PRESETS = [
  { label: "50 м", value: 50 },
  { label: "100 м", value: 100 },
  { label: "200 м", value: 200 },
  { label: "500 м", value: 500 },
  { label: "1 км", value: 1000 },
];

export function BranchesSettings() {
  const { toast } = useToast();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [branchSearch, setBranchSearch] = useState("");

  const [tgToken, setTgToken] = useState("");
  const [tgChatId, setTgChatId] = useState("");
  const [savingTg, setSavingTg] = useState(false);
  const [testingTg, setTestingTg] = useState(false);
  const [tgSaved, setTgSaved] = useState(false);
  const [tgPlatformChatId, setTgPlatformChatId] = useState<string | null>(null);
  const [connectingPlatform, setConnectingPlatform] = useState(false);
  const [testingPlatform, setTestingPlatform] = useState(false);
  const [disconnectingPlatform, setDisconnectingPlatform] = useState(false);

  // ── Tracking table state ──────────────────────────────────────────────────
  type GeoEvent = { id: string; eventType: "checkin" | "checkout"; occurredAt: string; branchId: string; branchName: string; userId: string; userName: string };

  // ── Branch journal modal state ────────────────────────────────────────────
  const [journalBranch, setJournalBranch] = useState<Branch | null>(null);
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [journalFrom, setJournalFrom] = useState(monthStart);
  const [journalTo, setJournalTo] = useState(todayStr);
  const [journalEmployee, setJournalEmployee] = useState("all");
  const [journalEvents, setJournalEvents] = useState<GeoEvent[]>([]);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalFiltersOpen, setJournalFiltersOpen] = useState(false);
  const [trackingDate, setTrackingDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [trackingBranchId, setTrackingBranchId] = useState<string>("all");
  const [trackingEvents, setTrackingEvents] = useState<GeoEvent[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(false);

  const yandexApiKey = import.meta.env.VITE_YANDEX_MAPS_API_KEY as string | undefined ?? "";

  // ── Modal state ──────────────────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const ymapRef = useRef<YMap | null>(null);
  const pendingMarkerRef = useRef<YPlacemark | null>(null);

  const [modalMapReady, setModalMapReady] = useState(false);
  const [modalMapError, setModalMapError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [myLocation, setMyLocation] = useState<{ lat: number; lon: number } | null>(null);

  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [newName, setNewName] = useState("");
  const [newRadius, setNewRadius] = useState(200);
  const [customRadius, setCustomRadius] = useState("");
  const [useCustomRadius, setUseCustomRadius] = useState(false);
  const [saving, setSaving] = useState(false);

  const [mapQuery, setMapQuery] = useState("");
  const [mapGeoResults, setMapGeoResults] = useState<{ name: string; coords: number[] }[]>([]);
  const [mapSearching, setMapSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const geoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data loading ─────────────────────────────────────────────────────────
  const loadBranches = useCallback(async () => {
    try {
      const res = await apiFetch("/api/branches");
      setBranches((res.data as { branches: Branch[] }).branches ?? []);
    } catch {
      toast({ title: "Не удалось загрузить филиалы", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadTgSettings = useCallback(async () => {
    try {
      const res = await apiFetch("/api/clinic/telegram-settings");
      const d = res.data as TelegramSettings;
      setTgToken(d.telegramBotToken ?? "");
      setTgChatId(d.telegramOwnerChatId ?? "");
      setTgPlatformChatId(d.telegramPlatformChatId ?? null);
    } catch { /* ignore */ }
  }, []);

  const loadTracking = useCallback(async (date: string, branchId: string) => {
    setTrackingLoading(true);
    try {
      const dateFrom = `${date}T00:00:00`;
      const dateTo = `${date}T23:59:59`;
      const params = new URLSearchParams({ dateFrom, dateTo });
      if (branchId !== "all") params.set("branchId", branchId);
      const res = await apiFetch(`/api/geo/tracking?${params.toString()}`);
      setTrackingEvents((res.data as { events: GeoEvent[] }).events);
    } catch { setTrackingEvents([]); }
    finally { setTrackingLoading(false); }
  }, []);

  useEffect(() => { void loadTracking(trackingDate, trackingBranchId); }, [trackingDate, trackingBranchId, loadTracking]);

  const shiftDate = (days: number) => {
    const d = new Date(trackingDate);
    d.setDate(d.getDate() + days);
    setTrackingDate(d.toISOString().slice(0, 10));
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Almaty" });

  const downloadCSV = (branchIdFilter: string) => {
    const events = branchIdFilter === "all"
      ? trackingEvents
      : trackingEvents.filter(e => e.branchId === branchIdFilter);
    if (!events.length) return;

    const branchName = branchIdFilter === "all"
      ? "Все филиалы"
      : (branches.find(b => b.id === branchIdFilter)?.name ?? branchIdFilter);

    const header = "Сотрудник,Тип,Филиал,Время";
    const rows = events.map(e => {
      const type = e.eventType === "checkin" ? "Приход" : "Уход";
      const time = formatTime(e.occurredAt);
      return `"${e.userName}","${type}","${e.branchName}","${time}"`;
    });
    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tracking_${branchName}_${trackingDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadJournal = useCallback(async (branch: Branch, from: string, to: string) => {
    setJournalLoading(true);
    try {
      const params = new URLSearchParams({
        branchId: branch.id,
        dateFrom: `${from}T00:00:00`,
        dateTo: `${to}T23:59:59`,
      });
      const res = await apiFetch(`/api/geo/tracking?${params.toString()}`);
      setJournalEvents((res.data as { events: GeoEvent[] }).events);
    } catch { setJournalEvents([]); }
    finally { setJournalLoading(false); }
  }, []);

  const openJournal = useCallback((b: Branch) => {
    const today = new Date().toISOString().slice(0, 10);
    const mStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    setJournalBranch(b);
    setJournalFrom(mStart);
    setJournalTo(today);
    setJournalEmployee("all");
    void loadJournal(b, mStart, today);
  }, [loadJournal]);

  useEffect(() => {
    if (journalBranch) void loadJournal(journalBranch, journalFrom, journalTo);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journalFrom, journalTo]);

  const journalPresets = [
    { label: "Сегодня", from: todayStr, to: todayStr },
    { label: "Вчера", from: new Date(Date.now() - 86400000).toISOString().slice(0, 10), to: new Date(Date.now() - 86400000).toISOString().slice(0, 10) },
    { label: "Эта неделя", from: (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().slice(0, 10); })(), to: todayStr },
    { label: "Этот месяц", from: monthStart, to: todayStr },
    { label: "Прошлый месяц", from: (() => { const d = new Date(); d.setMonth(d.getMonth() - 1, 1); return d.toISOString().slice(0, 10); })(), to: (() => { const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 10); })() },
  ];

  const journalFiltered = journalEmployee === "all"
    ? journalEvents
    : journalEvents.filter(e => e.userId === journalEmployee);

  const journalStaff = [...new Map(journalEvents.map(e => [e.userId, { id: e.userId, name: e.userName }])).values()];

  const exportJournalCSV = () => {
    if (!journalFiltered.length || !journalBranch) return;
    const header = "Сотрудник,Событие,Дата,Время";
    const rows = journalFiltered.map(e => {
      const d = new Date(e.occurredAt);
      const date = d.toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty" });
      const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" });
      const type = e.eventType === "checkin" ? "Приход" : "Уход";
      return `"${e.userName}","${type}","${date}","${time}"`;
    });
    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" })),
      download: `tracking_${journalBranch.name}_${journalFrom}_${journalTo}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportJournalPDF = () => {
    if (!journalFiltered.length || !journalBranch) return;
    const rows = journalFiltered.map(e => {
      const d = new Date(e.occurredAt);
      const date = d.toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty" });
      const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" });
      const type = e.eventType === "checkin" ? "Приход" : "Уход";
      const color = e.eventType === "checkin" ? "#15803d" : "#c2410c";
      return `<tr><td>${e.userName}</td><td style="color:${color};font-weight:600">${type}</td><td>${date}</td><td>${time}</td></tr>`;
    }).join("");
    const checkins = journalFiltered.filter(e => e.eventType === "checkin").length;
    const checkouts = journalFiltered.filter(e => e.eventType === "checkout").length;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Журнал — ${journalBranch.name}</title>
<style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;padding:24px;color:#111}
h1{font-size:18px;margin:0 0 4px}p.sub{margin:0 0 16px;color:#666;font-size:11px}
.stats{display:flex;gap:16px;margin-bottom:16px}.stat{background:#f5f5f5;border-radius:8px;padding:8px 16px;text-align:center}
.stat b{display:block;font-size:20px}.stat span{font-size:10px;color:#888}
table{width:100%;border-collapse:collapse}th{background:#f0f0f0;text-align:left;padding:7px 10px;border:1px solid #ddd;font-size:11px}
td{padding:7px 10px;border:1px solid #eee}tr:nth-child(even) td{background:#fafafa}
@media print{body{padding:12px}}</style></head><body>
<h1>Журнал трекинга — ${journalBranch.name}</h1>
<p class="sub">Период: ${journalFrom} — ${journalTo}${journalEmployee !== "all" ? ` · Сотрудник: ${journalStaff.find(s => s.id === journalEmployee)?.name ?? ""}` : ""}</p>
<div class="stats">
  <div class="stat"><b>${journalFiltered.length}</b><span>событий</span></div>
  <div class="stat"><b style="color:#15803d">${checkins}</b><span>приходов</span></div>
  <div class="stat"><b style="color:#c2410c">${checkouts}</b><span>уходов</span></div>
</div>
<table><thead><tr><th>Сотрудник</th><th>Событие</th><th>Дата</th><th>Время</th></tr></thead>
<tbody>${rows}</tbody></table></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); }
  };

  const handleConnectPlatform = async () => {
    setConnectingPlatform(true);
    try {
      const res = await apiFetch("/api/clinic/telegram-connect/generate", { method: "POST" });
      const { deepLink } = res.data as { deepLink: string };
      window.open(deepLink, "_blank");
      // Poll for connection every 3 seconds for up to 2 minutes
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const r = await apiFetch("/api/clinic/telegram-settings");
          const d = r.data as TelegramSettings;
          if (d.telegramPlatformChatId) {
            setTgPlatformChatId(d.telegramPlatformChatId);
            clearInterval(poll);
            setConnectingPlatform(false);
            toast({ title: "Telegram подключён!", description: "Теперь вы будете получать уведомления в Telegram" });
          }
        } catch { /* ignore */ }
        if (attempts >= 40) { clearInterval(poll); setConnectingPlatform(false); }
      }, 3000);
    } catch (err) {
      toast({ title: "Ошибка", description: String(err), variant: "destructive" });
      setConnectingPlatform(false);
    }
  };

  const handleTestPlatform = async () => {
    setTestingPlatform(true);
    try {
      await apiFetch("/api/clinic/telegram-platform-test", { method: "POST" });
      toast({ title: "Тест отправлен!", description: "Проверьте Telegram — вы должны получить сообщение" });
    } catch (err) {
      toast({ title: "Ошибка", description: String(err), variant: "destructive" });
    } finally {
      setTestingPlatform(false);
    }
  };

  const handleDisconnectPlatform = async () => {
    setDisconnectingPlatform(true);
    try {
      await apiFetch("/api/clinic/telegram-platform-disconnect", { method: "DELETE" });
      setTgPlatformChatId(null);
      toast({ title: "Telegram отключён" });
    } catch (err) {
      toast({ title: "Ошибка", description: String(err), variant: "destructive" });
    } finally {
      setDisconnectingPlatform(false);
    }
  };

  useEffect(() => { void loadBranches(); void loadTgSettings(); }, [loadBranches, loadTgSettings]);

  // ── Modal map init ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isModalOpen) return;
    let destroyed = false;

    // Small delay to let the dialog DOM render
    const timer = setTimeout(() => {
      if (!mapRef.current) return;

      loadYandexMaps(yandexApiKey)
        .then(() => {
          if (destroyed || !mapRef.current) return;

          const editingB = editingBranch;
          const center = editingB
            ? [editingB.latitude, editingB.longitude]
            : branches.length
            ? [branches[0]!.latitude, branches[0]!.longitude]
            : [51.18, 71.446];

          const map = new window.ymaps.Map(mapRef.current, {
            center,
            zoom: editingB ? 16 : 14,
            controls: ["zoomControl"],
          });
          ymapRef.current = map;

          // Pre-place marker for branch being edited
          if (editingB) {
            const marker = new window.ymaps.Placemark(
              [editingB.latitude, editingB.longitude],
              { balloonContent: editingB.name },
              { preset: "islands#redDotIcon" },
            );
            map.geoObjects.add(marker);
            pendingMarkerRef.current = marker;
          }

          // Draw existing branches
          for (const b of branches) {
            const col = new window.ymaps.GeoObjectCollection();
            col.add(new window.ymaps.Placemark(
              [b.latitude, b.longitude],
              { balloonContent: `<b>${b.name}</b><br>Радиус: ${b.radiusMeters}м` },
              { preset: "islands#blueMedicalIcon" },
            ));
            col.add(new window.ymaps.Circle(
              [[b.latitude, b.longitude], b.radiusMeters],
              {},
              { fillColor: "#3B82F620", strokeColor: "#3B82F6", strokeWidth: 2 },
            ));
            map.geoObjects.add(col);
          }

          setModalMapReady(true);

          // Auto-locate device
          if (navigator.geolocation) {
            setLocating(true);
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                if (destroyed) return;
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                if (!branches.length) map.setCenter([lat, lon], 15);
                map.geoObjects.add(new window.ymaps.Placemark(
                  [lat, lon],
                  { balloonContent: "Вы здесь" },
                  { preset: "islands#blueCircleDotIcon" },
                ));
                setMyLocation({ lat, lon });
                setLocating(false);
              },
              () => setLocating(false),
              { timeout: 8000, maximumAge: 60000 },
            );
          }

          // Click to place marker
          map.events.add("click", (e) => {
            const coords = e.get("coords");
            if (pendingMarkerRef.current) {
              map.geoObjects.remove(pendingMarkerRef.current);
              pendingMarkerRef.current = null;
            }
            const marker = new window.ymaps.Placemark(
              [coords[0]!, coords[1]!],
              { balloonContent: "Новый филиал" },
              { preset: "islands#redDotIcon" },
            );
            map.geoObjects.add(marker);
            pendingMarkerRef.current = marker;
            setPendingCoords({ lat: coords[0]!, lon: coords[1]! });
            setNewName("");
          });
        })
        .catch(() => {
          if (!destroyed) setModalMapError("Не удалось загрузить Яндекс Карты.");
        });
    }, 150);

    return () => {
      destroyed = true;
      clearTimeout(timer);
      if (ymapRef.current) {
        try { ymapRef.current.destroy(); } catch { /* ignore */ }
        ymapRef.current = null;
      }
      setModalMapReady(false);
      setModalMapError(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen]);

  // ── Geo search ───────────────────────────────────────────────────────────
  const handleMapSearch = useCallback((q: string) => {
    setMapQuery(q);
    setSearchDone(false);
    setMapGeoResults([]);
    if (geoDebounceRef.current) clearTimeout(geoDebounceRef.current);
    if (!q.trim()) return;
    geoDebounceRef.current = setTimeout(async () => {
      setMapSearching(true);
      try {
        const resp = await fetch(`${getBaseUrl()}/api/geo/search?q=${encodeURIComponent(q)}`);
        if (!resp.ok) throw new Error("geocode failed");
        const data = await resp.json() as { success: boolean; data: { results: { name: string; coords: number[] }[] } };
        setMapGeoResults(data.data.results);
      } catch { setMapGeoResults([]); }
      finally { setMapSearching(false); setSearchDone(true); }
    }, 400);
  }, []);

  // ── Open edit modal ──────────────────────────────────────────────────────
  const openEditModal = useCallback((branch: Branch) => {
    setEditingBranch(branch);
    setNewName(branch.name);
    const preset = RADIUS_PRESETS.find((p) => p.value === branch.radiusMeters);
    if (preset) {
      setNewRadius(branch.radiusMeters);
      setUseCustomRadius(false);
    } else {
      setCustomRadius(String(branch.radiusMeters));
      setUseCustomRadius(true);
    }
    setPendingCoords({ lat: branch.latitude, lon: branch.longitude });
    setIsModalOpen(true);
  }, []);

  // ── Close / reset modal ──────────────────────────────────────────────────
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingBranch(null);
    setPendingCoords(null);
    setNewName("");
    setNewRadius(200);
    setCustomRadius("");
    setUseCustomRadius(false);
    setMyLocation(null);
    setMapQuery("");
    setMapGeoResults([]);
    setConfirmingDelete(false);
    if (pendingMarkerRef.current && ymapRef.current) {
      try { ymapRef.current.geoObjects.remove(pendingMarkerRef.current); } catch { /* ignore */ }
      pendingMarkerRef.current = null;
    }
  }, []);

  // ── Save branch (create or update) ───────────────────────────────────────
  const handleSaveBranch = async () => {
    if (!pendingCoords || !newName.trim()) return;
    const radius = useCustomRadius
      ? Math.max(10, Math.min(50000, parseInt(customRadius) || 200))
      : newRadius;
    setSaving(true);
    try {
      if (editingBranch) {
        await apiFetch(`/api/branches/${editingBranch.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: newName.trim(),
            latitude: pendingCoords.lat,
            longitude: pendingCoords.lon,
            radiusMeters: radius,
          }),
        });
        await loadBranches();
        closeModal();
        toast({ title: "Филиал обновлён" });
      } else {
        await apiFetch("/api/branches", {
          method: "POST",
          body: JSON.stringify({
            name: newName.trim(),
            latitude: pendingCoords.lat,
            longitude: pendingCoords.lon,
            radiusMeters: radius,
          }),
        });
        await loadBranches();
        closeModal();
        toast({ title: "Филиал добавлен" });
      }
    } catch {
      toast({ title: editingBranch ? "Ошибка при обновлении" : "Ошибка при добавлении", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Delete branch ────────────────────────────────────────────────────────
  const handleDeleteBranch = async (id: string) => {
    setDeletingId(id);
    try {
      await apiFetch(`/api/branches/${id}`, { method: "DELETE" });
      await loadBranches();
      toast({ title: "Филиал удалён" });
    } catch {
      toast({ title: "Ошибка при удалении", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  // ── Telegram ─────────────────────────────────────────────────────────────
  const handleSaveTg = async () => {
    setSavingTg(true);
    try {
      await apiFetch("/api/clinic/telegram-settings", {
        method: "PUT",
        body: JSON.stringify({
          telegramBotToken: tgToken.trim() || null,
          telegramOwnerChatId: tgChatId.trim() || null,
        }),
      });
      setTgSaved(true);
      setTimeout(() => setTgSaved(false), 2500);
      toast({ title: "Telegram настроен" });
    } catch {
      toast({ title: "Ошибка сохранения Telegram", variant: "destructive" });
    } finally {
      setSavingTg(false);
    }
  };

  const handleTestTg = async () => {
    if (!tgToken.trim() || !tgChatId.trim()) {
      toast({ title: "Введите токен и Chat ID", variant: "destructive" });
      return;
    }
    setTestingTg(true);
    try {
      await apiFetch("/api/clinic/telegram-test", {
        method: "POST",
        body: JSON.stringify({
          telegramBotToken: tgToken.trim(),
          telegramOwnerChatId: tgChatId.trim(),
        }),
      });
      toast({ title: "Тестовое сообщение отправлено ✅" });
    } catch {
      toast({ title: "Не удалось отправить. Проверьте токен и Chat ID.", variant: "destructive" });
    } finally {
      setTestingTg(false);
    }
  };

  const effectiveRadius = useCustomRadius
    ? (parseInt(customRadius) || 0)
    : newRadius;

  return (
    <div className="space-y-5">

      {/* ── Branches card ─────────────────────────────────────────────── */}
      <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--ds-border)]">
          <div className="flex-1">
            <h2 className="font-semibold text-base text-[var(--text)]">Филиалы и геозоны</h2>
            <p className="text-caption text-[var(--text-secondary)] mt-0.5">
              {branches.length > 0 ? `${branches.length} филиал${branches.length === 1 ? "" : branches.length < 5 ? "а" : "ов"}` : "Нет добавленных филиалов"}
            </p>
          </div>
          <Button
            className="gap-1.5 h-8 text-caption px-2.5 sm:px-3"
            onClick={() => setIsModalOpen(true)}
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Новый филиал</span>
          </Button>
        </div>

        <div className="p-4 space-y-3">
          {/* Branch search autocomplete */}
          {branches.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)] pointer-events-none z-10" />
              <input
                type="text"
                placeholder="Поиск по филиалам…"
                value={branchSearch}
                onChange={(e) => setBranchSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] text-body focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/40"
              />
              {branchSearch.trim() && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-xl shadow-lg overflow-hidden">
                  {branches.filter((b) => b.name.toLowerCase().includes(branchSearch.toLowerCase())).length === 0 ? (
                    <div className="px-4 py-3 text-body text-[var(--text-secondary)] text-center">Ничего не найдено</div>
                  ) : (
                    branches
                      .filter((b) => b.name.toLowerCase().includes(branchSearch.toLowerCase()))
                      .map((b) => (
                        <button
                          key={b.id}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-2)] transition-colors text-left"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setBranchSearch("");
                          }}
                        >
                          <MapPin className="w-3.5 h-3.5 text-[var(--ds-primary)] shrink-0" />
                          <div className="min-w-0">
                            <p className="text-body font-medium text-[var(--text)] truncate">{b.name}</p>
                            <p className="text-caption text-[var(--text-secondary)]">{b.latitude.toFixed(4)}, {b.longitude.toFixed(4)} · {b.radiusMeters}м</p>
                          </div>
                        </button>
                      ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Branch list */}
          {loading && <ListRowsSkeleton rows={4} avatar={false} card />}
          {!loading && branches.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[var(--surface-2)] flex items-center justify-center">
                <MapPin className="w-6 h-6 text-[var(--text-secondary)]" />
              </div>
              <p className="text-body text-[var(--text-secondary)]">Нажмите «Новый филиал»,<br />чтобы добавить первый филиал</p>
            </div>
          )}
          <div className="space-y-2">
            {branches.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[var(--ds-surface)] border border-[var(--ds-border)]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <MapPin className="w-4 h-4 text-[var(--ds-primary)] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-body font-medium text-[var(--text)] truncate">{b.name}</p>
                    <p className="text-caption text-[var(--text-secondary)]">
                      {b.latitude.toFixed(4)}, {b.longitude.toFixed(4)} · {b.radiusMeters}м
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openJournal(b)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--ds-primary)] transition-colors"
                    title="Журнал трекинга"
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => openEditModal(b)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Add branch modal ───────────────────────────────────────────── */}
      <Dialog open={isModalOpen} onOpenChange={(open) => { if (!open) closeModal(); }}>
        <DialogContent className="max-w-lg w-full p-0 gap-0 overflow-hidden rounded-2xl">
          <DialogHeader className="px-5 py-4 border-b border-[var(--ds-border)] flex-row items-center gap-3 space-y-0">
            <MapPin className="w-5 h-5 text-[var(--ds-primary)] shrink-0" />
            <DialogTitle className="flex-1 text-base font-semibold">
              {editingBranch ? "Редактировать филиал" : "Новый филиал"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col max-h-[80vh] overflow-y-auto">
            {/* Address search */}
            <div className="px-4 pt-4 pb-2 relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)] pointer-events-none z-10" />
                {mapSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)] animate-spin z-10" />
                )}
                <input
                  type="text"
                  placeholder="Поиск адреса…"
                  value={mapQuery}
                  onChange={(e) => handleMapSearch(e.target.value)}
                  className="w-full h-10 pl-9 pr-8 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] text-body focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/40"
                />
                {mapQuery.trim() && (
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 text-[var(--text-secondary)] hover:text-[var(--text)]"
                    onMouseDown={(e) => { e.preventDefault(); setMapQuery(""); setMapGeoResults([]); }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {mapQuery.trim() && (mapGeoResults.length > 0 || (searchDone && !mapSearching)) && (
                <div className="absolute left-4 right-4 top-full z-50 bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-xl shadow-lg overflow-hidden">
                  {mapGeoResults.length === 0 ? (
                    <div className="px-4 py-3 text-body text-[var(--text-secondary)] text-center">Ничего не найдено</div>
                  ) : (
                    mapGeoResults.map((r, i) => (
                      <button
                        key={i}
                        className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-[var(--surface-2)] transition-colors text-left"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const [lat, lon] = r.coords as [number, number];
                          const map = ymapRef.current;
                          if (map && window.ymaps) {
                            // Remove previous pending marker
                            if (pendingMarkerRef.current) {
                              map.geoObjects.remove(pendingMarkerRef.current);
                              pendingMarkerRef.current = null;
                            }
                            // Place new marker and center map
                            const marker = new window.ymaps.Placemark(
                              [lat, lon],
                              { balloonContent: r.name },
                              { preset: "islands#redDotIcon" },
                            );
                            map.geoObjects.add(marker);
                            pendingMarkerRef.current = marker;
                            map.setCenter([lat, lon], 16);
                            setPendingCoords({ lat, lon });
                            setNewName("");
                          }
                          setMapQuery("");
                          setMapGeoResults([]);
                          setSearchDone(false);
                        }}
                      >
                        <MapPin className="w-3.5 h-3.5 text-[var(--ds-primary)] shrink-0 mt-0.5" />
                        <span className="text-body text-[var(--text)] leading-snug">{r.name}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Map */}
            <div className="relative mx-4 rounded-xl overflow-hidden border border-[var(--ds-border)]" style={{ height: 280 }}>
              {!modalMapReady && !modalMapError && (
                <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg)]">
                  <Loader2 className="w-6 h-6 text-[var(--ds-primary)] animate-spin" />
                </div>
              )}
              {modalMapError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg)] gap-2 p-4 text-center">
                  <MapPin className="w-8 h-8 text-[var(--text-subtle)]" />
                  <p className="text-body text-[var(--text-secondary)]">{modalMapError}</p>
                </div>
              )}
              <div ref={mapRef} className="w-full h-full" />
              {modalMapReady && !pendingCoords && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-caption px-3 py-1.5 rounded-full whitespace-nowrap pointer-events-none">
                  Нажмите на карту, чтобы выбрать точку
                </div>
              )}
            </div>

            {/* Location banner */}
            {locating && (
              <div className="mx-4 mt-2 flex items-center gap-2 text-caption text-[var(--text-secondary)]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Определяем местоположение…
              </div>
            )}
            {myLocation && !pendingCoords && (
              <div className="mx-4 mt-2 flex items-center gap-3 bg-[var(--info-light)] border border-[var(--info)]/30 rounded-xl px-4 py-2.5">
                <Navigation className="w-4 h-4 text-[var(--info)] shrink-0" />
                <p className="text-caption text-[var(--info)] flex-1">Вы здесь — нажмите сюда, чтобы добавить точку</p>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (pendingMarkerRef.current && ymapRef.current) {
                      ymapRef.current.geoObjects.remove(pendingMarkerRef.current);
                      pendingMarkerRef.current = null;
                    }
                    const marker = new window.ymaps.Placemark(
                      [myLocation.lat, myLocation.lon],
                      { balloonContent: "Новый филиал" },
                      { preset: "islands#redDotIcon" },
                    );
                    ymapRef.current?.geoObjects.add(marker);
                    pendingMarkerRef.current = marker;
                    setPendingCoords({ lat: myLocation.lat, lon: myLocation.lon });
                    setNewName("");
                  }}
                  className="shrink-0 text-caption font-semibold text-[var(--info)] bg-[var(--info-light)] hover:bg-[var(--info-light)] transition-colors px-3 py-1 rounded-lg"
                >
                  Да
                </button>
              </div>
            )}

            {/* Form — shown after point is selected */}
            {pendingCoords && (
              <div className="mx-4 mt-3 mb-4 space-y-3">
                <div className="flex items-center gap-2 text-caption text-[var(--text-secondary)] bg-[var(--surface-2)]/50 rounded-xl px-3 py-2">
                  <MapPin className="w-3.5 h-3.5 text-[var(--danger)] shrink-0" />
                  <span>Точка: {pendingCoords.lat.toFixed(5)}, {pendingCoords.lon.toFixed(5)}</span>
                  <button
                    className="ml-auto text-[var(--text-secondary)] hover:text-[var(--text)]"
                    onClick={() => {
                      if (pendingMarkerRef.current && ymapRef.current) {
                        ymapRef.current.geoObjects.remove(pendingMarkerRef.current);
                        pendingMarkerRef.current = null;
                      }
                      setPendingCoords(null);
                    }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="Название филиала"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full h-10 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 text-body focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/40"
                  autoFocus
                />

                {/* Radius presets */}
                <div className="space-y-2">
                  <p className="text-caption font-medium text-[var(--text-secondary)]">Радиус геозоны</p>
                  <div className="flex gap-2 flex-wrap">
                    {RADIUS_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => { setNewRadius(p.value); setUseCustomRadius(false); }}
                        className={cn(
                          "h-8 px-3 rounded-lg text-caption font-medium border transition-colors",
                          !useCustomRadius && newRadius === p.value
                            ? "bg-[var(--ds-primary)] text-white border-[var(--ds-primary)]"
                            : "bg-[var(--ds-surface)] text-[var(--text)] border-[var(--ds-border)] hover:border-[var(--ds-primary)]/50",
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                    <button
                      onClick={() => setUseCustomRadius(true)}
                      className={cn(
                        "h-8 px-3 rounded-lg text-caption font-medium border transition-colors",
                        useCustomRadius
                          ? "bg-[var(--ds-primary)] text-white border-[var(--ds-primary)]"
                          : "bg-[var(--ds-surface)] text-[var(--text)] border-[var(--ds-border)] hover:border-[var(--ds-primary)]/50",
                      )}
                    >
                      Другой
                    </button>
                  </div>
                  {useCustomRadius && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={10}
                        max={50000}
                        placeholder="Введите метры"
                        value={customRadius}
                        onChange={(e) => setCustomRadius(e.target.value)}
                        className="w-full h-10 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 text-body focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/40"
                        autoFocus
                      />
                      <span className="text-body text-[var(--text-secondary)] whitespace-nowrap shrink-0">м</span>
                    </div>
                  )}
                  {effectiveRadius > 0 && (
                    <p className="text-caption text-[var(--text-secondary)]">
                      Зона: <span className="font-medium text-[var(--text)]">
                        {effectiveRadius >= 1000 ? `${(effectiveRadius / 1000).toFixed(1)} км` : `${effectiveRadius} м`}
                      </span>
                    </p>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void handleSaveBranch()}
                    disabled={saving || !newName.trim() || (useCustomRadius && !customRadius.trim())}
                    className="dash-btn dash-btn-primary flex-1 h-10 gap-2"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingBranch ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {editingBranch ? "Сохранить изменения" : "Добавить филиал"}
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="dash-btn dash-btn-secondary px-4 h-10"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}

            {/* Padding when no form */}
            {!pendingCoords && <div className="pb-4" />}

            {/* Delete section — only for existing branches */}
            {editingBranch && (
              <div className="mx-4 mb-4 mt-1">
                {!confirmingDelete ? (
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    className="w-full flex items-center justify-center gap-2 h-9 rounded-xl border border-[var(--danger)]/30 text-body text-[var(--danger)] hover:bg-[var(--danger-light)] transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Удалить филиал
                  </button>
                ) : (
                  <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-light)] p-3.5 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <Trash2 className="w-4 h-4 text-[var(--danger)] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-body font-semibold text-[var(--danger)]">Удалить филиал?</p>
                        <p className="text-caption text-[var(--danger)] mt-0.5 leading-relaxed">
                          Все данные трекинга по этому филиалу тоже будут удалены. Это действие нельзя отменить.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          void handleDeleteBranch(editingBranch.id).then(() => closeModal());
                        }}
                        disabled={deletingId === editingBranch.id}
                        className="flex-1 h-9 rounded-xl bg-[var(--danger)] text-white text-body font-semibold flex items-center justify-center gap-1.5 hover:opacity-90 transition-colors disabled:opacity-60"
                      >
                        {deletingId === editingBranch.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                        Да, удалить
                      </button>
                      <button
                        onClick={() => setConfirmingDelete(false)}
                        disabled={deletingId === editingBranch.id}
                        className="px-4 h-9 rounded-xl border border-[var(--danger)]/30 text-body text-[var(--danger)] bg-[var(--ds-surface)] hover:bg-[var(--danger-light)] transition-colors disabled:opacity-60"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Branch journal modal ──────────────────────────────────────── */}
      <Dialog open={!!journalBranch} onOpenChange={(open) => { if (!open) { setJournalBranch(null); setJournalEvents([]); setJournalEmployee("all"); setJournalFiltersOpen(false); } }}>
        <DialogContent className="max-w-2xl w-full p-0 gap-0 overflow-hidden rounded-2xl flex flex-col max-h-[90vh]">
          <DialogHeader className="px-5 py-4 border-b border-[var(--ds-border)] flex-row items-center gap-3 space-y-0 shrink-0">
            <ClipboardList className="w-5 h-5 text-[var(--ds-primary)] shrink-0" />
            <DialogTitle className="flex-1 text-base font-semibold">
              Журнал трекинга — {journalBranch?.name}
            </DialogTitle>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setJournalFiltersOpen(v => !v)}
                className={cn(
                  "relative w-8 h-8 flex items-center justify-center rounded-lg border transition-colors",
                  journalFiltersOpen
                    ? "border-[var(--ds-primary)]/50 bg-[var(--primary-light)] text-[var(--ds-primary)]"
                    : "border-[var(--ds-border)] text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
                )}
                title="Фильтры"
              >
                <Filter className="w-3.5 h-3.5" />
                {(journalEmployee !== "all" || journalFrom !== monthStart || journalTo !== todayStr) && !journalFiltersOpen && (
                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[var(--ds-primary)]" />
                )}
              </button>
              {journalFiltered.length > 0 && (
                <>
                  <button
                    onClick={exportJournalCSV}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-[var(--ds-border)] text-caption text-[var(--text-secondary)] hover:border-[var(--success)] hover:text-[var(--success)] transition-colors"
                    title="Скачать Excel (CSV)"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Excel
                  </button>
                  <button
                    onClick={exportJournalPDF}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-[var(--ds-border)] text-caption text-[var(--text-secondary)] hover:border-[var(--danger)] hover:text-[var(--danger)] transition-colors"
                    title="Открыть для печати / PDF"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    PDF
                  </button>
                </>
              )}
            </div>
          </DialogHeader>

          {/* Filters — collapsible */}
          {journalFiltersOpen && <div className="px-5 py-3 border-b border-[var(--ds-border)] space-y-2.5 shrink-0">
            {/* Quick presets */}
            <div className="flex gap-1.5 flex-wrap">
              {journalPresets.map(p => (
                <button
                  key={p.label}
                  onClick={() => { setJournalFrom(p.from); setJournalTo(p.to); }}
                  className={cn(
                    "h-7 px-3 rounded-full text-caption font-medium transition-all",
                    journalFrom === p.from && journalTo === p.to
                      ? "bg-[var(--text)] text-white"
                      : "bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text)]",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Date range + employee */}
            <div className="flex gap-2 flex-wrap items-center">
              <div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
                <input
                  type="date"
                  value={journalFrom}
                  max={journalTo}
                  onChange={e => setJournalFrom(e.target.value)}
                  className="flex-1 h-8 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] px-2 text-caption text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/40"
                />
                <span className="text-caption text-[var(--text-secondary)]">—</span>
                <input
                  type="date"
                  value={journalTo}
                  min={journalFrom}
                  max={todayStr}
                  onChange={e => setJournalTo(e.target.value)}
                  className="flex-1 h-8 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] px-2 text-caption text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/40"
                />
              </div>
              {journalStaff.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
                  <select
                    value={journalEmployee}
                    onChange={e => setJournalEmployee(e.target.value)}
                    className="h-8 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] px-2 text-caption text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/40 min-w-[140px]"
                  >
                    <option value="all">Все сотрудники</option>
                    {journalStaff.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>}

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {journalLoading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-[var(--text-secondary)]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Загрузка…</span>
              </div>
            ) : journalFiltered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-14 h-14 rounded-2xl bg-[var(--surface-2)]/60 flex items-center justify-center">
                  <Filter className="w-6 h-6 text-[var(--text-subtle)]" />
                </div>
                <div className="text-center">
                  <p className="text-body font-medium text-[var(--text)]">Нет событий</p>
                  <p className="text-caption text-[var(--text-secondary)] mt-0.5">Попробуйте изменить период или фильтр сотрудника</p>
                </div>
              </div>
            ) : (
              <>
                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 px-5 pt-4 pb-3">
                  <div className="bg-[var(--surface-2)]/40 rounded-xl px-3 py-2.5 text-center">
                    <p className="text-lg font-bold text-[var(--text)]">{journalFiltered.length}</p>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">событий</p>
                  </div>
                  <div className="bg-[var(--success-light)] border border-[var(--success)]/20 rounded-xl px-3 py-2.5 text-center">
                    <p className="text-lg font-bold text-[var(--success)]">{journalFiltered.filter(e => e.eventType === "checkin").length}</p>
                    <p className="text-[10px] text-[var(--success)] mt-0.5">приходов</p>
                  </div>
                  <div className="bg-[var(--warning-light)] border border-[var(--warning)]/20 rounded-xl px-3 py-2.5 text-center">
                    <p className="text-lg font-bold text-[var(--warning)]">{journalFiltered.filter(e => e.eventType === "checkout").length}</p>
                    <p className="text-[10px] text-[var(--warning)] mt-0.5">уходов</p>
                  </div>
                </div>

                {/* Table */}
                <div className="px-5 pb-5">
                  <div className="rounded-xl border border-[var(--ds-border)] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[var(--surface-2)]/50 border-b border-[var(--ds-border)]">
                          <th className="text-left px-4 py-2.5 text-caption font-medium text-[var(--text-secondary)]">Сотрудник</th>
                          <th className="text-left px-4 py-2.5 text-caption font-medium text-[var(--text-secondary)]">Событие</th>
                          <th className="text-left px-4 py-2.5 text-caption font-medium text-[var(--text-secondary)]">Дата</th>
                          <th className="text-right px-4 py-2.5 text-caption font-medium text-[var(--text-secondary)]">Время</th>
                        </tr>
                      </thead>
                      <tbody>
                        {journalFiltered.map((e, i) => {
                          const d = new Date(e.occurredAt);
                          const date = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "Asia/Almaty" });
                          const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" });
                          return (
                            <tr key={e.id} className={cn("border-b border-[var(--ds-border)] last:border-0", i % 2 === 0 ? "bg-[var(--ds-surface)]" : "bg-[var(--surface-2)]/20")}>
                              <td className="px-4 py-3 font-medium text-[var(--text)]">{e.userName}</td>
                              <td className="px-4 py-3">
                                <span className={cn(
                                  "inline-flex items-center gap-1.5 text-caption font-medium px-2 py-1 rounded-full",
                                  e.eventType === "checkin"
                                    ? "bg-[var(--success-light)] text-[var(--success)] border border-[var(--success)]/30"
                                    : "bg-[var(--warning-light)] text-[var(--warning)] border border-[var(--warning)]/30",
                                )}>
                                  {e.eventType === "checkin" ? <><LogIn className="w-3 h-3" />Приход</> : <><LogOut className="w-3 h-3" />Уход</>}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-caption text-[var(--text-secondary)]">{date}</td>
                              <td className="px-4 py-3 text-right font-mono text-body text-[var(--text)]">{time}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Telegram notifications ─────────────────────────────────────── */}
      <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--ds-border)]">
          <div className="flex-1">
            <h2 className="font-semibold text-base text-[var(--text)]">Telegram-уведомления</h2>
            <p className="text-caption text-[var(--text-secondary)] mt-0.5">Получайте уведомления о приходе и уходе сотрудников</p>
          </div>
          {tgPlatformChatId && (
            <div className="flex items-center gap-1.5 bg-[var(--success-light)] border border-[var(--success)]/30 text-[var(--success)] rounded-full px-3 py-1 text-caption font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Подключён
            </div>
          )}
        </div>
        <div className="p-5 space-y-4">
          {tgPlatformChatId ? (
            /* ── Connected state ── */
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-xl bg-[var(--success-light)] border border-[var(--success)]/30 p-4">
                <Bot className="w-5 h-5 text-[var(--success)] mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-body font-semibold text-[var(--success)]">Telegram подключён</p>
                  <p className="text-caption text-[var(--success)] mt-0.5">
                    Уведомления о приходе и уходе сотрудников отправляются через бот 1Dent
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void handleTestPlatform()}
                  disabled={testingPlatform}
                  className="flex-1 h-10 rounded-xl border border-[var(--ds-border)] text-body text-[var(--text-secondary)] hover:border-[var(--ds-primary)]/40 hover:text-[var(--ds-primary)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {testingPlatform ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Проверить
                </button>
                <button
                  onClick={() => void handleDisconnectPlatform()}
                  disabled={disconnectingPlatform}
                  className="flex items-center gap-1.5 px-4 h-10 rounded-xl border border-[var(--danger)]/30 text-body text-[var(--danger)] hover:bg-[var(--danger-light)] transition-colors disabled:opacity-50"
                >
                  {disconnectingPlatform ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
                  Отключить
                </button>
              </div>
            </div>
          ) : (
            /* ── Not connected state ── */
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-xl bg-[var(--surface-2)]/50 border border-[var(--ds-border)] p-4">
                <Bot className="w-5 h-5 text-[var(--text-secondary)] mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-body font-semibold text-[var(--text)]">Подключите Telegram за 1 шаг</p>
                  <p className="text-caption text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                    Нажмите кнопку — откроется бот 1Dent. Нажмите&nbsp;<b>«Начать»</b>&nbsp;— и уведомления будут приходить вам автоматически.
                  </p>
                </div>
              </div>
              <button
                onClick={() => void handleConnectPlatform()}
                disabled={connectingPlatform}
                className="w-full h-11 rounded-xl bg-[#2481cc] text-white text-body font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {connectingPlatform ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Ожидаем подключения…</>
                ) : (
                  <><ExternalLink className="w-4 h-4" /> Подключить Telegram</>
                )}
              </button>
              {connectingPlatform && (
                <p className="text-caption text-center text-[var(--text-secondary)]">
                  Откройте бота и нажмите «Начать» — страница обновится автоматически
                </p>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
