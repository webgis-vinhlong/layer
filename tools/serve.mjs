#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".geojson", "application/geo+json; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".pmtiles", "application/vnd.pmtiles"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
]);

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

if (process.argv.includes("--help")) {
  console.log(
    [
      "Vĩnh Long Layer Atlas development server",
      "",
      "Usage: npm run serve -- [--host 127.0.0.1] [--port 4173]",
      "",
      "The server supports HTTP byte-range requests required by PMTiles.",
    ].join("\n"),
  );
  process.exit(0);
}

const host = option("host", process.env.HOST || "127.0.0.1");
const port = Number(option("port", process.env.PORT || "4173"));
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error(`Cổng không hợp lệ: ${port}`);
}

function send(response, status, message, headers = {}) {
  const body = Buffer.from(message);
  response.writeHead(status, {
    "Content-Length": body.length,
    "Content-Type": "text/plain; charset=utf-8",
    ...headers,
  });
  response.end(body);
}

function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header || "");
  if (!match || (!match[1] && !match[2])) return null;

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}

function safeFilePath(url) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  } catch {
    return null;
  }
  if (pathname === "/") pathname = "/index.html";
  const segments = pathname.split("/").filter(Boolean);
  if (segments.some((segment) => segment.startsWith("."))) return null;

  const filePath = resolve(root, `.${pathname}`);
  const pathFromRoot = relative(root, filePath);
  if (pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === "..") return null;
  return filePath;
}

const server = createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method || "")) {
    send(response, 405, "Method Not Allowed", { Allow: "GET, HEAD" });
    return;
  }

  const filePath = safeFilePath(request.url || "/");
  if (!filePath) {
    send(response, 404, "Not Found");
    return;
  }

  let info;
  try {
    info = await stat(filePath);
  } catch {
    send(response, 404, "Not Found");
    return;
  }
  if (!info.isFile()) {
    send(response, 404, "Not Found");
    return;
  }

  const etag = `W/"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`;
  const commonHeaders = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache",
    ETag: etag,
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
  };
  if (request.headers["if-none-match"] === etag && !request.headers.range) {
    response.writeHead(304, commonHeaders);
    response.end();
    return;
  }

  const contentType = mimeTypes.get(extname(filePath).toLowerCase()) || "application/octet-stream";
  if (extname(filePath).toLowerCase() === ".pmtiles") {
    commonHeaders["Cache-Control"] = "public, max-age=3600, must-revalidate";
  }
  const requestedRange = request.headers.range;
  const range = requestedRange ? parseRange(requestedRange, info.size) : null;
  if (requestedRange && !range) {
    send(response, 416, "Range Not Satisfiable", {
      ...commonHeaders,
      "Content-Range": `bytes */${info.size}`,
    });
    return;
  }

  const status = range ? 206 : 200;
  const start = range?.start ?? 0;
  const end = range?.end ?? info.size - 1;
  response.writeHead(status, {
    ...commonHeaders,
    "Content-Length": end - start + 1,
    "Content-Type": contentType,
    ...(range ? { "Content-Range": `bytes ${start}-${end}/${info.size}` } : {}),
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath, { start, end }).pipe(response);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Cổng ${port} đang được sử dụng. Hãy thử: npm run serve -- --port ${port + 1}`,
    );
    process.exit(1);
  }
  throw error;
});

server.listen(port, host, () => {
  const displayHost = ["0.0.0.0", "::"].includes(host) ? "localhost" : host;
  console.log(`Vĩnh Long Layer Atlas: http://${displayHost}:${server.address().port}`);
  console.log("Nhấn Ctrl+C để dừng.");
});
