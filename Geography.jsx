import React, { useEffect, useId, useRef, useState } from "react";
import L from "leaflet";
import {
  ArrowUpRight,
  Globe2,
  Info,
  Maximize2,
  Navigation,
  RotateCcw,
  Satellite,
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import "./geography.css";

// These are reference viewports, never customer or operational asset positions.
const PRESETS = [
  {
    id: "atyrau",
    label: "Atyrau · city vicinity",
    center: [47.106, 51.921],
    zoom: 10,
    note: "A city reference viewport centered near a public riverside promenade.",
    source: "https://kazakhstan.travel/en/attractions/133",
    sourceLabel: "Kazakhstan Travel",
  },
  {
    id: "astana",
    label: "Astana · city vicinity",
    center: [51.18, 71.446],
    zoom: 10,
    note: "A city reference view, not an operational asset position.",
    source: "https://www.geonames.org/kz/largest-cities-in-kazakhstan.html",
    sourceLabel: "GeoNames",
  },
  {
    id: "almaty",
    label: "Almaty · city vicinity",
    center: [43.252, 76.911],
    zoom: 10,
    note: "A city reference view, not an operational asset position.",
    source: "https://www.geonames.org/kz/largest-cities-in-kazakhstan.html",
    sourceLabel: "GeoNames",
  },
];
const INITIAL = { lat: 51.18, lng: 71.446, zoom: 10 };
const COUNTRY_VIEW_BOUNDS = [
  [40.6, 46.5],
  [55.4, 87.4],
];
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function googleView(view, satellite = false) {
  const params = new URLSearchParams({
    api: "1",
    map_action: "map",
    center: `${view.lat.toFixed(5)},${view.lng.toFixed(5)}`,
    zoom: String(Math.round(view.zoom)),
  });
  if (satellite) params.set("basemap", "satellite");
  return `https://www.google.com/maps/@?${params}`;
}

function ExternalLink({ href, children, className = "" }) {
  return (
    <a
      className={`geo-link ${className}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <ArrowUpRight size={15} aria-hidden="true" />
      <span className="geo-sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export default function Geography() {
  const host = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const helpId = useId();
  const [view, setView] = useState(INITIAL);
  const [selected, setSelected] = useState("astana");
  const [loading, setLoading] = useState(true);
  const [tileIssue, setTileIssue] = useState(false);
  const [mapIssue, setMapIssue] = useState(false);
  const [offline, setOffline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine === false,
  );
  const preset = PRESETS.find((item) => item.id === selected);
  const osmLink = `https://www.openstreetmap.org/#map=${Math.round(view.zoom)}/${view.lat.toFixed(5)}/${view.lng.toFixed(5)}`;

  useEffect(() => {
    let observer;
    let instance;
    let disposed = false;
    const failed = new Set();
    const tileKey = (event) =>
      `${event.coords.z}/${event.coords.x}/${event.coords.y}`;
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    try {
      instance = L.map(host.current, {
        center: [INITIAL.lat, INITIAL.lng],
        zoom: INITIAL.zoom,
        minZoom: 2,
        maxZoom: 19,
        zoomControl: false,
        scrollWheelZoom: false,
        worldCopyJump: true,
      });
      map.current = instance;
      L.control.zoom({ position: "topright" }).addTo(instance);
      L.control
        .scale({ position: "bottomleft", imperial: false, maxWidth: 120 })
        .addTo(instance);
      instance.attributionControl.setPrefix(
        '<a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a>',
      );
      const tiles = L.tileLayer(TILE_URL, {
        maxZoom: 19,
        keepBuffer: 1,
        updateWhenIdle: true,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
      });
      layer.current = tiles;
      tiles.on("loading", () => {
        if (!disposed) setLoading(true);
      });
      tiles.on("tileerror", (event) => {
        failed.add(tileKey(event));
        if (!disposed) setTileIssue(true);
      });
      tiles.on("tileload", (event) => {
        failed.delete(tileKey(event));
        if (!disposed) setTileIssue(failed.size > 0);
      });
      tiles.on("tileunload", (event) => {
        failed.delete(tileKey(event));
        if (!disposed) setTileIssue(failed.size > 0);
      });
      tiles.on("load", () => {
        if (!disposed) {
          setLoading(false);
          setTileIssue(failed.size > 0);
        }
      });
      tiles.addTo(instance);
      instance.on("moveend", () => {
        if (disposed) return;
        const center = instance.getCenter().wrap();
        const zoom = instance.getZoom();
        setView({ lat: center.lat, lng: center.lng, zoom });
        const match = PRESETS.find(
          (item) =>
            Math.abs(item.center[0] - center.lat) < 0.001 &&
            Math.abs(item.center[1] - center.lng) < 0.001 &&
            item.zoom === zoom,
        );
        setSelected(match?.id || "custom");
      });
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() =>
          instance.invalidateSize({ pan: false }),
        );
        observer.observe(host.current);
      }
      instance.invalidateSize({ pan: false });
    } catch {
      setMapIssue(true);
      setLoading(false);
    }

    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      instance?.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  function chooseView(id) {
    const next = PRESETS.find((item) => item.id === id);
    if (!next || !map.current) return;
    setSelected(next.id);
    map.current.setView(next.center, next.zoom, { animate: false });
  }

  function fitCountry() {
    map.current?.fitBounds(COUNTRY_VIEW_BOUNDS, {
      padding: [24, 24],
      animate: false,
    });
  }

  function retryTiles() {
    setTileIssue(false);
    setLoading(true);
    layer.current?.redraw();
  }

  return (
    <section className="geo-page geo-banking">
      <header className="geo-heading">
        <div className="geo-bank-emblem">
          <Globe2 size={27} />
        </div>
        <div>
          <span className="geo-eyebrow">QALQAN / COUNTRY CONTEXT</span>
          <h1>A sense of place.</h1>
          <p>Explore Kazakhstan's cities alongside your review workspace.</p>
        </div>
      </header>
      <div className="geo-bank-layout">
        <aside
          className="geo-city-directory"
          aria-label="City reference directory"
        >
          <div className="geo-directory-heading">
            <span className="geo-eyebrow">REFERENCE DIRECTORY</span>
            <h2>Choose a city</h2>
            <p>Public map views. No account locations.</p>
          </div>
          <div className="geo-city-list">
            {PRESETS.filter((p) =>
              ["astana", "almaty", "atyrau"].includes(p.id),
            ).map((p, i) => (
              <button
                type="button"
                key={p.id}
                className={selected === p.id ? "active" : ""}
                aria-pressed={selected === p.id}
                onClick={() => chooseView(p.id)}
                disabled={mapIssue}
              >
                <span className="geo-city-number">0{i + 1}</span>
                <span>
                  <strong>{p.label.split(" · ")[0]}</strong>
                  <small>
                    {p.center[0].toFixed(3)}° N / {p.center[1].toFixed(3)}° E
                  </small>
                </span>
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
          <button
            type="button"
            className="geo-country-button"
            onClick={fitCountry}
            disabled={mapIssue}
          >
            <Maximize2 size={15} />
            View all Kazakhstan
          </button>
          <div className="geo-privacy-note">
            <Info size={18} />
            <p>
              The transfer atlas shows account relationships. This map shows
              public geography. Neither reveals a customer's location.
            </p>
          </div>
        </aside>
        <div className="geo-bank-map-card">
          <div className="geo-map-caption">
            <span>
              <span className="geo-status-dot" />
              {mapIssue
                ? "Map unavailable"
                : offline
                  ? "Offline"
                  : tileIssue
                    ? "Some tiles unavailable"
                    : loading
                      ? "Loading basemap…"
                      : "OpenStreetMap basemap"}
            </span>
            <strong>{preset?.label.split(" · ")[0] || "Custom view"}</strong>
          </div>
          <div className="geo-map-shell">
            <div
              ref={host}
              className="geo-map"
              role="region"
              aria-label="Interactive OpenStreetMap geographic reference map"
              aria-describedby={helpId}
            />
            {mapIssue && (
              <div className="geo-map-fallback">
                <Globe2 size={32} />
                <h2>Map unavailable</h2>
                <p>Use the external map links to open this reference view.</p>
              </div>
            )}
            <div className="geo-map-stamp" aria-hidden="true">
              <Navigation size={14} />
              <span>Public geographic reference</span>
            </div>
          </div>
          <div className="geo-bank-map-footer">
            <span>
              {view.lat.toFixed(4)}°, {view.lng.toFixed(4)}°{" "}
              <small>· Zoom {Math.round(view.zoom)}</small>
            </span>
            <div>
              <ExternalLink href={googleView(view)}>Google Maps</ExternalLink>
              <ExternalLink href={googleView(view, true)}>
                <Satellite size={14} />
                Satellite
              </ExternalLink>
            </div>
          </div>
        </div>
      </div>

      {(tileIssue || offline) && !mapIssue && (
        <div className="geo-notice" role="status">
          <Info size={18} />
          <p>
            {offline
              ? "Internet access is required for map tiles."
              : "Some map tiles could not be loaded. Retry or open an external map."}
          </p>
          <button type="button" onClick={retryTiles} disabled={offline}>
            <RotateCcw size={14} /> Retry
          </button>
        </div>
      )}
      <div className="geo-bank-footnotes">
        <p id={helpId}>
          Drag the map to explore. Use + / − to zoom, or focus the map and use
          the arrow keys. Pinch to zoom on touch screens.
        </p>
        <div>
          {preset?.source && (
            <ExternalLink href={preset.source}>
              Coordinate reference
            </ExternalLink>
          )}
          <ExternalLink href={osmLink}>Open in OpenStreetMap</ExternalLink>
        </div>
      </div>
      <footer className="geo-source">
        <span>
          Map data ©{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenStreetMap contributors
          </a>
        </span>
        <ExternalLink href="https://www.openstreetmap.org/fixthemap">
          Report a map issue
        </ExternalLink>
      </footer>
    </section>
  );
}
