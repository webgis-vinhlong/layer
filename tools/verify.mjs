#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const required = [
  "index.html",
  "assets/app.js",
  "assets/styles.css",
  "assets/logo.svg",
  "data/catalog.json",
  "data/source-manifest.json",
  "data/pmtiles-manifest.json",
  "data/vinhlong-layers.pmtiles",
  "LICENSE",
  "README.md",
  "README_EN.md",
  "README_ZH.md",
];

const failures = [];
await Promise.all(
  required.map(async (file) => {
    try {
      const info = await stat(resolve(root, file));
      if (!info.isFile() || info.size === 0) failures.push(`${file}: empty or not a file`);
    } catch {
      failures.push(`${file}: missing`);
    }
  }),
);

const [catalogText, sourceText, manifestText, archive, html, app] = await Promise.all([
  readFile(resolve(root, "data/catalog.json"), "utf8"),
  readFile(resolve(root, "data/source-manifest.json"), "utf8"),
  readFile(resolve(root, "data/pmtiles-manifest.json"), "utf8"),
  readFile(resolve(root, "data/vinhlong-layers.pmtiles")),
  readFile(resolve(root, "index.html"), "utf8"),
  readFile(resolve(root, "assets/app.js"), "utf8"),
]);

const catalog = JSON.parse(catalogText);
const source = JSON.parse(sourceText);
const manifest = JSON.parse(manifestText);
const expected = {
  categories: 19,
  layers: 103,
  sourceFeatures: 36643,
  features: 35017,
};
Object.entries(expected).forEach(([key, value]) => {
  if (catalog.counts[key] !== value) {
    failures.push(`catalog.counts.${key}: expected ${value}, got ${catalog.counts[key]}`);
  }
});
if (source.files.length !== 103) failures.push("source manifest must list 103 GeoJSON files");
if (archive.subarray(0, 7).toString("ascii") !== "PMTiles" || archive[7] !== 3) {
  failures.push("archive header is not PMTiles v3");
}
if (manifest.bytes !== archive.length) failures.push("PMTiles byte size does not match manifest");
if (!html.includes("maplibre-gl@6.0.0")) failures.push("MapLibre dependency is not pinned");
if (!html.includes("pmtiles@4.4.1")) failures.push("PMTiles dependency is not pinned");
if (!app.includes('maplibregl.addProtocol("pmtiles"')) {
  failures.push("PMTiles protocol registration missing");
}

if (failures.length) {
  console.error(failures.map((failure) => `✗ ${failure}`).join("\n"));
  process.exit(1);
}
console.log(
  `✓ ${catalog.counts.layers} layers · ${catalog.counts.features.toLocaleString("en")} features · ` +
    `${(archive.length / 1024 / 1024).toFixed(2)} MiB · PMTiles v${archive[7]}`,
);
