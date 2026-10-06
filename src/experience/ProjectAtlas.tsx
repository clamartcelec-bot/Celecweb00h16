import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, MapPin } from 'lucide-react';
import L from 'leaflet';
import type { SiteProject } from './HomeExperience';
import { presentToGuide } from './events';

interface Props {
  projects: SiteProject[];
  onProject: (project: SiteProject) => void;
  onExpand: (city?: string) => void;
}

/** Geographic project entry points, rather than a decorative map behind the hero. */
export function ProjectAtlas({ projects, onProject, onExpand }: Props) {
  const mapNode = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const selected = projects.find(p => p.id === selectedId);

  useEffect(() => {
    if (!mapNode.current) return;
    const instance = L.map(mapNode.current, {
      center: [48.82, 2.27], zoom: 11, zoomControl: false,
      scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false,
      dragging: !L.Browser.mobile, keyboard: false,
      attributionControl: true,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18, attribution: '© OpenStreetMap · CARTO',
    }).addTo(instance);
    map.current = instance;
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(mapNode.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const located = projects.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && (p.lat !== 0 || p.lng !== 0));
    // Keep the overview legible; a city marker represents the first documented project there.
    const firstByCity = new Map<string, SiteProject>();
    located.forEach(p => { const key = p.city || `${p.lat},${p.lng}`; if (!firstByCity.has(key)) firstByCity.set(key, p); });
    const cities = [...firstByCity.values()].slice(0, 18);
    const layer = L.layerGroup().addTo(instance);
    cities.forEach(p => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ce-atlas-pin';
      button.setAttribute('aria-label', `Voir les projets à ${p.city || 'cet endroit'}`);
      const image = document.createElement('img');
      if (p.image_url) image.src = p.image_url;
      image.alt = '';
      image.onerror = () => image.remove();
      const dot = document.createElement('span');
      if (p.image_url) button.append(image);
      button.append(dot);
      const show = () => {
        setSelectedId(p.id);
        presentToGuide({ title: `Projet à ${p.city}`, description: p.title });
      };
      button.addEventListener('mouseenter', show);
      button.addEventListener('focus', show);
      button.addEventListener('click', event => { event.stopPropagation(); show(); });
      L.marker([p.lat!, p.lng!], {
        icon: L.divIcon({ className: 'ce-atlas-marker', html: button, iconSize: [38, 38], iconAnchor: [19, 19] }),
        keyboard: false,
      }).addTo(layer);
    });
    if (cities.length) instance.fitBounds(L.latLngBounds(cities.map(p => [p.lat!, p.lng!])), { padding: [38, 45], maxZoom: 11, animate: false });
    return () => { layer.remove(); };
  }, [projects]);

  return <div className="ce-atlas" role="region" aria-label="Carte interactive des projets">
    <div className="ce-atlas-canvas" ref={mapNode} />
    <div className="ce-atlas-preview" aria-live="polite">
      <AnimatePresence mode="wait">
        {selected ? <motion.button key={selected.id} className="ce-atlas-project" initial={{ opacity: 0, y: reduced ? 0 : 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={() => onProject(selected)}>
          <img src={selected.image_url} alt="" /><span><small>{selected.city}</small><strong>{selected.title}</strong></span><ArrowRight size={15} />
        </motion.button> : <span className="ce-atlas-hint"><MapPin size={13} /> Touchez un repère, découvrez un projet.</span>}
      </AnimatePresence>
    </div>
    <button className="ce-atlas-expand" onClick={() => onExpand(selected?.city)}><MapPin size={16} /><span>{selected ? `Tous les projets à ${selected.city}` : 'Nos projets sur la carte'}</span><ArrowRight size={16} /></button>
  </div>;
}
