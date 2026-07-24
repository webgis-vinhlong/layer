/* Vĩnh Long Layer Atlas · MIT · Long Ngo */
(() => {
  "use strict";

  const APP = {
    catalogUrl: "data/catalog.json",
    archiveUrl: "data/vinhlong-layers.pmtiles",
    sourceId: "vinhlong",
    defaultBasemap: "light",
    featuredLayerIds: [339, 156, 244, 327, 340, 311, 312, 307, 344, 355],
    internalFields: new Set([
      "_category_id",
      "_category_label",
      "_color",
      "_fid",
      "_geometry",
      "_label",
      "_layer_id",
      "_layer_name",
      "fid",
      "label",
      "layer_id",
    ]),
  };

  const ICONS = {
    "map-pinned": "map-pinned",
    factory: "factory",
    "radio-tower": "radio-tower",
    sprout: "sprout",
    droplets: "droplets",
    route: "route",
    hospital: "hospital",
    store: "store",
    landmark: "landmark",
    "graduation-cap": "graduation-cap",
    school: "school",
    "flask-conical": "flask-conical",
    "wallet-cards": "wallet-cards",
    "briefcase-business": "briefcase-business",
    scale: "scale",
    palmtree: "palmtree",
    "paw-print": "paw-print",
    waves: "waves",
    fish: "fish",
  };

  const state = {
    catalog: null,
    map: null,
    active: new Set(APP.featuredLayerIds),
    labelsVisible: true,
    currentBasemap: APP.defaultBasemap,
    userMarker: null,
    selectedLocation: null,
    archiveError: false,
    toastTimer: null,
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const formatNumber = new Intl.NumberFormat("vi-VN");

  const dom = {
    groups: $("#layer-groups"),
    search: $("#layer-search"),
    activeCount: $("#active-count"),
    labelToggle: $("#label-toggle"),
    mapLoading: $("#map-loading"),
    inspector: $("#inspector"),
    inspectorTitle: $("#inspector-title"),
    inspectorCategory: $("#inspector-category"),
    inspectorMeta: $("#inspector-meta"),
    inspectorProperties: $("#inspector-properties"),
    basemapMenu: $("#basemap-menu"),
    basemapButton: $("#basemap-button"),
    archiveStatus: $("#archive-status"),
    archiveStatusText: $("#archive-status-text"),
    sidebar: $("#sidebar"),
    sidebarToggle: $("#sidebar-toggle"),
    backdrop: $("#backdrop"),
    toast: $("#toast"),
  };

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function icon(name, className = "") {
    const safeName = ICONS[name] || name || "map";
    return `<i data-lucide="${escapeHtml(safeName)}" class="${escapeHtml(className)}"></i>`;
  }

  function refreshIcons() {
    if (window.lucide) {
      window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
    }
  }

  function setArchiveStatus(message, tone = "ready") {
    dom.archiveStatusText.textContent = message;
    dom.archiveStatus.classList.toggle("is-loading", tone === "loading");
    dom.archiveStatus.classList.toggle("is-error", tone === "error");
  }

  function restorePreferences() {
    try {
      const stored = JSON.parse(localStorage.getItem("vinhlong-layer-atlas") || "{}");
      if (Array.isArray(stored.active)) {
        state.active = new Set(stored.active.map(Number));
      }
      if (typeof stored.labelsVisible === "boolean") {
        state.labelsVisible = stored.labelsVisible;
      }
      if (["light", "dark", "satellite"].includes(stored.basemap)) {
        state.currentBasemap = stored.basemap;
      }
    } catch {
      // A private browsing policy may disable storage; the map still works.
    }
  }

  function savePreferences() {
    try {
      localStorage.setItem(
        "vinhlong-layer-atlas",
        JSON.stringify({
          active: [...state.active],
          labelsVisible: state.labelsVisible,
          basemap: state.currentBasemap,
        }),
      );
    } catch {
      // Preferences are optional.
    }
  }

  function baseStyle() {
    const attribution =
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · ' +
      '© <a href="https://carto.com/attributions">CARTO</a> · ' +
      "Nguồn chuyên đề: hatang.vinhlong.gov.vn";
    return {
      version: 8,
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        "base-light": {
          type: "raster",
          tiles: [
            "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
            "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          attribution,
        },
        "base-dark": {
          type: "raster",
          tiles: [
            "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
            "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          attribution,
        },
        "base-satellite": {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          attribution: "Tiles © Esri · Nguồn chuyên đề: hatang.vinhlong.gov.vn",
        },
      },
      layers: [
        {
          id: "background",
          type: "background",
          paint: { "background-color": "#eaf1f4" },
        },
        {
          id: "base-light",
          type: "raster",
          source: "base-light",
          layout: { visibility: state.currentBasemap === "light" ? "visible" : "none" },
        },
        {
          id: "base-dark",
          type: "raster",
          source: "base-dark",
          layout: { visibility: state.currentBasemap === "dark" ? "visible" : "none" },
        },
        {
          id: "base-satellite",
          type: "raster",
          source: "base-satellite",
          layout: {
            visibility: state.currentBasemap === "satellite" ? "visible" : "none",
          },
        },
      ],
    };
  }

  function layerFilter() {
    return [
      "match",
      ["get", "_layer_id"],
      [...state.active].sort((a, b) => a - b),
      true,
      false,
    ];
  }

  function addThematicLayers() {
    const archive = new URL(APP.archiveUrl, window.location.href).href;
    state.map.addSource(APP.sourceId, {
      type: "vector",
      url: `pmtiles://${archive}`,
      attribution: "Nguồn dữ liệu: hatang.vinhlong.gov.vn · Long Ngo",
    });

    const filter = layerFilter();
    state.map.addLayer({
      id: "vl-polygons-fill",
      type: "fill",
      source: APP.sourceId,
      "source-layer": "polygons",
      filter,
      paint: {
        "fill-color": ["coalesce", ["get", "_color"], "#0da6a6"],
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0.2, 13, 0.34, 16, 0.42],
      },
    });
    state.map.addLayer({
      id: "vl-polygons-outline",
      type: "line",
      source: APP.sourceId,
      "source-layer": "polygons",
      filter,
      paint: {
        "line-color": ["coalesce", ["get", "_color"], "#0da6a6"],
        "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1, 14, 2.4],
        "line-opacity": 0.95,
      },
    });
    state.map.addLayer({
      id: "vl-lines-casing",
      type: "line",
      source: APP.sourceId,
      "source-layer": "lines",
      filter,
      paint: {
        "line-color": "rgba(255,255,255,.86)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 7, 2.4, 12, 4.2, 16, 8],
        "line-opacity": 0.82,
      },
    });
    state.map.addLayer({
      id: "vl-lines",
      type: "line",
      source: APP.sourceId,
      "source-layer": "lines",
      filter,
      paint: {
        "line-color": ["coalesce", ["get", "_color"], "#0da6a6"],
        "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1, 12, 2.2, 16, 5],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0.74, 13, 0.96],
      },
    });
    state.map.addLayer({
      id: "vl-points-halo",
      type: "circle",
      source: APP.sourceId,
      "source-layer": "points",
      filter,
      paint: {
        "circle-color": "rgba(255,255,255,.9)",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 3.8, 11, 5.4, 16, 10],
        "circle-blur": 0.1,
        "circle-opacity": 0.92,
      },
    });
    state.map.addLayer({
      id: "vl-points",
      type: "circle",
      source: APP.sourceId,
      "source-layer": "points",
      filter,
      paint: {
        "circle-color": ["coalesce", ["get", "_color"], "#0da6a6"],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 2, 11, 3.3, 16, 7],
        "circle-stroke-color": "rgba(7,27,47,.65)",
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 7, 0.4, 16, 1],
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0.78, 12, 0.96],
      },
    });
    state.map.addLayer({
      id: "vl-point-labels",
      type: "symbol",
      source: APP.sourceId,
      "source-layer": "points",
      minzoom: 12,
      filter,
      layout: {
        visibility: state.labelsVisible ? "visible" : "none",
        "text-field": ["get", "_label"],
        "text-font": ["Open Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 12],
        "text-offset": [0, 1.1],
        "text-anchor": "top",
        "text-max-width": 18,
        "text-optional": true,
      },
      paint: {
        "text-color": "#17344a",
        "text-halo-color": "rgba(255,255,255,.94)",
        "text-halo-width": 1.4,
        "text-halo-blur": 0.5,
      },
    });

    const interactionLayers = [
      "vl-polygons-fill",
      "vl-lines",
      "vl-points",
      "vl-point-labels",
    ];
    interactionLayers.forEach((layerId) => {
      state.map.on("mouseenter", layerId, () => {
        state.map.getCanvas().style.cursor = "pointer";
      });
      state.map.on("mouseleave", layerId, () => {
        state.map.getCanvas().style.cursor = "";
      });
    });

    state.map.on("click", (event) => {
      const features = state.map.queryRenderedFeatures(event.point, {
        layers: interactionLayers,
      });
      if (features.length) showFeature(features[0], event.lngLat);
    });
  }

  function updateMapFilter() {
    if (!state.map?.getSource(APP.sourceId)) return;
    const filter = layerFilter();
    [
      "vl-polygons-fill",
      "vl-polygons-outline",
      "vl-lines-casing",
      "vl-lines",
      "vl-points-halo",
      "vl-points",
      "vl-point-labels",
    ].forEach((layerId) => {
      if (state.map.getLayer(layerId)) state.map.setFilter(layerId, filter);
    });
  }

  function setActive(next, mode = "") {
    state.active = new Set(next);
    savePreferences();
    updateMapFilter();
    renderLayers(dom.search.value);
    updateQuickAction(mode);
  }

  function updateQuickAction(mode) {
    ["show-featured", "show-all", "hide-all"].forEach((id) => {
      $(`#${id}`).classList.toggle("active", id === mode);
    });
  }

  function toggleLayer(layerId) {
    const next = new Set(state.active);
    if (next.has(layerId)) next.delete(layerId);
    else next.add(layerId);
    setActive(next);
  }

  function renderLayers(query = "") {
    const normalizedQuery = normalizeText(query);
    const categories = state.catalog.categories;
    const layersById = new Map(state.catalog.layers.map((layer) => [layer.id, layer]));
    let matchedGroups = 0;
    let html = "";

    categories.forEach((category) => {
      const categoryMatches = normalizeText(category.label).includes(normalizedQuery);
      const layers = category.layerIds
        .map((id) => layersById.get(id))
        .filter(Boolean)
        .filter(
          (layer) =>
            !normalizedQuery ||
            categoryMatches ||
            normalizeText(`${layer.name} ${layer.table} ${layer.geometry}`).includes(
              normalizedQuery,
            ),
        );
      if (!layers.length) return;
      matchedGroups += 1;
      const open =
        Boolean(normalizedQuery) ||
        layers.some((layer) => state.active.has(layer.id)) ||
        category.layerCount <= 2;
      const activeInGroup = layers.filter((layer) => state.active.has(layer.id)).length;
      html += `
        <section class="layer-group${open ? " open" : ""}" data-category="${escapeHtml(category.id)}">
          <button
            class="group-header"
            type="button"
            aria-expanded="${open}"
            style="--category-color:${escapeHtml(category.color)}"
          >
            <span class="category-icon">${icon(category.icon)}</span>
            <span class="group-title">
              <strong>${escapeHtml(category.label)}</strong>
              <small>${formatNumber.format(category.featureCount)} đối tượng</small>
            </span>
            <span class="group-count">${activeInGroup}/${layers.length}</span>
            ${icon("chevron-down", "group-chevron")}
          </button>
          <div class="group-layers">
            <div
              class="group-actions"
              role="group"
              aria-label="Thao tác nhóm ${escapeHtml(category.label)}"
            >
              <button type="button" data-group-show="${escapeHtml(category.id)}">
                ${icon("eye")} Bật cả nhóm
              </button>
              <button type="button" data-group-hide="${escapeHtml(category.id)}">
                ${icon("eye-off")} Ẩn cả nhóm
              </button>
            </div>
            ${layers
              .map(
                (layer) => `
                  <div class="layer-row" title="${escapeHtml(layer.name)}">
                    <button
                      class="layer-toggle${state.active.has(layer.id) ? " active" : ""}"
                      type="button"
                      data-layer-toggle="${layer.id}"
                      aria-pressed="${state.active.has(layer.id)}"
                      aria-label="${state.active.has(layer.id) ? "Ẩn" : "Hiện"} ${escapeHtml(layer.name)}"
                      style="--layer-color:${escapeHtml(category.color)}"
                    >
                      ${icon(geometryIcon(layer.geometry))}
                    </button>
                    <span class="layer-name">${escapeHtml(layer.name)}</span>
                    <button
                      class="layer-fit"
                      type="button"
                      data-layer-fit="${layer.id}"
                      aria-label="Phóng đến ${escapeHtml(layer.name)}"
                      title="${formatNumber.format(layer.featureCount)} đối tượng · ${escapeHtml(layer.geometry)}"
                    >
                      ${icon("focus")}
                    </button>
                  </div>
                `,
              )
              .join("")}
          </div>
        </section>
      `;
    });

    if (!matchedGroups) {
      html = `<div class="empty-state">Không tìm thấy lớp phù hợp với “${escapeHtml(query)}”.</div>`;
    }
    dom.groups.innerHTML = html;
    dom.activeCount.textContent = formatNumber.format(state.active.size);

    $$(".group-header").forEach((button) => {
      button.addEventListener("click", () => {
        const group = button.closest(".layer-group");
        group.classList.toggle("open");
        button.setAttribute("aria-expanded", String(group.classList.contains("open")));
      });
    });
    $$("[data-layer-toggle]").forEach((button) => {
      button.addEventListener("click", () => toggleLayer(Number(button.dataset.layerToggle)));
    });
    $$("[data-layer-fit]").forEach((button) => {
      button.addEventListener("click", () => focusLayer(Number(button.dataset.layerFit)));
    });
    $$("[data-group-show]").forEach((button) => {
      button.addEventListener("click", () => toggleCategory(button.dataset.groupShow, true));
    });
    $$("[data-group-hide]").forEach((button) => {
      button.addEventListener("click", () => toggleCategory(button.dataset.groupHide, false));
    });
    refreshIcons();
  }

  function toggleCategory(categoryId, visible) {
    const category = state.catalog.categories.find((item) => item.id === categoryId);
    if (!category) return;
    const next = new Set(state.active);
    category.layerIds.forEach((layerId) => {
      if (visible) next.add(layerId);
      else next.delete(layerId);
    });
    setActive(next);
    showToast(`${visible ? "Đã bật" : "Đã ẩn"} ${category.layerCount} lớp · ${category.label}`);
  }

  function geometryIcon(geometry) {
    if (geometry?.includes("Polygon")) return "pentagon";
    if (geometry?.includes("Line")) return "git-commit-horizontal";
    return "map-pin";
  }

  function focusLayer(layerId) {
    const layer = state.catalog.layers.find((item) => item.id === layerId);
    if (!layer?.bounds) {
      showToast("Lớp này chưa có phạm vi hợp lệ.");
      return;
    }
    if (!state.active.has(layerId)) {
      state.active.add(layerId);
      savePreferences();
      updateMapFilter();
      renderLayers(dom.search.value);
    }
    state.map.fitBounds(
      [
        [layer.bounds[0], layer.bounds[1]],
        [layer.bounds[2], layer.bounds[3]],
      ],
      { padding: 70, duration: 850, maxZoom: 15 },
    );
    closeSidebar();
    showToast(`${layer.name} · ${formatNumber.format(layer.featureCount)} đối tượng`);
  }

  function showFeature(feature, lngLat) {
    const properties = feature.properties || {};
    const color = properties._color || "#0da6a6";
    const title = properties._label || properties._layer_name || "Đối tượng bản đồ";
    state.selectedLocation = [lngLat.lng, lngLat.lat];
    dom.inspector.style.setProperty("--feature-color", color);
    dom.inspectorTitle.textContent = title;
    dom.inspectorCategory.textContent =
      `${properties._category_label || "LỚP DỮ LIỆU"} · ${properties._layer_name || ""}`.toUpperCase();
    dom.inspectorMeta.innerHTML = [
      properties._geometry || feature.geometry?.type,
      `ID ${properties._fid ?? "—"}`,
      `${lngLat.lng.toFixed(6)}, ${lngLat.lat.toFixed(6)}`,
    ]
      .filter(Boolean)
      .map((value) => `<span class="meta-badge">${escapeHtml(value)}</span>`)
      .join("");

    const rows = Object.entries(properties)
      .filter(
        ([key, value]) =>
          !APP.internalFields.has(key) &&
          value !== null &&
          value !== undefined &&
          String(value).trim() !== "",
      )
      .slice(0, 40);
    dom.inspectorProperties.innerHTML = rows.length
      ? rows
          .map(
            ([key, value]) => `
              <div class="property-row">
                <dt>${escapeHtml(key)}</dt>
                <dd>${escapeHtml(displayValue(value))}</dd>
              </div>
            `,
          )
          .join("")
      : '<div class="empty-state">Đối tượng không có thuộc tính công khai.</div>';
    dom.inspector.hidden = false;
    refreshIcons();
  }

  async function copyText(value, successMessage) {
    try {
      await navigator.clipboard.writeText(value);
      showToast(successMessage);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      showToast(copied ? successMessage : "Không thể sao chép tự động.");
    }
  }

  function displayValue(value) {
    if (typeof value !== "string") return String(value);
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.join(", ");
      if (parsed && typeof parsed === "object") {
        return Object.entries(parsed)
          .map(([key, item]) => `${key}: ${item}`)
          .join(" · ");
      }
    } catch {
      // Plain strings are expected for most attributes.
    }
    return value;
  }

  function switchBasemap(name) {
    state.currentBasemap = name;
    ["light", "dark", "satellite"].forEach((id) => {
      if (state.map.getLayer(`base-${id}`)) {
        state.map.setLayoutProperty(
          `base-${id}`,
          "visibility",
          id === name ? "visible" : "none",
        );
      }
    });
    $$(".basemap-option").forEach((button) => {
      button.classList.toggle("active", button.dataset.basemap === name);
    });
    savePreferences();
    closeBasemapMenu();
  }

  function showToast(message) {
    window.clearTimeout(state.toastTimer);
    dom.toast.textContent = message;
    dom.toast.hidden = false;
    state.toastTimer = window.setTimeout(() => {
      dom.toast.hidden = true;
    }, 3200);
  }

  function openSidebar() {
    dom.sidebar.classList.add("open");
    dom.sidebarToggle.setAttribute("aria-expanded", "true");
    dom.backdrop.hidden = false;
  }

  function closeSidebar() {
    dom.sidebar.classList.remove("open");
    dom.sidebarToggle.setAttribute("aria-expanded", "false");
    dom.backdrop.hidden = true;
  }

  function closeBasemapMenu() {
    dom.basemapMenu.hidden = true;
    dom.basemapButton.setAttribute("aria-expanded", "false");
  }

  function bindUi() {
    dom.search.addEventListener("input", () => renderLayers(dom.search.value));
    dom.labelToggle.checked = state.labelsVisible;
    dom.labelToggle.addEventListener("change", () => {
      state.labelsVisible = dom.labelToggle.checked;
      if (state.map?.getLayer("vl-point-labels")) {
        state.map.setLayoutProperty(
          "vl-point-labels",
          "visibility",
          state.labelsVisible ? "visible" : "none",
        );
      }
      savePreferences();
    });
    $("#show-featured").addEventListener("click", () => {
      setActive(APP.featuredLayerIds, "show-featured");
    });
    $("#show-all").addEventListener("click", () => {
      setActive(
        state.catalog.layers.map((layer) => layer.id),
        "show-all",
      );
    });
    $("#hide-all").addEventListener("click", () => setActive([], "hide-all"));
    $("#home-button").addEventListener("click", () => {
      const [west, south, east, north] = state.catalog.bounds;
      state.map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding: 46, duration: 900 },
      );
    });
    $("#locate-button").addEventListener("click", locateUser);
    $("#share-button").addEventListener("click", () => {
      copyText(window.location.href, "Đã sao chép liên kết khung nhìn.");
    });
    dom.basemapButton.addEventListener("click", () => {
      const willOpen = dom.basemapMenu.hidden;
      dom.basemapMenu.hidden = !willOpen;
      dom.basemapButton.setAttribute("aria-expanded", String(willOpen));
    });
    $$(".basemap-option").forEach((button) => {
      button.addEventListener("click", () => switchBasemap(button.dataset.basemap));
      button.classList.toggle("active", button.dataset.basemap === state.currentBasemap);
    });
    $("#inspector-close").addEventListener("click", () => {
      dom.inspector.hidden = true;
    });
    $("#copy-coordinate").addEventListener("click", () => {
      if (!state.selectedLocation) return;
      copyText(
        `${state.selectedLocation[1].toFixed(6)}, ${state.selectedLocation[0].toFixed(6)}`,
        "Đã sao chép tọa độ.",
      );
    });
    $("#zoom-feature").addEventListener("click", () => {
      if (!state.selectedLocation) return;
      state.map.flyTo({
        center: state.selectedLocation,
        zoom: Math.max(state.map.getZoom(), 15),
        duration: 750,
      });
    });
    dom.sidebarToggle.addEventListener("click", openSidebar);
    $("#sidebar-close").addEventListener("click", closeSidebar);
    dom.backdrop.addEventListener("click", closeSidebar);
    document.addEventListener("keydown", (event) => {
      if (event.key === "/" && document.activeElement !== dom.search) {
        event.preventDefault();
        dom.search.focus();
      }
      if (event.key === "Escape") {
        closeSidebar();
        closeBasemapMenu();
        dom.inspector.hidden = true;
        dom.search.blur();
      }
    });
    document.addEventListener("click", (event) => {
      if (
        !dom.basemapMenu.hidden &&
        !dom.basemapMenu.contains(event.target) &&
        !dom.basemapButton.contains(event.target)
      ) {
        closeBasemapMenu();
      }
    });
  }

  function locateUser() {
    if (!navigator.geolocation) {
      showToast("Trình duyệt không hỗ trợ định vị.");
      return;
    }
    showToast("Đang xác định vị trí…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = [coords.longitude, coords.latitude];
        if (state.userMarker) state.userMarker.remove();
        const element = document.createElement("div");
        element.style.cssText =
          "width:18px;height:18px;border:4px solid white;border-radius:50%;" +
          "background:#0da6a6;box-shadow:0 0 0 8px rgb(13 166 166 / 20%),0 5px 15px rgb(0 0 0 / 25%)";
        state.userMarker = new maplibregl.Marker({ element }).setLngLat(location).addTo(state.map);
        state.map.flyTo({ center: location, zoom: 14, duration: 1000 });
        showToast(`Độ chính xác khoảng ${Math.round(coords.accuracy)} m`);
      },
      (error) => {
        const messages = {
          1: "Bạn chưa cấp quyền truy cập vị trí.",
          2: "Không thể xác định vị trí hiện tại.",
          3: "Yêu cầu định vị đã hết thời gian.",
        };
        showToast(messages[error.code] || "Định vị không thành công.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  async function initialize() {
    try {
      restorePreferences();
      const response = await fetch(APP.catalogUrl);
      if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
      state.catalog = await response.json();
      $("#metric-layers").textContent = formatNumber.format(state.catalog.counts.layers);
      $("#metric-features").textContent = formatNumber.format(state.catalog.counts.features);

      const validIds = new Set(state.catalog.layers.map((layer) => layer.id));
      state.active = new Set([...state.active].filter((id) => validIds.has(id)));
      bindUi();
      renderLayers();
      refreshIcons();
      setArchiveStatus("Đang tải PMTiles", "loading");

      const protocol = new pmtiles.Protocol();
      maplibregl.addProtocol("pmtiles", protocol.tile);
      state.map = new maplibregl.Map({
        container: "map",
        style: baseStyle(),
        center: state.catalog.center,
        zoom: 8.4,
        minZoom: 6.5,
        maxZoom: 18,
        maxBounds: [
          [104.8, 8.7],
          [107.6, 11.25],
        ],
        attributionControl: false,
        hash: true,
        cooperativeGestures: true,
        renderWorldCopies: false,
        fadeDuration: 0,
      });
      state.map.addControl(
        new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }),
        "top-right",
      );
      state.map.addControl(
        new maplibregl.AttributionControl({ compact: true, customAttribution: "MIT · Long Ngo" }),
        "bottom-right",
      );
      state.map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 110 }));

      state.map.on("load", () => {
        addThematicLayers();
        const [west, south, east, north] = state.catalog.bounds;
        state.map.fitBounds(
          [
            [west, south],
            [east, north],
          ],
          { padding: 42, duration: 0 },
        );
      });
      state.map.on("idle", () => {
        dom.mapLoading.classList.add("hidden");
        if (!state.archiveError) setArchiveStatus("PMTiles sẵn sàng");
      });
      state.map.on("error", (event) => {
        const message = event?.error?.message || "";
        if (/pmtiles|range|vinhlong-layers/i.test(message)) {
          state.archiveError = true;
          showToast("Không thể đọc kho PMTiles. Hãy tải trang qua HTTP/HTTPS.");
          setArchiveStatus("Lỗi dữ liệu", "error");
        }
        console.error("MapLibre:", event.error || event);
      });
    } catch (error) {
      console.error(error);
      setArchiveStatus("Không thể khởi tạo", "error");
      dom.mapLoading.innerHTML = `
        <div>
          <strong>Không thể khởi tạo WebGIS</strong>
          <span>${escapeHtml(error.message)}</span>
        </div>
      `;
    }
  }

  window.addEventListener("DOMContentLoaded", initialize);
})();
