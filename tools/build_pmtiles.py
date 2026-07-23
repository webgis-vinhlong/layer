#!/usr/bin/env python3
"""Chuẩn hóa GeoJSON Vĩnh Long và chuẩn bị đầu vào cho Tippecanoe/PMTiles."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import Counter
from pathlib import Path
from typing import Any, Iterable


GEOMETRY_BUCKETS = {
    "Point": "points",
    "MultiPoint": "points",
    "LineString": "lines",
    "MultiLineString": "lines",
    "Polygon": "polygons",
    "MultiPolygon": "polygons",
}


def iter_coordinates(value: Any) -> Iterable[tuple[float, float]]:
    if (
        isinstance(value, list)
        and len(value) >= 2
        and isinstance(value[0], (int, float))
        and isinstance(value[1], (int, float))
    ):
        yield float(value[0]), float(value[1])
        return
    if isinstance(value, list):
        for child in value:
            yield from iter_coordinates(child)


def normalize_coordinates(value: Any) -> tuple[Any, int]:
    """Chuẩn hóa tọa độ bị lưu dưới dạng số nguyên nhân lũy thừa của 10."""
    if (
        isinstance(value, list)
        and len(value) >= 2
        and isinstance(value[0], (int, float))
        and isinstance(value[1], (int, float))
    ):
        longitude = float(value[0])
        latitude = float(value[1])
        correction = 0

        def normalize_axis(number: float, minimum: float, maximum: float) -> float:
            nonlocal correction
            if minimum <= number <= maximum:
                return number
            candidate = number
            for _ in range(16):
                candidate /= 10
                if minimum <= candidate <= maximum:
                    correction = 1
                    return candidate
            return number

        longitude = normalize_axis(longitude, 104, 108)
        latitude = normalize_axis(latitude, 8, 12)
        tail = value[2:] if len(value) > 2 else []
        return [longitude, latitude, *tail], correction
    if isinstance(value, list):
        normalized = []
        corrections = 0
        for child in value:
            child_value, child_corrections = normalize_coordinates(child)
            normalized.append(child_value)
            corrections += child_corrections
        return normalized, corrections
    return value, 0


def update_bounds(
    bounds: list[float], coordinates: Any, *, source: str
) -> tuple[float, float] | None:
    first: tuple[float, float] | None = None
    for longitude, latitude in iter_coordinates(coordinates):
        if not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
            raise ValueError(
                f"Tọa độ ngoài EPSG:4326 trong {source}: {longitude}, {latitude}"
            )
        if first is None:
            first = (longitude, latitude)
        bounds[0] = min(bounds[0], longitude)
        bounds[1] = min(bounds[1], latitude)
        bounds[2] = max(bounds[2], longitude)
        bounds[3] = max(bounds[3], latitude)
    return first


def coordinates_are_in_vinhlong(value: Any) -> bool:
    coordinates = list(iter_coordinates(value))
    return bool(coordinates) and all(
        104 <= longitude <= 108 and 8 <= latitude <= 12
        for longitude, latitude in coordinates
    )


def clean_properties(properties: dict[str, Any]) -> dict[str, Any]:
    cleaned: dict[str, Any] = {}
    for key, value in properties.items():
        if value is None or isinstance(value, (str, int, float, bool)):
            cleaned[str(key)] = value
        else:
            cleaned[str(key)] = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return cleaned


def pick_label(properties: dict[str, Any], fallback: str) -> str:
    preferred = (
        "_label",
        "label",
        "Tên xã phường",
        "TÊN VÙNG TRỒNG",
        "Tên",
        "TÊN",
        "ten",
        "name",
        "Name",
    )
    for key in preferred:
        value = properties.get(key)
        if value not in (None, ""):
            return str(value).strip()
    return fallback


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Chuẩn hóa GeoJSON, tạo catalog và GeoJSONL cho PMTiles."
    )
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--catalog", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--work-dir", required=True, type=Path)
    args = parser.parse_args()

    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    categories = {item["id"]: item for item in catalog["catalogs"]}
    args.output_dir.mkdir(parents=True, exist_ok=True)
    args.work_dir.mkdir(parents=True, exist_ok=True)

    streams = {
        bucket: (args.work_dir / f"{bucket}.geojsonl").open("w", encoding="utf-8")
        for bucket in ("points", "lines", "polygons")
    }

    global_bounds = [math.inf, math.inf, -math.inf, -math.inf]
    geometry_counts: Counter[str] = Counter()
    coordinate_corrections = 0
    invalid_features = 0
    source_features = 0
    source_manifest: list[dict[str, Any]] = []
    normalized_layers: list[dict[str, Any]] = []
    total_features = 0

    try:
        for layer in sorted(catalog["layers"], key=lambda item: int(item["id"])):
            layer_id = int(layer["id"])
            source_path = args.source_dir / f"{layer_id}.geojson"
            if not source_path.exists():
                raise FileNotFoundError(f"Thiếu lớp {layer_id}: {source_path}")

            collection = json.loads(source_path.read_text(encoding="utf-8"))
            if collection.get("type") != "FeatureCollection":
                raise ValueError(f"{source_path} không phải FeatureCollection")

            features = collection.get("features", [])
            source_features += len(features)
            expected = int(layer.get("featureCount", len(features)))
            if len(features) != expected:
                raise ValueError(
                    f"Lớp {layer_id} sai số đối tượng: catalog={expected}, file={len(features)}"
                )

            category_id = layer["primaryCategoryId"]
            category = categories[category_id]
            layer_bounds = [math.inf, math.inf, -math.inf, -math.inf]
            layer_geometry_counts: Counter[str] = Counter()
            field_names: set[str] = set()
            mapped_layer_features = 0
            invalid_layer_features = 0

            for index, feature in enumerate(features):
                geometry = feature.get("geometry")
                if not geometry:
                    continue
                geometry_type = geometry.get("type")
                bucket = GEOMETRY_BUCKETS.get(geometry_type)
                if bucket is None:
                    raise ValueError(
                        f"Kiểu hình học chưa hỗ trợ trong lớp {layer_id}: {geometry_type}"
                    )

                normalized_coordinates, corrections = normalize_coordinates(
                    geometry.get("coordinates")
                )
                coordinate_corrections += corrections
                if not coordinates_are_in_vinhlong(normalized_coordinates):
                    invalid_features += 1
                    invalid_layer_features += 1
                    continue
                normalized_geometry = {
                    **geometry,
                    "coordinates": normalized_coordinates,
                }

                update_bounds(
                    layer_bounds,
                    normalized_coordinates,
                    source=f"{source_path.name}#{index}",
                )
                update_bounds(
                    global_bounds,
                    normalized_coordinates,
                    source=f"{source_path.name}#{index}",
                )

                properties = clean_properties(feature.get("properties") or {})
                label = pick_label(properties, f"{layer['name']} #{index + 1}")
                feature_id = feature.get("id", properties.get("fid", index + 1))
                properties.update(
                    {
                        "_layer_id": layer_id,
                        "_layer_name": layer["name"].strip(),
                        "_category_id": category_id,
                        "_category_label": category["label"],
                        "_color": category["color"],
                        "_geometry": geometry_type,
                        "_label": label,
                        "_fid": feature_id,
                    }
                )
                field_names.update(properties)

                normalized_feature = {
                    "type": "Feature",
                    "id": feature_id,
                    "geometry": normalized_geometry,
                    "properties": properties,
                }
                streams[bucket].write(
                    json.dumps(
                        normalized_feature,
                        ensure_ascii=False,
                        separators=(",", ":"),
                    )
                    + "\n"
                )
                total_features += 1
                mapped_layer_features += 1
                geometry_counts[bucket] += 1
                layer_geometry_counts[geometry_type] += 1

            if math.isinf(layer_bounds[0]):
                layer_bounds = [105.2, 9.4, 106.8, 10.6]

            normalized_layers.append(
                {
                    **layer,
                    "name": layer["name"].strip(),
                    "sourceFeatureCount": len(features),
                    "featureCount": mapped_layer_features,
                    "invalidGeometryCount": invalid_layer_features,
                    "bounds": [round(value, 7) for value in layer_bounds],
                    "fields": sorted(field_names),
                    "geometryCounts": dict(sorted(layer_geometry_counts.items())),
                    "sourceFile": f"data/geojson/{source_path.name}",
                }
            )
            source_manifest.append(
                {
                    "id": layer_id,
                    "file": f"data/geojson/{source_path.name}",
                    "sha256": sha256(source_path),
                    "bytes": source_path.stat().st_size,
                    "features": len(features),
                    "mappedFeatures": mapped_layer_features,
                    "invalidGeometryCount": invalid_layer_features,
                }
            )
    finally:
        for stream in streams.values():
            stream.close()

    normalized_categories = []
    for category in catalog["catalogs"]:
        layer_ids = [int(value) for value in category["layerIds"]]
        normalized_categories.append(
            {
                **category,
                "layerIds": layer_ids,
                "layerCount": len(layer_ids),
                "featureCount": sum(
                    int(layer["featureCount"])
                    for layer in normalized_layers
                    if int(layer["id"]) in layer_ids
                ),
            }
        )

    center = [
        round((global_bounds[0] + global_bounds[2]) / 2, 7),
        round((global_bounds[1] + global_bounds[3]) / 2, 7),
    ]
    output_catalog = {
        "schemaVersion": 1,
        "title": "Vĩnh Long Layer Atlas",
        "generatedAt": catalog.get("generatedAt"),
        "source": catalog.get("source"),
        "coordinateSystem": "EPSG:4326",
        "bounds": [round(value, 7) for value in global_bounds],
        "center": center,
        "counts": {
            "categories": len(normalized_categories),
            "layers": len(normalized_layers),
            "features": total_features,
            "sourceFeatures": source_features,
            "invalidGeometries": invalid_features,
            "points": geometry_counts["points"],
            "lines": geometry_counts["lines"],
            "polygons": geometry_counts["polygons"],
            "coordinateCorrections": coordinate_corrections,
        },
        "pmtiles": {
            "file": "data/vinhlong-layers.pmtiles",
            "sourceLayers": ["points", "lines", "polygons"],
            "minzoom": 7,
            "maxzoom": 16,
        },
        "categories": normalized_categories,
        "layers": normalized_layers,
    }

    (args.output_dir / "catalog.json").write_text(
        json.dumps(output_catalog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (args.output_dir / "source-manifest.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "sourceArchiveStatus": "central-directory-missing; entries recovered by CRC",
                "files": source_manifest,
                "totals": output_catalog["counts"],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "status": "ok",
                "layers": len(normalized_layers),
                "features": total_features,
                "geometry": dict(geometry_counts),
                "coordinateCorrections": coordinate_corrections,
                "sourceFeatures": source_features,
                "invalidGeometries": invalid_features,
                "bounds": output_catalog["bounds"],
                "center": center,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
