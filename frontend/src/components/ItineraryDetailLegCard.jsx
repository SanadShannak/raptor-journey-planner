import { useEffect, useState } from "react";
import IconMapPin from "../icons/MapPin";
import IconOriginCircle from "../icons/OriginCircle";
import IconChevron from "../icons/Chevron";
import IconWait from "../icons/Wait";

import { convertMinutesToDuration } from "../utils/convertMinutesToDuration";
import { convertMetersToDistance } from "../utils/convertMetersToDistance";
import { getTransportModeConfig } from "../utils/transitStyles";

const getLocationNameAndDetail = (fullName) => {
  if (!fullName) return [];
  return fullName
    .split(",")
    .map((item) => {
      return item
        .trim()
        .toLowerCase()
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    })
    .filter(Boolean);
};

export default function ItineraryDetailLegCard({
  leg,
  previousLeg,
  isFirstLeg,
  isLastLeg,
  originName,
  destinationName,
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isWalk = leg.mode === "WALK";
  const hasWait = leg.waitDurationMinutes > 0;
  const modeConfig = getTransportModeConfig(leg);
  const ModeIcon = modeConfig.icon;

  const getHexColor = (bgClass) => {
    const match = bgClass?.match(/\[(.*?)\]/);
    return match ? match[1] : "#0074C0";
  };

  const getLegThemeColor = (targetLeg) => {
    if (!targetLeg) return "#B2B2B2";
    if (targetLeg.mode === "WALK") return "#B2B2B2";
    const config = getTransportModeConfig(targetLeg);
    return getHexColor(config.bgColor);
  };

  const currentThemeColor = getLegThemeColor(leg);
  const previousThemeColor = getLegThemeColor(previousLeg);

  const intermediateStops = leg.intermediateStops || [];
  const hasIntermediateStops = intermediateStops.length > 0;

  // Origin Name & Detail Processing
  const originParts = getLocationNameAndDetail(originName);
  const originTitle =
    isFirstLeg && leg.fromStop.name === "ORIGIN" && originParts.length > 0
      ? originParts[0]
      : leg.fromStop.name || "Origin";
  const originSubtitle =
    isFirstLeg && originParts.length > 1
      ? originParts.slice(1).join(", ")
      : null;

  // Destination Name & Detail Processing
  const destinationParts = getLocationNameAndDetail(destinationName);
  const destinationTitle =
    isLastLeg &&
    (leg.toStop.name === "TARGET" || leg.toStop.name === "ORIGIN") &&
    destinationParts.length > 0
      ? destinationParts[0]
      : leg.toStop.name || "Target";
  const destinationSubtitle =
    isLastLeg && destinationParts.length > 1
      ? destinationParts.slice(1).join(", ")
      : null;

  return (
    <div className="flex flex-col w-full font-sans">
      <div className="flex flex-row w-full items-stretch min-h-13">
        <div className="w-14 shrink-0 text-[15px] font-bold text-[#1A1A1A] text-right pr-2.5 pt-3 h-6 leading-6">
          {leg.startTime}
        </div>

        <div className="w-8 shrink-0 relative self-stretch">
          {!isFirstLeg && (
            <div
              className={`absolute top-0 h-6 z-0 ${
                previousLeg.mode === "WALK"
                  ? "w-0 border-l-[3.5px] border-dotted border-[#B2B2B2] left-1/2 translate-x-[-1.75px]"
                  : "w-1.5 left-1/2 -translate-x-1/2"
              }`}
              style={
                previousLeg.mode !== "WALK"
                  ? { backgroundColor: previousThemeColor }
                  : {}
              }
            />
          )}

          <div
            className={`absolute top-6 bottom-0 z-0 ${
              isWalk || hasWait
                ? "w-0 border-l-[3.5px] border-dotted border-[#B2B2B2] left-1/2 translate-x-[-1.75px] "
                : "w-1.5 left-1/2 -translate-x-1/2"
            }`}
            style={
              !isWalk && !hasWait ? { backgroundColor: currentThemeColor } : {}
            }
          />

          <div className="absolute top-6 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-white rounded-full flex items-center justify-center p-0.5">
            {isFirstLeg ? (
              <IconOriginCircle
                className="size-7 stroke-white"
                innerCircleSize="size-2.5"
              />
            ) : (
              <div
                className="w-4 h-4 rounded-full border-[3.5px] bg-white"
                style={{
                  borderColor:
                    previousThemeColor !== "#B2B2B2"
                      ? previousThemeColor
                      : hasWait
                        ? "#B2B2B2"
                        : currentThemeColor,
                }}
              />
            )}
          </div>
        </div>

        <div className="flex-1 pl-4 pt-3 pb-3 border-b border-[#EAEAEA] flex flex-col">
          <div className="flex items-center h-6">
            <span className="font-bold text-[#1A1A1A] text-[16px] leading-tight">
              {originTitle}
            </span>
          </div>

          {originSubtitle ? (
            <div>
              <span className="text-[12px] font-medium text-[#666666]">
                {originSubtitle}
              </span>
            </div>
          ) : leg.fromStop.code && !isFirstLeg ? (
            <div className="mt-1">
              <span className="text-[11px] font-semibold text-[#555555] bg-[#F4F4F4] border border-[#E0E0E0] rounded px-2 py-px tracking-tight inline-block">
                {leg.fromStop.code}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {hasWait && (
        <>
          <div className="flex flex-row w-full items-stretch min-h-12">
            <div className="w-14 shrink-0" />
            <div className="w-8 shrink-0 relative self-stretch">
              <div className="absolute top-0 bottom-0 z-0 w-0 border-l-[3.5px] border-dotted border-[#B2B2B2] left-1/2 translate-x-[-1.75px]" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-white py-1 px-0.5">
                <IconWait className="size-5 text-[#666666]" />
              </div>
            </div>
            <div className="flex-1 pl-4  border-b border-[#EAEAEA] flex items-center py-8">
              <span className="text-[15px] text-[#333333] font-medium">
                Wait ({convertMinutesToDuration(leg.waitDurationMinutes)})
              </span>
            </div>
          </div>

          <div className="flex flex-row w-full items-stretch min-h-13">
            <div className="w-14 shrink-0 text-[15px] font-bold text-[#1A1A1A] text-right pr-2.5 pt-3 h-6 leading-6">
              {leg.startTime}
            </div>

            <div className="w-8 shrink-0 relative self-stretch">
              <div className="absolute top-0 h-6 z-0 w-0 border-l-[3.5px] border-dotted border-[#B2B2B2] left-1/2 translate-x-[-1.75px]" />
              <div
                className="absolute top-6 bottom-0 z-0 w-1.5 left-1/2 -translate-x-1/2"
                style={{ backgroundColor: currentThemeColor }}
              />
              <div className="absolute top-6 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-white rounded-full flex items-center justify-center p-0.5">
                <div
                  className="w-4 h-4 rounded-full border-[3.5px] bg-white"
                  style={{ borderColor: currentThemeColor }}
                />
              </div>
            </div>

            <div className="flex-1 pl-4 pt-3 pb-3 border-b border-[#EAEAEA] flex flex-col">
              <div className="flex items-center h-6">
                <span className="font-bold text-[#1A1A1A] text-[16px] leading-tight">
                  {originTitle}
                </span>
              </div>
              {leg.fromStop.code && (
                <div className="mt-1">
                  <span className="text-[11px] font-semibold text-[#555555] bg-[#F4F4F4] border border-[#E0E0E0] rounded px-2 py-px tracking-tight inline-block">
                    {leg.fromStop.code}
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div
        className={`flex flex-row w-full items-stretch ${
          isWalk ? "min-h-18" : "min-h-14"
        }`}
      >
        <div className="w-14 shrink-0" />

        <div className="w-8 shrink-0 relative self-stretch">
          <div
            className={`absolute top-0 bottom-0 z-0 ${
              isWalk
                ? "w-0 border-l-[3.5px] border-dotted border-[#B2B2B2] left-1/2 translate-x-[-1.75px]"
                : "w-1.5 left-1/2 -translate-x-1/2"
            }`}
            style={!isWalk ? { backgroundColor: currentThemeColor } : {}}
          />
          {isWalk && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-white py-1 px-0.5">
              <ModeIcon className="size-6 text-[#555555]" />
            </div>
          )}
        </div>

        <div
          className={`flex-1 pl-4 border-b border-[#EAEAEA] flex items-center ${
            isWalk ? "py-5" : "py-4"
          }`}
        >
          {isWalk ? (
            <div className="text-[15px] text-[#333333] font-medium leading-relaxed">
              Walk {convertMinutesToDuration(leg.walkDurationMinutes)} (
              {convertMetersToDistance(leg.walkDistanceMeters)})
            </div>
          ) : (
            <div className="flex flex-col gap-3.5 w-full">
              <div className="flex items-center gap-3">
                <div
                  className="text-white text-[14px] font-bold px-2.5 py-1 rounded flex items-center gap-3 shrink-0"
                  style={{ backgroundColor: currentThemeColor }}
                >
                  <ModeIcon className="size-4.5 text-white" />
                  <span>{leg.routeShortName}</span>
                </div>
                <span className="text-[15px] text-[#333333] font-normal truncate">
                  {leg.toStop.name}
                </span>
              </div>

              {hasIntermediateStops && (
                <div className="mt-2">
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-1.5 w-fit cursor-pointer text-left group"
                  >
                    <span
                      className="font-bold text-[14px] group-hover:underline"
                      style={{ color: currentThemeColor }}
                    >
                      {intermediateStops.length} stops
                    </span>
                    <span className="text-[14px] text-[#555555] font-normal">
                      ({convertMinutesToDuration(leg.transitDurationMinutes)})
                    </span>
                    <IconChevron
                      className={`size-4 transition-transform duration-200 ml-0.5`}
                      chevronState={isExpanded}
                      style={{ color: currentThemeColor }}
                    />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {hasIntermediateStops && isExpanded && (
        <div className="flex flex-col w-full">
          {intermediateStops.map((stop, idx) => (
            <div key={idx} className="flex flex-row w-full items-start min-h-9">
              <div className="w-14 shrink-0" />
              <div className="w-8 shrink-0 flex flex-col items-center justify-start relative self-stretch">
                <div
                  className="absolute top-0 bottom-0 w-1.5 left-1/2 -translate-x-1/2 z-0"
                  style={{ backgroundColor: currentThemeColor }}
                />
                <div
                  className="z-10 size-2.5 rounded-full bg-white border-2 mt-2.5"
                  style={{ borderColor: currentThemeColor }}
                />
              </div>
              <div className="flex-1 pl-4 pt-1.5 pb-2 flex items-center gap-2">
                <span className="text-[14px] font-bold text-[#1A1A1A]">
                  {stop.stopArrivalTime}
                </span>
                <span className="text-[14px] font-semibold text-[#1A1A1A]">
                  {stop.stopName}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {isLastLeg && (
        <div className="flex flex-row w-full items-stretch min-h-13">
          <div className="w-14 shrink-0 text-[15px] font-bold text-[#1A1A1A] text-right pr-2.5 pt-3 h-6 leading-6">
            {leg.endTime}
          </div>
          <div className="w-8 shrink-0 relative self-stretch">
            <div
              className={`absolute top-0 h-6 z-0 ${
                isWalk
                  ? "w-0 border-l-[3.5px] border-dotted border-[#B2B2B2] left-1/2 translate-x-[-1.75px]"
                  : "w-1.5 left-1/2 -translate-x-1/2"
              }`}
              style={!isWalk ? { backgroundColor: currentThemeColor } : {}}
            />
            <div className="absolute top-6 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-white rounded-full flex items-center justify-center p-0.5">
              <IconMapPin className="size-7 stroke-white" />
            </div>
          </div>
          <div className="flex-1 pl-4 pt-3 pb-3 flex flex-col">
            <div className="flex items-center h-6">
              <span className="font-bold text-[#1A1A1A] text-[16px] leading-tight">
                {destinationTitle}
              </span>
            </div>
            {destinationSubtitle && (
              <div>
                <span className="text-[12px] font-medium text-[#666666]">
                  {destinationSubtitle}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
