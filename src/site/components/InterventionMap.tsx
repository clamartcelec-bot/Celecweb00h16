import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CityGroup, Theme } from '@/site/types';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function InterventionMap({
  cityGroups,
  theme,
  onCityClick,
  selectedCity,
  interactive = true,
}: {
  cityGroups: CityGroup[];
  theme: Theme;
  onCityClick?: (city: string) => void;
  selectedCity?: string | null;
  interactive?: boolean;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, {
      center: [48.82, 2.3],
      zoom: 11,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
      dragging: interactive,
    });
    if (interactive) L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapInstance.current = map;
    return () => { map.remove(); mapInstance.current = null; };
  }, [interactive]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    map.eachLayer((l) => { if (l instanceof L.TileLayer) map.removeLayer(l); });
    const tileUrl = theme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    L.tileLayer(tileUrl, { maxZoom: 18 }).addTo(map);
  }, [theme]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    cityGroups.forEach((g) => {
      const isSelected = selectedCity === g.city;
      const r = Math.max(8, Math.min(30, 6 + g.count * 3));
      const marker = L.circleMarker([g.lat, g.lng], {
        radius: isSelected ? r + 4 : r,
        fillColor: '#e8336a',
        fillOpacity: isSelected ? 0.75 : 0.28,
        color: '#e8336a',
        weight: isSelected ? 3 : 1.5,
      }).addTo(map);
      marker.bindTooltip(`<strong>${escapeHtml(g.city)}</strong><br/>${g.count} photo${g.count > 1 ? 's' : ''}`, {
        direction: 'top',
        className: 's-map-tooltip',
      });
      marker.on('click', () => onCityClick?.(g.city));
      markersRef.current.push(marker);
    });
  }, [cityGroups, theme, onCityClick, selectedCity]);

  return <div ref={mapRef} className="s-leaflet" />;
}
