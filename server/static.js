// Serves the browser app's files. Only an explicit allowlist is reachable --
// the repo root also holds server code, docs and the SQLite database, none of
// which may ever be downloadable.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PUBLIC_FILES = new Set(["index.html", "app.js", "db.js", "anki-import.js", "style.css"]);
const PUBLIC_DIRS = ["assets/", "src/", "vendor/", "data/zones/", "dev/"];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".wasm": "application/wasm",
};

export function isPublicPath(relativePath) {
  if (PUBLIC_FILES.has(relativePath)) return true;
  return PUBLIC_DIRS.some((dir) => relativePath.startsWith(dir));
}

export function serveStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end();
    return;
  }
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const file = path.resolve(ROOT, "." + (urlPath === "/" ? "/index.html" : urlPath));
  const relative = path.relative(ROOT, file).split(path.sep).join("/");
  if (relative.startsWith("..") || path.isAbsolute(relative) || !isPublicPath(relative)) {
    res.writeHead(404).end("Not found");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  });
}
