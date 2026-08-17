import { getTransportModeConfig, getWaitConfig } from "../utils/transitStyles";
import { convertMinutesToDuration } from "../utils/convertMinutesToDuration";
import ItineraryCardLegBar from "./ItineraryCardLegBar";
import { Fragment } from "react";
import IconChevron from "../icons/Chevron";
import { formatItineraryTime } from "../utils/formatItineraryTime";

export default function ItineraryCard({
  itineraryData,
  isSelected,
  onClick,
  ...props
}) {
  let itineraryHasTransit = false;
  let firstTransitDepartureTime = null;
  let firstTransitDepartureStationName = null;

  for (let leg of itineraryData.legs) {
    if (leg.mode === "TRANSIT") {
      firstTransitDepartureTime = leg.startTime;
      firstTransitDepartureStationName = leg.fromStop.name;
      itineraryHasTransit = true;
      break;
    }
  }

  const timeDisplayString = formatItineraryTime(
    itineraryData.startDate,
    itineraryData.startTime,
    itineraryData.endDate,
    itineraryData.endTime,
  );

  return (
    <div
      className="relative flex w-full h-full justify-center hover:bg-gray-200/40 transition-all duration-200 ease-out items-center cursor-pointer"
      onClick={onClick}
    >
      {isSelected ? (
        <span className="absolute top-1/2 -translate-y-1/2 left-0 border-l-6 h-7/10 border-l-sky-600"></span>
      ) : null}
      <div className="flex flex-col flex-1 ml-8 mr-4 gap-2 justify-around w-8/10 h-full py-3 border-b-2 border-gray-400/50 overflow-hidden">
        <div className="flex justify-between">
          <div className="text-lg md:text-base font-semibold text-gray-700">
            {timeDisplayString}
          </div>
          <div className="text-lg md:text-base font-semibold text-gray-700">
            {convertMinutesToDuration(itineraryData.totalDurationMinutes)}
          </div>
        </div>
        <div className="flex w-full h-full overflow-hidden gap-1 min-h-9">
          {itineraryData.legs.map((leg, index) => {
            const { bgColor, border, icon, iconColor, textColor } =
              getTransportModeConfig(leg);
            const isTransit = leg.mode === "WALK" ? false : true;
            const legDurationMinutes = isTransit
              ? leg.transitDurationMinutes
              : leg.walkDurationMinutes;

            const legPercentage =
              (legDurationMinutes / itineraryData.totalDurationMinutes) * 100;

            if (leg.waitDurationMinutes > 0) {
              const waitPercentage =
                (leg.waitDurationMinutes / itineraryData.totalDurationMinutes) *
                100;

              if (waitPercentage > 5) {
                const waitConfig = getWaitConfig();
                return (
                  <Fragment key={index}>
                    <ItineraryCardLegBar
                      widthPercentage={waitPercentage}
                      bgColor={waitConfig.bgColor}
                      border={waitConfig.border}
                      icon={waitConfig.icon}
                      iconColor={waitConfig.iconColor}
                      textColor={waitConfig.textColor}
                      text={leg.waitDurationMinutes}
                      isTransit={false}
                    />
                    <ItineraryCardLegBar
                      widthPercentage={legPercentage}
                      bgColor={bgColor}
                      border={border}
                      icon={icon}
                      iconColor={iconColor}
                      textColor={textColor}
                      text={
                        isTransit ? leg.routeShortName : leg.walkDurationMinutes
                      }
                      isTransit={isTransit}
                    />
                  </Fragment>
                );
              }
            }

            if (isTransit || legPercentage > 5) {
              return (
                <ItineraryCardLegBar
                  key={index}
                  widthPercentage={legPercentage}
                  bgColor={bgColor}
                  border={border}
                  icon={icon}
                  iconColor={iconColor}
                  textColor={textColor}
                  text={
                    isTransit ? leg.routeShortName : leg.walkDurationMinutes
                  }
                  isTransit={isTransit}
                />
              );
            }
          })}
        </div>

        {itineraryHasTransit ? (
          <div className="text-xs md:text-sm font-light text-gray-700 h-full truncate">
            Departs at{" "}
            <span className="font-semibold">{firstTransitDepartureTime}</span>{" "}
            from {""}
            <span>{firstTransitDepartureStationName}</span> station
          </div>
        ) : (
          <div className="text-[13px] md:text-base font-light text-gray-700">
            Leave when it suits you.
          </div>
        )}
      </div>
      <div className="flex items-center justify-center">
        <IconChevron
          chevronState={true}
          className="text-sky-600 rotate-270 mr-4 size-8 md:size-8"
        />
      </div>
    </div>
  );
}
