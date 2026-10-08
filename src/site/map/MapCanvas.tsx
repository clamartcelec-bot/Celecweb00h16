import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Minus, Plus } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPoint } from '@/site/map/mapData';
import { clusterIcon, pointIcon } from '@/site/map/mapIcons';

const PHOTO_ZOOM = 14;
const NO_CLUSTER_ZOOM = 16;
const CELL = 64;

function clusterPoints(map: L.Map, points: MapPoint[], zoom: number) {
  if (zoom >= NO_CLUSTER_ZOOM) return points.map((p) => [p]);
  const cells = new Map<string, MapPoint[]>();
  points.forEach((p) => {
    const px = map.project([p.lat, p.lng], zoom);
    const key = `${Math.floor(px.x / CELL)}:${Math.floor(px.y / CELL)}`;
    const cell = cells.get(key);
    if (cell) cell.push(p);
    else cells.set(key, [p]);
  });
  return [...cells.values()];
}

export function MapCanvas({
  points,
  selectedId,
  immersive,
  wheelHint,
  touchHint,
  onSelect,
  onVisible,
}: {
  points: MapPoint[];
  selectedId: string | null;
  immersive: boolean;
  wheelHint: string;
  touchHint: string;
  onSelect: (p: MapPoint | null) => void;
  onVisible: (points: MapPoint[]) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const pointsRef = useRef(points);
  const handlers = useRef({ onSelect, onVisible, wheelHint, touchHint });
  const [zoom, setZoom] = useState(12);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<number>();

  pointsRef.current = points;
  handlers.current = { onSelect, onVisible, wheelHint, touchHint };

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const map = L.map(el, {
      center: [48.815, 2.27],
      zoom: 12,
      minZoom: 2,
      maxZoom: 18,
      zoomSnap: 0.5,
      zoomControl: false,
      scrollWheelZoom: immersive,
      dragging: immersive || !coarse,
      wheelPxPerZoomLevel: 90,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: 'abc',
      className: 'mx-tiles',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    }).addTo(map);
    map.attributionControl.setPrefix(false);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const flash = (text: string) => {
      setHint(text);
      window.clearTimeout(hintTimer.current);
      hintTimer.current = window.setTimeout(() => setHint(null), 1600);
    };
    const report = () => {
      const bounds = map.getBounds();
      handlers.current.onVisible(pointsRef.current.filter((p) => bounds.contains([p.lat, p.lng])));
    };
    map.on('zoomend', () => setZoom(map.getZoom()));
    map.on('moveend', report);
    map.on('click', () => {
      if (!immersive && !coarse) map.scrollWheelZoom.enable();
      handlers.current.onSelect(null);
    });
    map.on('mouseout', () => { if (!immersive) map.scrollWheelZoom.disable(); });

    const onWheel = () => { if (!map.scrollWheelZoom.enabled()) flash(handlers.current.wheelHint); };
    const onTouch = (e: TouchEvent) => { if (!immersive && e.touches.length === 1) flash(handlers.current.touchHint); };
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchmove', onTouch, { passive: true });
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(el);

    return () => {
      resize.disconnect();
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchmove', onTouch);
      window.clearTimeout(hintTimer.current);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [immersive]);

  const pointsKey = points.map((p) => p.id).join(',');
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (pointsRef.current.length) {
      const bounds = L.latLngBounds(pointsRef.current.map((p) => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds, { padding: [64, 64], maxZoom: 14, animate: false });
    }
    setZoom(map.getZoom());
    map.fire('moveend');
  }, [pointsKey]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const others = points.filter((p) => p.id !== selectedId);
    const selected = points.find((p) => p.id === selectedId);
    clusterPoints(map, others, zoom).forEach((group) => {
      if (group.length === 1) {
        const p = group[0];
        L.marker([p.lat, p.lng], { icon: pointIcon(p, zoom >= PHOTO_ZOOM, false), title: p.entry.title, riseOnHover: true })
          .on('click', () => handlers.current.onSelect(p))
          .addTo(layer);
        return;
      }
      const lat = group.reduce((s, p) => s + p.lat, 0) / group.length;
      const lng = group.reduce((s, p) => s + p.lng, 0) / group.length;
      L.marker([lat, lng], { icon: clusterIcon(group), keyboard: true })
        .on('click', () => {
          const bounds = L.latLngBounds(group.map((p) => [p.lat, p.lng] as [number, number]));
          map.flyToBounds(bounds, { padding: [80, 80], maxZoom: Math.min(NO_CLUSTER_ZOOM, zoom + 3), duration: 0.7 });
        })
        .addTo(layer);
    });
    if (selected) {
      L.marker([selected.lat, selected.lng], { icon: pointIcon(selected, true, true), title: selected.entry.title, zIndexOffset: 1000 })
        .on('click', () => handlers.current.onSelect(selected))
        .addTo(layer);
    }
  }, [points, zoom, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    const p = pointsRef.current.find((x) => x.id === selectedId);
    if (!map || !p) return;
    if (map.getZoom() < PHOTO_ZOOM) map.flyTo([p.lat, p.lng], 15, { duration: 0.8 });
    else if (!map.getBounds().pad(-0.2).contains([p.lat, p.lng])) map.panTo([p.lat, p.lng]);
  }, [selectedId]);

  return (
    <div className="mx-canvas">
      <div ref={elRef} className="mx-leaflet" />
      <div className="mx-zoom">
        <button type="button" aria-label="Zoom +" onClick={() => mapRef.current?.zoomIn()}><Plus size={16} /></button>
        <button type="button" aria-label="Zoom -" onClick={() => mapRef.current?.zoomOut()}><Minus size={16} /></button>
      </div>
      <AnimatePresence>
        {hint && (
          <motion.div className="mx-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <span>{hint}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
