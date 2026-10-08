import L from 'leaflet';
import { KIND_COLORS, MAP_KINDS, isWorksite, type MapKind, type MapPoint } from '@/site/map/mapData';
import { coverOf } from '@/site/types';

const escapeAttr = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const coneSvg = (color: string, size = 18) => `
<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M10.3 3.2c.4-1.2 3-1.2 3.4 0l5.6 16.3H4.7z" fill="${color}"/>
  <path d="M8.6 8.4h6.8l1.1 3.3H7.5zM6.8 13.7h10.4l1.1 3.2H5.7z" fill="#fff" opacity=".92"/>
  <rect x="2.5" y="19.2" width="19" height="2.6" rx="1.3" fill="${color}"/>
</svg>`;

function plotHtml(kind: MapKind, selected: boolean) {
  const color = KIND_COLORS[kind];
  const head = isWorksite(kind)
    ? `<span class="mk-cone">${coneSvg(color, 22)}</span>`
    : `<span class="mk-head" style="--k:${color}"></span>`;
  return `<span class="mk-plot${selected ? ' is-selected' : ''}" style="--k:${color}">${head}<span class="mk-stem"></span><span class="mk-ground"></span></span>`;
}

function photoHtml(point: MapPoint, selected: boolean) {
  const color = KIND_COLORS[point.kind];
  const src = coverOf(point.entry);
  const badge = isWorksite(point.kind) ? `<span class="mk-badge mk-badge--cone">${coneSvg(color, 14)}</span>` : `<span class="mk-badge" style="--k:${color}"></span>`;
  const img = src ? `<img src="${escapeAttr(src)}" alt="" loading="lazy" decoding="async"/>` : '<span class="mk-noimg"></span>';
  return `<span class="mk-photo${selected ? ' is-selected' : ''}" style="--k:${color}">${img}${badge}<span class="mk-tail"></span></span>`;
}

export function pointIcon(point: MapPoint, asPhoto: boolean, selected: boolean) {
  if (asPhoto) {
    return L.divIcon({ className: 'mk', html: photoHtml(point, selected), iconSize: [56, 66], iconAnchor: [28, 66] });
  }
  return L.divIcon({ className: 'mk', html: plotHtml(point.kind, selected), iconSize: [26, 34], iconAnchor: [13, 32] });
}

export function clusterIcon(points: MapPoint[]) {
  const total = points.length;
  let acc = 0;
  const stops = MAP_KINDS.flatMap((kind) => {
    const n = points.filter((p) => p.kind === kind).length;
    if (!n) return [];
    const from = (acc / total) * 360;
    acc += n;
    return [`${KIND_COLORS[kind]} ${from}deg ${(acc / total) * 360}deg`];
  });
  const size = total < 10 ? 40 : total < 30 ? 48 : 56;
  return L.divIcon({
    className: 'mk',
    html: `<span class="mk-cluster" style="--ring:conic-gradient(${stops.join(',')});width:${size}px;height:${size}px"><b>${total}</b></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
