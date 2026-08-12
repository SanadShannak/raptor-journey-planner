import IconChevron from "../icons/Chevron";
import IconClock from "../icons/Clock";
import IconWalking from "../icons/Walking";

import { convertMetersToDistance } from "../utils/convertMetersToDistance";
import { convertMinutesToDuration } from "../utils/convertMinutesToDuration";
import { formatItineraryTime } from "../utils/formatItineraryTime";
import ItineraryDetailLegCard from "../components/ItineraryDetailLegCard";

const getTotalItineraryWalkingTime = (itineraryData) => {
  let totalWalkingTime = 0;
  itineraryData.legs.forEach((leg) => {
    totalWalkingTime += leg.walkDurationMinutes;
  });
  return totalWalkingTime;
};

const getTotalItineraryWalkingDistance = (itineraryData) => {
  let totalWalkingDistance = 0;
  itineraryData.legs.forEach((leg) => {
    totalWalkingDistance += leg.walkDistanceMeters;
  });
  return totalWalkingDistance;
};

const getTotalItineraryDistance = (itineraryData) => {
  let totalDistance = 0;
  itineraryData.legs.forEach((leg) => {
    totalDistance +=
      leg.mode === "TRANSIT"
        ? leg.transitDistanceMeters
        : leg.walkDistanceMeters;
  });
  return totalDistance;
};

export default function ItineraryDetails({
  itineraryData,
  originName,
  destinationName,
  onBack,
}) {
  const timeDisplayString = formatItineraryTime(
    itineraryData.startDate,
    itineraryData.startTime,
    itineraryData.endDate,
    itineraryData.endTime,
  );

  return (
    <div className="h-full w-full xs:w-full sm:w-full md:w-125 lg:w-125 xl:w-125 shrink-0 flex flex-col bg-white shadow-xl  overflow-y-auto overflow-x-hidden transition-all duration-200 items-center py-10">
      {/* Header */}
      <div className="px-5 pb-5 flex flex-row items-center gap-4 w-full">
        <IconChevron
          onClick={onBack}
          className="rotate-90 size-5 text-[#0074C0] cursor-pointer shrink-0 stroke-[3px]"
        />
        <h1 className="font-sans font-bold text-[22px] text-[#1A1A1A]">
          Itinerary Details
        </h1>
      </div>
      <div className="w-8/10">
        {/* Time & Walking Summary */}
        <div className="border-t border-b border-[#E5E5E5] py-3.5 px-3 flex flex-row items-center gap-8 justify-between">
          <div className="flex flex-row gap-3 items-start">
            <IconClock className="size-5.5 text-[#1A1A1A] mt-0.5 shrink-0" />
            <div className="flex flex-col leading-tight gap-0.5">
              <span className="text-[15px] font-bold text-[#1A1A1A]">
                {convertMinutesToDuration(itineraryData.totalDurationMinutes)}
              </span>
              <span className="text-[13px] text-[#777777] font-normal">
                {timeDisplayString}
              </span>
            </div>
          </div>
          {getTotalItineraryWalkingTime(itineraryData) > 0 && (
            <div className="flex flex-row gap-3 items-start">
              <IconWalking className="size-6 text-[#1A1A1A] shrink-0" />
              <div className="flex flex-col leading-tight gap-0.5">
                <span className="text-[15px] font-bold text-[#1A1A1A]">
                  {convertMinutesToDuration(
                    getTotalItineraryWalkingTime(itineraryData),
                  )}
                </span>
                <span className="text-[13px] text-[#777777] font-normal">
                  {convertMetersToDistance(
                    getTotalItineraryWalkingDistance(itineraryData),
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Timeline List */}
        <div className="flex flex-col w-full pt-1">
          {itineraryData.legs.map((leg, index) => {
            const previousLeg =
              index > 0 ? itineraryData.legs[index - 1] : null;
            const isFirstLeg = index === 0;
            const isLastLeg = index === itineraryData.legs.length - 1;

            return (
              <ItineraryDetailLegCard
                key={index}
                leg={leg}
                previousLeg={previousLeg}
                isFirstLeg={isFirstLeg}
                isLastLeg={isLastLeg}
                originName={originName}
                destinationName={destinationName}
              />
            );
          })}
        </div>

        {/* Footer Totals */}
        <div className="mx-5 mt-2 pt-4 border-t-2 border-[#EAEAEA] flex items-center justify-between">
          <div className="text-[14px] text-[#555555]">
            Total distance:{" "}
            <span className="text-[#1A1A1A] font-bold">
              {convertMetersToDistance(
                getTotalItineraryDistance(itineraryData),
              )}
            </span>
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-[12px] text-[#777777]  mt-5 mx-5 mb-4 leading-snug">
          Please note that the results are based on estimated travel times. The
          suggested transport connections cannot be guaranteed.
        </p>
      </div>
    </div>
  );
}
