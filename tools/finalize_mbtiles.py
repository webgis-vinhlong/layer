#!/usr/bin/env python3
"""Populate deterministic MBTiles metadata before PMTiles conversion."""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mbtiles", type=Path)
    parser.add_argument("catalog", type=Path)
    args = parser.parse_args()

    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    bounds = ",".join(str(value) for value in catalog["bounds"])
    center = ",".join(
        str(value)
        for value in (
            catalog["center"][0],
            catalog["center"][1],
            catalog["pmtiles"]["minzoom"],
        )
    )
    vector_layers = []
    fields = {
        "_layer_id": "Number",
        "_layer_name": "String",
        "_category_id": "String",
        "_category_label": "String",
        "_color": "String",
        "_geometry": "String",
        "_label": "String",
        "_fid": "Number",
    }
    for layer_id, geometry in (
        ("points", "Point"),
        ("lines", "LineString"),
        ("polygons", "Polygon"),
    ):
        vector_layers.append(
            {
                "id": layer_id,
                "description": f"Vĩnh Long {geometry} features",
                "minzoom": catalog["pmtiles"]["minzoom"],
                "maxzoom": catalog["pmtiles"]["maxzoom"],
                "fields": fields,
            }
        )

    metadata = {
        "name": catalog["title"],
        "type": "overlay",
        "version": "1.0.0",
        "description": "103 lớp dữ liệu WebGIS Vĩnh Long, phát triển bởi Long Ngo",
        "attribution": (
            "Nguồn dữ liệu: hatang.vinhlong.gov.vn · "
            "WebGIS mã nguồn mở MIT: Long Ngo"
        ),
        "format": "pbf",
        "bounds": bounds,
        "center": center,
        "minzoom": str(catalog["pmtiles"]["minzoom"]),
        "maxzoom": str(catalog["pmtiles"]["maxzoom"]),
        "json": json.dumps(
            {"vector_layers": vector_layers},
            ensure_ascii=False,
            separators=(",", ":"),
        ),
    }

    with sqlite3.connect(args.mbtiles) as connection:
        connection.execute(
            "CREATE TABLE IF NOT EXISTS metadata "
            "(name TEXT PRIMARY KEY, value TEXT)"
        )
        connection.executemany(
            "INSERT OR REPLACE INTO metadata(name, value) VALUES (?, ?)",
            sorted(metadata.items()),
        )
        connection.commit()

    print(f"wrote {len(metadata)} metadata entries to {args.mbtiles}")


if __name__ == "__main__":
    main()
