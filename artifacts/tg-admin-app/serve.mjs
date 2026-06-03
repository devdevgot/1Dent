import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = parseInt(process.env.PORT ?? "24344", 10);
const distDir = path.join(__dirname, "dist/public");

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

const server = http.createServer((req, res) => {
  const url = req.url ?? "/";

  // Health check for port detector
  if (url === "/" || url === "") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  // Strip base path prefix
  const base = "/tg-admin";
  const stripped = url.startsWith(base) ? url.slice(base.length) : url;
  const filePath = path.join(distDir, stripped.split("?")[0]);

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) {
      const ext = path.extname(filePath);
      const mime = MIME[ext] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime });
      fs.createReadStream(filePath).pipe(res);
    } else {
      // SPA fallback
      const indexPath = path.join(distDir, "index.html");
      res.writeHead(200, { "Content-Type": "text/html" });
      fs.createReadStream(indexPath).pipe(res);
    }
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`TMA static server running on http://0.0.0.0:${port}/tg-admin/`);
});
