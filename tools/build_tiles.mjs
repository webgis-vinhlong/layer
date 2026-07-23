#!/usr/bin/env node
/**
 * GeoJSONL -> MVT/MBTiles (Tippecanoe C++) -> PMTiles v3 (VersaTiles Rust).
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { convert } from "@versatiles/versatiles-rs";

const root = resolve(import.meta.dirname, "..");
const build = resolve(root, "build");
const temporary = resolve(build, "tmp");
const mbtiles = resolve(build, "vinhlong-layers.mbtiles");
const archive = resolve(root, "data", "vinhlong-layers.pmtiles");
const executableName = process.platform === "win32" ? "tippecanoe.exe" : "tippecanoe";
const platformMap = {
  "linux-x64": "linux_x64",
  "darwin-x64": "darwin_x64",
  "darwin-arm64": "darwin_arm64",
};
const bundledDirectory = platformMap[`${process.platform}-${process.arch}`];
const bundled = bundledDirectory
  ? resolve(
      root,
      "node_modules",
      "@bikehopper",
      "node-tippecanoe",
      "bin",
      bundledDirectory,
      executableName,
    )
  : "";
const tippecanoe = process.env.TIPPECANOE || (existsSync(bundled) ? bundled : executableName);

mkdirSync(temporary, { recursive: true });
[mbtiles, `${mbtiles}-journal`, archive].forEach((path) => {
  if (existsSync(path)) rmSync(path);
});

const args = [
  "--temporary-directory",
  temporary,
  "--force",
  "--quiet",
  "--output",
  mbtiles,
  "--name",
  "Vĩnh Long Layer Atlas",
  "--description",
  "103 lớp hạ tầng và hành chính tỉnh Vĩnh Long",
  "--attribution",
  "Nguồn: hatang.vinhlong.gov.vn · Phát triển: Long Ngo",
  "--projection",
  "EPSG:4326",
  "--minimum-zoom",
  "7",
  "--maximum-zoom",
  "16",
  "--read-parallel",
  "--detect-shared-borders",
  "--simplify-only-low-zooms",
  "--drop-densest-as-needed",
  "--force-feature-limit",
  "--maximum-tile-bytes",
  "1000000",
  "--named-layer",
  `points:${resolve(build, "points.geojsonl")}`,
  "--named-layer",
  `lines:${resolve(build, "lines.geojsonl")}`,
  "--named-layer",
  `polygons:${resolve(build, "polygons.geojsonl")}`,
];

console.log(`Tippecanoe: ${tippecanoe}`);
const tippecanoeResult = spawnSync(tippecanoe, args, {
  cwd: root,
  stdio: "inherit",
});
if (tippecanoeResult.error) throw tippecanoeResult.error;
if (tippecanoeResult.status !== 0) {
  throw new Error(`Tippecanoe exited with status ${tippecanoeResult.status}`);
}

const metadataResult = spawnSync(
  "python3",
  ["tools/finalize_mbtiles.py", mbtiles, "data/catalog.json"],
  { cwd: root, stdio: "inherit" },
);
if (metadataResult.error) throw metadataResult.error;
if (metadataResult.status !== 0) {
  throw new Error(`Metadata step exited with status ${metadataResult.status}`);
}

await convert(mbtiles, archive);
const manifestResult = spawnSync("node", ["tools/write_pmtiles_manifest.mjs"], {
  cwd: root,
  stdio: "inherit",
});
if (manifestResult.status !== 0) {
  throw new Error(`Manifest step exited with status ${manifestResult.status}`);
}
console.log(`PMTiles ready: ${archive}`);
