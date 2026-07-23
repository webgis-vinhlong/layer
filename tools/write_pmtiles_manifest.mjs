#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const archivePath = resolve(root, "data", "vinhlong-layers.pmtiles");
const catalogPath = resolve(root, "data", "catalog.json");
const outputPath = resolve(root, "data", "pmtiles-manifest.json");

const [archive, catalogText] = await Promise.all([
  readFile(archivePath),
  readFile(catalogPath, "utf8"),
]);
if (archive.subarray(0, 7).toString("ascii") !== "PMTiles" || archive[7] !== 3) {
  throw new Error("Archive is not PMTiles v3");
}
const catalog = JSON.parse(catalogText);
const manifest = {
  schemaVersion: 1,
  file: "data/vinhlong-layers.pmtiles",
  format: "PMTiles",
  version: archive[7],
  tileType: "MVT",
  compression: "gzip",
  bytes: archive.length,
  sha256: createHash("sha256").update(archive).digest("hex"),
  minzoom: catalog.pmtiles.minzoom,
  maxzoom: catalog.pmtiles.maxzoom,
  bounds: catalog.bounds,
  sourceLayers: catalog.pmtiles.sourceLayers,
  features: catalog.counts.features,
};
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${outputPath}: ${manifest.sha256}`);
