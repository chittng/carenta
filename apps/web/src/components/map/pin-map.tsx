'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** A CSS pin: Leaflet's default marker images do not survive bundling. */
const pinIcon = L.divIcon({
  className: '',
  html: '<span style="display:block;width:28px;height:28px;border-radius:50% 50% 50% 0;background:#2563eb;border:3px solid #fff;box-shadow:0 2px 6px rgb(0 0 0/.35);transform:rotate(-45deg)"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

function FollowPosition({ position }: { position: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView([position.latitude, position.longitude], Math.max(map.getZoom(), 16));
  }, [map, position]);
  return null;
}

function ClickToPlace({ onChange }: { onChange: (position: LatLng) => void }) {
  useMapEvents({
    click: (event) => onChange({ latitude: event.latlng.lat, longitude: event.latlng.lng }),
  });
  return null;
}

/**
 * OpenStreetMap with one draggable pin; tapping the map moves it too (spec §14: Leaflet +
 * OpenStreetMap). Loaded only in the browser through `PinMapLazy`.
 */
export default function PinMap({
  position,
  fallbackCenter,
  onChange,
}: {
  position: LatLng | null;
  /** Where to look before a pin is placed. */
  fallbackCenter: LatLng;
  onChange: (position: LatLng) => void;
}) {
  const center = position ?? fallbackCenter;
  const marker = useRef<L.Marker>(null);
  return (
    <MapContainer
      center={[center.latitude, center.longitude]}
      zoom={position ? 16 : 12}
      scrollWheelZoom={false}
      className="z-0 h-72 w-full rounded-lg border"
    >
      {/* OpenStreetMap tiles in the Humanitarian style, served by OpenStreetMap France (no key,
          fair use). tile.openstreetmap.org discourages app traffic and some networks block it.
          A production tile provider is chosen with the deployment (CARENTA-57). */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="https://www.hotosm.org/">HOT</a>, <a href="https://openstreetmap.fr/">OSM France</a>'
        url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
        subdomains="abc"
        maxZoom={19}
      />
      <FollowPosition position={position} />
      <ClickToPlace onChange={onChange} />
      {position && (
        <Marker
          ref={marker}
          position={[position.latitude, position.longitude]}
          icon={pinIcon}
          draggable
          eventHandlers={{
            dragend: () => {
              const point = marker.current?.getLatLng();
              if (point) onChange({ latitude: point.lat, longitude: point.lng });
            },
          }}
        />
      )}
    </MapContainer>
  );
}
