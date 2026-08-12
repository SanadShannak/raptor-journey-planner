import { useEffect, useState, Fragment } from "react";
import {
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
  Polyline,
  Marker,
  Popup,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getTransportModeConfig } from "../utils/transitStyles";
import { renderToString } from "react-dom/server";
import IconOriginCircle from "../icons/OriginCircle";
import IconMapPin from "../icons/MapPin";

const MAPTILER_API_KEY = import.meta.env.VITE_MAPTILER_API_KEY;
const DIGITRANSIT_API_KEY = import.meta.env.VITE_DIGITRANSIT_API_KEY;

function RouteBounds({ points }) {
  const map = useMap();

  useEffect(() => {
    if (points && points.length > 0) {
      map.fitBounds(points, {
        padding: [20, 20],
        maxZoom: 20,
      });
    }
  }, [map, points]);

  return null;
}

function getHexColor(colorClass) {
  const match =
    colorClass?.match(/\[#(.*?)\]/) || colorClass?.match(/\[(.*?)\]/);
  return match
    ? match[1].startsWith("#")
      ? match[1]
      : `#${match[1]}`
    : "#0284c7";
}

const originIconHtml = renderToString(
  <IconOriginCircle
    strokeWidth={2}
    innerCircleSize="size-2 md:size-2.5"
    className="stroke-white size-7 drop-shadow-md"
  />,
);
const originIcon = new L.divIcon({
  html: originIconHtml,
  className: "bg-transparent",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

const destIconHtml = renderToString(
  <IconMapPin strokeWidth={2} className="stroke-white size-8 drop-shadow-md" />,
);
const destIcon = new L.divIcon({
  html: destIconHtml,
  className: "bg-transparent",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const createStationIcon = (color) => {
  const html = renderToString(
    <div
      className="w-4 h-4 rounded-full border-[3.5px] bg-white shadow-md"
      style={{ borderColor: color }}
    />,
  );
  return new L.divIcon({
    html: html,
    className: "bg-transparent",
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
};

export default function MapView({
  itineraryData,
  setOriginLat,
  setOriginLon,
  setDestLat,
  setDestLon,
  setOriginInput,
  setDestinationInput,
}) {
  const defaultPosition = [60.1695, 24.9354];
  const mapBounds = [
    [59.547988648544, 22.120551030851594],
    [61.02939657171681, 27.03921788018682],
  ];

  function getItineraryFullShape(itineraryData) {
    const fullShape = [];
    for (const leg of itineraryData.legs) {
      for (const point of leg.shape) {
        fullShape.push(point);
      }
    }
    return fullShape;
  }

  async function handleGeocode(selectedLat, selectedLon, type) {
    if (!selectedLat || !selectedLon) return;

    try {
      const response = await fetch(
        `https://api.digitransit.fi/geocoding/v1/reverse?point.lat=${selectedLat}&point.lon=${selectedLon}`,
        {
          headers: {
            "digitransit-subscription-key": DIGITRANSIT_API_KEY,
          },
        },
      );

      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const topResult = data.features[0];
        const [lon, lat] = topResult.geometry.coordinates;
        const formattedLabel = topResult.properties.label;

        if (type === "origin") {
          setOriginLat(lat);
          setOriginLon(lon);
          setOriginInput(formattedLabel);
        } else if (type === "destination") {
          setDestLat(lat);
          setDestLon(lon);
          setDestinationInput(formattedLabel);
        }
      } else {
        console.log("No locations found for", selectedLat, ", ", selectedLon);
      }
    } catch (error) {
      console.error("Geocoding failed:", error);
    }
  }

  function MapClickHandler({
    setOriginLat,
    setOriginLon,
    setDestLat,
    setDestLon,
  }) {
    const [clickedCoord, setClickedCoord] = useState(null);

    useMapEvents({
      click(e) {
        setClickedCoord(e.latlng);
      },
    });

    if (!clickedCoord) return null;

    return (
      <Popup position={clickedCoord} onClose={() => setClickedCoord(null)}>
        <div
          className="flex flex-col gap-2 p-1 min-w-35"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span className="text-xs font-bold text-gray-700 border-b pb-1">
            Selected Location
          </span>
          <button
            className="bg-[#4FA701] hover:bg-[#408802] text-white text-xs font-semibold py-1.5 px-2 rounded transition shadow-sm cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              handleGeocode(clickedCoord.lat, clickedCoord.lng, "origin");
              setClickedCoord(null);
            }}
          >
            Set as Origin
          </button>
          <button
            className="bg-[#EC5188] hover:bg-[#b03862] text-white text-xs font-semibold py-1.5 px-2 rounded transition shadow-sm cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              handleGeocode(clickedCoord.lat, clickedCoord.lng, "destination");
              setClickedCoord(null);
            }}
          >
            Set as Destination
          </button>
        </div>
      </Popup>
    );
  }

  const createLegBadgeIcon = (leg, config) => {
    const isTransit = leg.mode === "TRANSIT";
    const durationMinutes = isTransit
      ? leg.transitDurationMinutes
      : leg.walkDurationMinutes;

    const IconComponent = config.icon;

    const htmlString = renderToString(
      <div
        className={`flex items-center min-w-fit ${isTransit ? "gap-2 px-2.5" : "gap-1 px-1.5 "} py-1 rounded-md shadow-md ${config.textColor} ${isTransit ? config.bgColor : "bg-white/50"} font-semibold text-xs whitespace-nowrap border border-white/30`}
      >
        <div className="w-4 h-4 flex items-center justify-center">
          <IconComponent className={`w-full h-full ${config.iconColor} `} />
        </div>
        <span>
          {isTransit ? `${leg.routeShortName}` : `${durationMinutes} min`}
        </span>
      </div>,
    );

    return new L.divIcon({
      html: htmlString,
      className: "bg-transparent ",
      iconAnchor: [35, 15],
    });
  };

  return (
    <MapContainer
      className="h-full w-full"
      center={defaultPosition}
      zoom={14}
      minZoom={9}
      maxBounds={mapBounds}
      maxBoundsViscosity={1.0}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url={`https://api.maptiler.com/maps/base-v4/{z}/{x}/{y}.png?key=${MAPTILER_API_KEY}`}
        maxZoom={19}
      />

      <MapClickHandler
        setOriginLat={setOriginLat}
        setOriginLon={setOriginLon}
        setDestLat={setDestLat}
        setDestLon={setDestLon}
      />

      {itineraryData ? (
        <RouteBounds points={getItineraryFullShape(itineraryData)} />
      ) : null}

      {itineraryData
        ? itineraryData.legs.map((leg, index) => {
            const config = getTransportModeConfig(leg);
            const bgHexColor = getHexColor(config.bgColor);
            const isTransit = leg.mode !== "WALK";

            const midPoint =
              leg.shape && leg.shape.length > 0
                ? leg.shape[Math.floor(leg.shape.length / 2)]
                : null;
            const badgeIcon = createLegBadgeIcon(leg, config);

            const stationColor = isTransit ? bgHexColor : "#B2B2B2";
            const stationIcon = createStationIcon(stationColor);

            return (
              <Fragment key={index}>
                {index === 0 && leg.fromStop && (
                  <Marker
                    position={[leg.fromStop.lat, leg.fromStop.lon]}
                    icon={originIcon}
                  >
                    <Popup>
                      <div className="text-xs font-semibold">
                        {leg.fromStop.name}
                      </div>
                    </Popup>
                  </Marker>
                )}

                {index > 0 && leg.fromStop && (
                  <Marker
                    position={[leg.fromStop.lat, leg.fromStop.lon]}
                    icon={stationIcon}
                  >
                    <Popup>
                      <div className="text-xs font-semibold">
                        {leg.fromStop.name}{" "}
                        {leg.fromStop.code ? `(${leg.fromStop.code})` : ""}
                      </div>
                    </Popup>
                  </Marker>
                )}

                {index === itineraryData.legs.length - 1 && leg.toStop && (
                  <Marker
                    position={[leg.toStop.lat, leg.toStop.lon]}
                    icon={destIcon}
                  >
                    <Popup>
                      <div className="text-xs font-semibold">
                        {leg.toStop.name}
                      </div>
                    </Popup>
                  </Marker>
                )}

                {isTransit ? (
                  midPoint && (
                    <Marker
                      position={midPoint}
                      icon={badgeIcon}
                      zIndexOffset={1000}
                    />
                  )
                ) : (
                  <Marker
                    position={leg.shape[0]}
                    icon={badgeIcon}
                    zIndexOffset={1000}
                  />
                )}

                {isTransit ? (
                  <>
                    <Polyline
                      positions={leg.shape}
                      pathOptions={{
                        color: "#ffffff",
                        weight: 8,
                        opacity: 0.9,
                      }}
                    />
                    <Polyline
                      positions={leg.shape}
                      pathOptions={{
                        color: bgHexColor,
                        weight: 7,
                        opacity: 1,
                      }}
                    />
                  </>
                ) : (
                  <Polyline
                    positions={leg.shape}
                    pathOptions={{
                      color: "#666666",
                      weight: 4,
                      opacity: 1.8,
                      dashArray: "6, 8",
                    }}
                  />
                )}
              </Fragment>
            );
          })
        : null}
    </MapContainer>
  );
}
