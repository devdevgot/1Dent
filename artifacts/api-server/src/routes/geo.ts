import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

interface SuggestResult {
  title?: { text?: string };
  subtitle?: { text?: string };
  text?: string;
  uri?: string;
  type?: string;
}

function decodeCoordsFromUri(uri: string): [number, number] | null {
  try {
    const match = uri.match(/[?&]data=([^&]+)/);
    if (!match) return null;
    const raw = match[1]!.replace(/,+$/, "").replace(/-/g, "+").replace(/_/g, "/");
    const buf = Buffer.from(raw, "base64");
    // Find field 4 (tag 0x22) which contains nested message with lon/lat as fixed32 floats
    for (let i = 0; i < buf.length - 11; i++) {
      if (buf[i] === 0x22) {
        const len = buf[i + 1]!;
        const inner = buf.subarray(i + 2, i + 2 + len);
        // field 1 wire type 5 (0x0d), then 4 bytes lon; field 2 wire type 5 (0x15), then 4 bytes lat
        let j = 0;
        let lon: number | null = null;
        let lat: number | null = null;
        while (j < inner.length - 4) {
          const tag = inner[j]!;
          if (tag === 0x0d && j + 4 < inner.length) {
            lon = inner.readFloatLE(j + 1);
            j += 5;
          } else if (tag === 0x15 && j + 4 < inner.length) {
            lat = inner.readFloatLE(j + 1);
            j += 5;
          } else {
            j++;
          }
        }
        if (lon !== null && lat !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
          return [lat, lon];
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

router.get("/geo/search", async (req: Request, res: Response) => {
  const q = typeof req.query["q"] === "string" ? req.query["q"].trim() : "";
  if (!q) return res.json({ success: true, data: { results: [] } });

  try {
    const url = `https://suggest-maps.yandex.ru/suggest-geo?part=${encodeURIComponent(q)}&lang=ru_RU&v=9&n=8&highlight=0`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!resp.ok) throw new Error(`suggest error: ${resp.status}`);
    const text = await resp.text();

    // Parse JSONP: suggest.apply({...})
    const jsonMatch = text.match(/^suggest\.apply\(([\s\S]*)\)$/);
    if (!jsonMatch) throw new Error("unexpected suggest format");
    const data = JSON.parse(jsonMatch[1]!) as { results?: SuggestResult[] };
    const items = data.results ?? [];

    const results = items
      .filter((r) => r.type === "toponym" || r.type === "business")
      .map((r) => {
        const coords = r.uri ? decodeCoordsFromUri(r.uri) : null;
        const title = r.title?.text ?? "";
        const subtitle = r.subtitle?.text ?? "";
        const name = subtitle && !subtitle.includes("км") ? `${title}, ${subtitle}` : title;
        return { name, coords };
      })
      .filter((r): r is { name: string; coords: [number, number] } => r.coords !== null && r.name.length > 0);

    return res.json({ success: true, data: { results } });
  } catch (err) {
    return res.status(502).json({ success: false, error: String(err) });
  }
});

export default router;
