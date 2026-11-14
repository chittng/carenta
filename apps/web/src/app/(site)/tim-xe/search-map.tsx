'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { SearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';

import { CarCard } from '@/components/cars/car-card';
import { Button } from '@/components/ui/button';
import { searchAround, type SearchCenter } from '@/lib/car-search';
import {
  type CarSearchQuery,
  type CarSearchResult,
  formatVnd,
  SEARCH_RADIUS_DEFAULT_KM,
} from '@carenta/shared';

export default function SearchMap({
  cars,
  query,
  onSearch,
}: {
  cars: CarSearchResult[];
  query: CarSearchQuery;
  onSearch: (center: SearchCenter) => void;
}) {
  const [tileError, setTileError] = useState(false);
  return (
    <section
      className="relative isolate overflow-hidden rounded-xl border"
      aria-label="Bản đồ xe cho thuê"
    >
      <MapContainer
        center={[16.047, 108.206]}
        zoom={5}
        scrollWheelZoom={false}
        className="z-0 h-[60dvh] min-h-96 w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="https://www.hotosm.org/">HOT</a>, <a href="https://openstreetmap.fr/">OSM France</a>'
          url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
          subdomains="abc"
          maxZoom={19}
          eventHandlers={{
            tileerror: () => setTileError(true),
            tileload: () => setTileError(false),
          }}
        />
        <SearchCamera query={query} cars={cars} />
        <MapSearchControl
          key={`${query.lat},${query.lng},${query.radiusKm}`}
          query={query}
          onSearch={onSearch}
        />
        {query.lat !== undefined && query.lng !== undefined && (
          <Circle
            center={[query.lat, query.lng]}
            radius={(query.radiusKm ?? SEARCH_RADIUS_DEFAULT_KM) * 1000}
            pathOptions={{ color: '#2563eb', weight: 1, dashArray: '6 6', fillOpacity: 0.02 }}
            interactive={false}
          />
        )}
        {cars.map((car) => (
          <CarMarker key={car.id} car={car} />
        ))}
      </MapContainer>
      {tileError && (
        <output className="absolute right-2 bottom-7 left-2 rounded-lg border bg-background/95 p-2 text-xs text-muted-foreground">
          Chưa tải được nền bản đồ. Bạn vẫn có thể xem xe trong danh sách bên dưới.
        </output>
      )}
    </section>
  );
}

function SearchCamera({ query, cars }: { query: CarSearchQuery; cars: CarSearchResult[] }) {
  const map = useMap();
  useEffect(() => {
    // A selected radius remains visible; changing sort or opening a popup must not reveal
    // or request any more precise location than the public API supplies.
    if (query.lat !== undefined && query.lng !== undefined) {
      // Circle.getBounds() needs a mounted layer; LatLng.toBounds() also works before
      // Leaflet has added any layers, including on a direct shared-link visit.
      const bounds = L.latLng(query.lat, query.lng).toBounds(
        (query.radiusKm ?? SEARCH_RADIUS_DEFAULT_KM) * 2000,
      );
      map.fitBounds(bounds, { padding: [24, 24], animate: false });
    } else if (cars.length > 0) {
      map.fitBounds(
        L.latLngBounds(cars.map((car) => [car.location.latitude, car.location.longitude])),
        { padding: [45, 45], maxZoom: 12, animate: false },
      );
    }
  }, [map, query.lat, query.lng, query.radiusKm, cars]);
  return null;
}

function MapSearchControl({
  query,
  onSearch,
}: {
  query: CarSearchQuery;
  onSearch: (center: SearchCenter) => void;
}) {
  const [center, setCenter] = useState<SearchCenter | null>(null);
  const map = useMapEvents({
    dragend: () => {
      const point = map.getCenter();
      setCenter({ latitude: point.lat, longitude: point.lng });
    },
  });
  if (!center) return null;
  const valid = searchAround(query, center) !== null;
  return (
    <div className="absolute top-3 right-3 left-12 z-[1000] flex justify-center">
      <Button
        type="button"
        className="h-11 max-w-full shadow-md"
        disabled={!valid}
        onClick={(event) => {
          event.stopPropagation();
          onSearch(center);
        }}
      >
        {valid ? (
          <>
            <SearchIcon aria-hidden />
            Tìm quanh đây ({query.radiusKm ?? SEARCH_RADIUS_DEFAULT_KM} km)
          </>
        ) : (
          'Chọn vị trí trong Việt Nam'
        )}
      </Button>
    </div>
  );
}

function CarMarker({ car }: { car: CarSearchResult }) {
  const position: L.LatLngTuple = [car.location.latitude, car.location.longitude];
  const price = formatVnd(car.prices.dailyEquivalentPrice);
  const icon = L.divIcon({
    className: '',
    html: `<span style="display:block;box-sizing:border-box;text-align:center;white-space:nowrap;border:1px solid #2563eb;border-radius:999px;background:white;color:#1e40af;padding:6px 10px;font:600 12px sans-serif;box-shadow:0 2px 6px #0002">${price}</span>`,
    iconSize: [110, 30],
    iconAnchor: [55, 15],
  });
  return (
    <>
      <Circle
        center={position}
        radius={car.location.radiusMeters}
        pathOptions={{ color: '#2563eb', weight: 1, fillOpacity: 0.06 }}
        interactive={false}
      />
      <Marker
        position={position}
        icon={icon}
        title={`${car.make.name} ${car.model.name}: ${price} / ngày`}
      >
        <Popup minWidth={256} maxWidth={280}>
          <CarCard car={car} compact />
        </Popup>
      </Marker>
    </>
  );
}
