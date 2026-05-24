import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Plus, Trash2, Loader2, Send, CheckCircle2, Bot, Navigation, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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
}

declare global {
  interface Window {
    ymaps: {
      ready: (fn: () => void) => void;
      Map: new (el: HTMLElement, opts: object) => YMap;
      Placemark: new (coords: number[], props: object, opts: object) => YPlacemark;
      Circle: new (coords: [number[], number], props: object, opts: object) => YCircle;
      GeoObjectCollection: new () => YCollection;
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
  const res = await fetch(path, {
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

export function BranchesSettings() {
  const { toast } = useToast();
  const mapRef = useRef<HTMLDivElement>(null);
  const ymapRef = useRef<YMap | null>(null);
  const pendingMarkerRef = useRef<YPlacemark | null>(null);
  const myLocationMarkerRef = useRef<YPlacemark | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [addingBranch, setAddingBranch] = useState<{ lat: number; lon: number } | null>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRadius, setNewRadius] = useState("200");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [branchSearch, setBranchSearch] = useState("");

  const [tgToken, setTgToken] = useState("");
  const [tgChatId, setTgChatId] = useState("");
  const [savingTg, setSavingTg] = useState(false);
  const [testingTg, setTestingTg] = useState(false);
  const [tgSaved, setTgSaved] = useState(false);

  const yandexApiKey = import.meta.env.VITE_YANDEX_MAPS_API_KEY as string | undefined ?? "";

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
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { void loadBranches(); void loadTgSettings(); }, [loadBranches, loadTgSettings]);

  // Render markers on map
  const renderMarkers = useCallback((map: YMap, list: Branch[]) => {
    map.geoObjects.removeAll();
    for (const b of list) {
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
  }, []);

  // Init map once branches are loaded
  useEffect(() => {
    if (loading || !mapRef.current) return;
    let destroyed = false;

    loadYandexMaps(yandexApiKey)
      .then(() => {
        if (destroyed || !mapRef.current) return;
        const center = branches.length
          ? [branches[0]!.latitude, branches[0]!.longitude]
          : [51.18, 71.446]; // Astana fallback

        const map = new window.ymaps.Map(mapRef.current, {
          center,
          zoom: 15,
          controls: ["zoomControl", "fullscreenControl"],
        });
        ymapRef.current = map;
        renderMarkers(map, branches);
        setMapReady(true);

        // Auto-detect device location
        if (navigator.geolocation) {
          setLocating(true);
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (destroyed) return;
              const lat = pos.coords.latitude;
              const lon = pos.coords.longitude;
              // Center map on device if no branches yet
              if (!branches.length) {
                map.setCenter([lat, lon], 15);
              }
              // Place blue "my location" dot
              const myMarker = new window.ymaps.Placemark(
                [lat, lon],
                { balloonContent: "Вы здесь" },
                { preset: "islands#blueCircleDotIcon" },
              );
              map.geoObjects.add(myMarker);
              myLocationMarkerRef.current = myMarker;
              setMyLocation({ lat, lon });
              setLocating(false);
            },
            () => { setLocating(false); },
            { timeout: 8000, maximumAge: 60000 },
          );
        }

        map.events.add("click", (e) => {
          const coords = e.get("coords");
          // Remove previous pending marker if any
          if (pendingMarkerRef.current) {
            map.geoObjects.remove(pendingMarkerRef.current);
            pendingMarkerRef.current = null;
          }
          // Place a temporary "pending" marker at clicked point
          const marker = new window.ymaps.Placemark(
            [coords[0]!, coords[1]!],
            { balloonContent: "Новый филиал" },
            { preset: "islands#redDotIcon" },
          );
          map.geoObjects.add(marker);
          pendingMarkerRef.current = marker;
          setAddingBranch({ lat: coords[0]!, lon: coords[1]! });
          setNewName("");
          setNewRadius("200");
        });
      })
      .catch(() => {
        if (!destroyed) setMapError("Не удалось загрузить Яндекс Карты. Убедитесь в подключении к интернету.");
      });

    return () => {
      destroyed = true;
      if (ymapRef.current) {
        try { ymapRef.current.destroy(); } catch { /* ignore */ }
        ymapRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Re-render markers when branches change and map is ready
  useEffect(() => {
    if (ymapRef.current) renderMarkers(ymapRef.current, branches);
  }, [branches, renderMarkers]);

  const clearPendingMarker = useCallback(() => {
    if (pendingMarkerRef.current && ymapRef.current) {
      ymapRef.current.geoObjects.remove(pendingMarkerRef.current);
      pendingMarkerRef.current = null;
    }
  }, []);

  const handleAddBranch = async () => {
    if (!addingBranch || !newName.trim()) return;
    setSaving(true);
    try {
      await apiFetch("/api/branches", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          latitude: addingBranch.lat,
          longitude: addingBranch.lon,
          radiusMeters: Math.max(10, parseInt(newRadius) || 200),
        }),
      });
      clearPendingMarker();
      await loadBranches();
      setAddingBranch(null);
      setMyLocation(null);
      toast({ title: "Филиал добавлен" });
    } catch {
      toast({ title: "Ошибка при добавлении филиала", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div className="space-y-5">

      {/* Map section */}
      <div className="bg-card rounded-2xl border border-border/60">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
          <MapPin className="w-5 h-5 text-primary" />
          <div className="flex-1">
            <h2 className="font-semibold text-base text-foreground">Филиалы и геозоны</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Нажмите на карту, чтобы добавить филиал</p>
          </div>
          {mapReady && !addingBranch && (
            <Button
              className="gap-1.5 h-8 text-xs px-2.5 sm:px-3"
              onClick={() => {
                if (myLocation) {
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
                  setAddingBranch({ lat: myLocation.lat, lon: myLocation.lon });
                  setNewName("");
                  setNewRadius("200");
                  setMyLocation(null);
                } else {
                  toast({ title: "Нажмите на карту, чтобы выбрать точку" });
                }
              }}
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Новый филиал</span>
            </Button>
          )}
        </div>

        <div className="p-4 space-y-3">
          {/* Map container */}
          <div className="relative rounded-xl overflow-hidden border border-border/40" style={{ height: 320 }}>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            )}
            {mapError && !loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 gap-2 p-4 text-center">
                <MapPin className="w-8 h-8 text-gray-300" />
                <p className="text-sm text-gray-500">{mapError}</p>
              </div>
            )}
            <div ref={mapRef} className="w-full h-full" />
          </div>

          {/* My location suggestion */}
          {myLocation && !addingBranch && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
              <Navigation className="w-4 h-4 text-blue-500 shrink-0" />
              <p className="text-sm text-blue-800 flex-1">
                Местоположение определено — добавить филиал здесь?
              </p>
              <button
                onClick={() => {
                  if (ymapRef.current && pendingMarkerRef.current) {
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
                  setAddingBranch({ lat: myLocation.lat, lon: myLocation.lon });
                  setNewName("");
                  setNewRadius("200");
                }}
                className="shrink-0 text-xs font-semibold text-blue-600 bg-blue-100 hover:bg-blue-200 transition-colors px-3 py-1.5 rounded-lg"
              >
                Да
              </button>
              <button
                onClick={() => setMyLocation(null)}
                className="shrink-0 text-xs text-blue-400 hover:text-blue-600 transition-colors"
              >
                Нет
              </button>
            </div>
          )}

          {/* Locating indicator */}
          {locating && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Определяем местоположение…
            </div>
          )}

          {/* Add branch dialog */}
          {addingBranch && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-blue-800">Добавить филиал</p>
              <p className="text-xs text-blue-600">
                Координаты: {addingBranch.lat.toFixed(5)}, {addingBranch.lon.toFixed(5)}
              </p>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Название филиала"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full h-10 rounded-xl border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <div className="flex gap-2 items-center">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">Радиус (м):</label>
                  <input
                    type="number"
                    min={10}
                    max={10000}
                    value={newRadius}
                    onChange={(e) => setNewRadius(e.target.value)}
                    className="w-24 h-10 rounded-xl border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void handleAddBranch()}
                  disabled={saving || !newName.trim()}
                  className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Добавить
                </button>
                <button
                  onClick={() => { clearPendingMarker(); setAddingBranch(null); }}
                  className="px-4 h-10 rounded-xl border border-border text-sm text-muted-foreground"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {/* Branch search (autocomplete dropdown) + list */}
          {branches.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none z-10" />
              <input
                type="text"
                placeholder="Поиск по филиалам…"
                value={branchSearch}
                onChange={(e) => setBranchSearch(e.target.value)}
                onFocus={() => setBranchSearch(branchSearch)}
                className="w-full h-9 pl-9 pr-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {branchSearch.trim() && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border border-border rounded-xl shadow-lg overflow-hidden">
                  {branches.filter((b) => b.name.toLowerCase().includes(branchSearch.toLowerCase())).length === 0 ? (
                    <div className="px-4 py-3 text-sm text-muted-foreground text-center">Ничего не найдено</div>
                  ) : (
                    branches
                      .filter((b) => b.name.toLowerCase().includes(branchSearch.toLowerCase()))
                      .map((b) => (
                        <button
                          key={b.id}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-colors text-left"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            ymapRef.current?.setCenter([b.latitude, b.longitude], 16);
                            setBranchSearch("");
                          }}
                        >
                          <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{b.name}</p>
                            <p className="text-xs text-muted-foreground">{b.latitude.toFixed(4)}, {b.longitude.toFixed(4)} · {b.radiusMeters}м</p>
                          </div>
                        </button>
                      ))
                  )}
                </div>
              )}
            </div>
          )}

          {branches.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground text-center py-3">
              Нет добавленных филиалов. Нажмите на карту, чтобы добавить.
            </p>
          )}

          <div className="space-y-2">
            {branches.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-background border border-border/40 cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => ymapRef.current?.setCenter([b.latitude, b.longitude], 16)}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <MapPin className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{b.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.latitude.toFixed(4)}, {b.longitude.toFixed(4)} · {b.radiusMeters}м
                    </p>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); void handleDeleteBranch(b.id); }}
                  disabled={deletingId === b.id}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-500 transition-colors shrink-0 disabled:opacity-50"
                >
                  {deletingId === b.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Telegram notifications */}
      <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
          <Bot className="w-5 h-5 text-primary" />
          <div>
            <h2 className="font-semibold text-base text-foreground">Telegram-уведомления</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Получайте уведомления о приходе и уходе сотрудников</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Bot Token
            </label>
            <input
              type="text"
              placeholder="123456789:AAF..."
              value={tgToken}
              onChange={(e) => setTgToken(e.target.value)}
              className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Создайте бота через <b>@BotFather</b> и скопируйте токен
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Chat ID владельца
            </label>
            <input
              type="text"
              placeholder="-100123456789"
              value={tgChatId}
              onChange={(e) => setTgChatId(e.target.value)}
              className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Напишите боту <b>@userinfobot</b> — он покажет ваш Chat ID
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void handleSaveTg()}
              disabled={savingTg}
              className={cn(
                "flex-1 h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all",
                tgSaved
                  ? "bg-green-500 text-white"
                  : "bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60",
              )}
            >
              {savingTg
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : tgSaved
                ? <><CheckCircle2 className="w-4 h-4" /> Сохранено</>
                : "Сохранить"}
            </button>
            <button
              onClick={() => void handleTestTg()}
              disabled={testingTg || !tgToken.trim() || !tgChatId.trim()}
              className="px-4 h-10 rounded-xl border border-border text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {testingTg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Проверить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
