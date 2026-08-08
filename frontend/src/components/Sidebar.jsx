import Input from "./Input";
import IconX from "../icons/X";
import IconMapPin from "../icons/MapPin";
import IconOriginCircle from "../icons/OriginCircle";
import IconArrowDownUp from "../icons/ArrowDownUp";
import IconChevron from "../icons/Chevron";
import IconCalendar from "../icons/Calendar";
import IconClock from "../icons/Clock";
import { useEffect, useRef, useState } from "react";
import Dropdown from "./Dropdown";
import DropdownOption from "./DropdownOption";
import IconWalking from "../icons/Walking";
import { BarLoader } from "react-spinners";
import ItineraryCard from "./ItineraryCard";

// TODO: DELETE
const TEST_CASES = [
  {
    label: "🚢 Ferry + Walk",
    originText: "Kamppi",
    originLat: 60.1689,
    originLon: 24.9316,
    destText: "Suomenlinna",
    destLat: 60.1454,
    destLon: 24.9881,
  },
  {
    label: "🚆 Train + 🚌 Bus",
    originText: "Leppävaara",
    originLat: 60.2181,
    originLon: 24.8105,
    destText: "Helsinki Airport",
    destLat: 60.3172,
    destLon: 24.9633,
  },
  {
    label: "🚇 Metro + Walk",
    originText: "Rautatientori",
    originLat: 60.1708,
    originLon: 24.9415,
    destText: "Aalto University",
    destLat: 60.1856,
    destLon: 24.8297,
  },
  {
    label: "🚋 Tram (City Center)",
    originText: "Hakaniemi",
    originLat: 60.1793,
    originLon: 24.9513,
    destText: "West Terminal 2",
    destLat: 60.1495,
    destLon: 24.9142,
  },
  {
    label: "🚌 Long Bus Route",
    originText: "Espoon keskus",
    originLat: 60.2055,
    originLon: 24.6559,
    destText: "Itäkeskus",
    destLat: 60.21,
    destLon: 25.0828,
  },
  {
    label: "🚆 Train + 🚇 Metro",
    originText: "Pasila Station",
    originLat: 60.1984,
    originLon: 24.9333,
    destText: "Tapiola",
    destLat: 60.1748,
    destLon: 24.8055,
  },
  {
    label: "🚶 Walk Only (Short)",
    originText: "Kamppi",
    originLat: 60.1689,
    originLon: 24.9316,
    destText: "Rautatientori",
    destLat: 60.1714,
    destLon: 24.9414,
  },
];

const API_KEY = "2824640944e74c849b739e5c807c2679"; // TODO: HIDE

const TIME_OPTIONS = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    TIME_OPTIONS.push(
      `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    );
  }
}
const WALKING_SPEED_OPTIONS = [
  { description: "Slow", displaySpeed: "2.5 km/h", speedMPS: 0.694444 },
  { description: "Calm", displaySpeed: "3.5 km/h", speedMPS: 0.972222 },
  { description: "Average", displaySpeed: "4.6 km/h", speedMPS: 1.27778 },
  { description: "Fast", displaySpeed: "6.0 km/h", speedMPS: 1.66667 },
];

const getClosestTimeInterval = (timeStr) => {
  if (!timeStr) return "00:00";
  const [h, m] = timeStr.split(":").map(Number);

  const totalMinutes = h * 60 + m;
  const roundedMinutes = Math.round(totalMinutes / 15) * 15;

  let resH = Math.floor(roundedMinutes / 60);
  let resM = roundedMinutes % 60;

  if (resH === 24) resH = 0;

  return `${String(resH).padStart(2, "0")}:${String(resM).padStart(2, "0")}`;
};

export default function Sidebar() {
  const getCurrentTime = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const hhmm = `${hours}:${minutes}`;
    return hhmm;
  };

  const getCurrentDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const months = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const date = `${year}-${months}-${day}`;
    return date;
  };

  const [originInput, setOriginInput] = useState("");
  const [destinationInput, setDestinationInput] = useState("");

  const [originLat, setOriginLat] = useState("");
  const [originLon, setOriginLon] = useState("");
  const [destLat, setDestLat] = useState("");
  const [destLon, setDestLon] = useState("");

  const [dateDropdownMenuState, setDateDropdownMenuState] = useState(false);
  const [timeDropdownMenuState, setTimeDropdownMenuState] = useState(false);
  const [walkingSpeedMenuState, setWalkingSpeedMenuState] = useState(false);

  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getCurrentDate());

  const [selectedTime, setSelectedTime] = useState(getCurrentTime());
  const [selectedWalkingSpeed, setSelectedWalkingSpeed] = useState(1.27778);

  const [itineraryData, setItineraryData] = useState(null);
  const [isLoadingItinerary, setIsLoadingItinerary] = useState(false);
  const [itineraryError, setItineraryError] = useState(null);

  const dateDropdownRef = useRef(null);
  const timeDropdownRef = useRef(null);
  const walkingSpeedDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dateDropdownRef.current &&
        !dateDropdownRef.current.contains(event.target)
      ) {
        setDateDropdownMenuState(false);
      }
      if (
        timeDropdownRef.current &&
        !timeDropdownRef.current.contains(event.target)
      ) {
        setTimeDropdownMenuState(false);
      }
      if (
        walkingSpeedDropdownRef.current &&
        !walkingSpeedDropdownRef.current.contains(event.target)
      ) {
        setWalkingSpeedMenuState(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    fetch("http://localhost:3000/api/valid-dates")
      .then((res) => {
        if (!res.ok)
          throw new Error("Network error connecting to routing engine.");
        return res.json();
      })
      .then((data) => {
        setAvailableDates(data);
      })
      .catch((error) => console.error("Error fetching dates:", error));
  }, []);

  useEffect(() => {
    if (originLat && destLat) {
      setItineraryData(null);
      setIsLoadingItinerary(true);
      setItineraryError(null);

      setTimeout(() => {
        const timeForApi = `${selectedTime}:00`;

        fetch(
          `http://localhost:3000/api/route?originLat=${originLat}&originLon=${originLon}&destLat=${destLat}&destLon=${destLon}&date=${selectedDate}&time=${timeForApi}&WALKING_SPEED_MPS=${selectedWalkingSpeed}`,
        )
          .then((res) => {
            return res.json();
          })
          .then((data) => {
            if (data.errorCode) {
              console.log("Routing data error:", data.error);
              setItineraryError(data.error);
            } else {
              console.log("Itinerary data from routing engine:", data);
              setItineraryData(data);
            }
          })
          .catch((error) => {
            console.error("Error fetching itineraries:", error);
            setItineraryError("Failed to fetch route. Please try again.");
          })
          .finally(() => {
            setIsLoadingItinerary(false);
          });
      }, 500);
    }
  }, [
    originLat,
    originLon,
    destLat,
    destLon,
    selectedDate,
    selectedTime,
    selectedWalkingSpeed,
  ]);

  const toggleDateDropdown = () => {
    setDateDropdownMenuState((prev) => !prev);
    setTimeDropdownMenuState(false);
    setWalkingSpeedMenuState(false);
  };

  const toggleWalkingSpeedDropdown = () => {
    setWalkingSpeedMenuState((prev) => !prev);
    setDateDropdownMenuState(false);
    setTimeDropdownMenuState(false);
  };

  const toggleTimeDropdown = () => {
    setTimeDropdownMenuState((prev) => !prev);
    setDateDropdownMenuState(false);
    setWalkingSpeedMenuState(false);
  };

  const formatDateLabel = (dateString) => {
    if (!dateString) return "Select date";

    const [year, month, day] = dateString.split("-");
    const targetDate = new Date(year, month - 1, day);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = targetDate - today;
    const diffDays = Math.round(diffTime / (24 * 60 * 60 * 1000));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";

    // If none of the above return the date as "Sat 01/08"
    return targetDate
      .toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "numeric",
      })
      .replace(",", "/");
  };

  const formatWalkingSpeedLabel = (speedMps) => {
    const option = WALKING_SPEED_OPTIONS.find(
      (opt) => opt.speedMPS === speedMps,
    );
    return option
      ? `${option.description}: ${option.displaySpeed}`
      : "Select Speed";
  };

  const handleGeocode = async (searchText, type) => {
    if (!searchText) return;

    try {
      const response = await fetch(
        `https://api.digitransit.fi/geocoding/v1/search?text=${encodeURIComponent(searchText)}`,
        {
          headers: {
            "digitransit-subscription-key": API_KEY,
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
        console.log("No locations found for", searchText);
      }
    } catch (error) {
      console.error("Geocoding failed:", error);
    }
  };

  return (
    <div
      className="
        h-full
        w-full
        xs:w-full
        sm:w-full
        md:w-125
        lg:w-125
        xl:w-125
        shrink-0
        flex
        flex-col
        bg-white
        shadow-xl
        pt-10
        gap-5
      "
    >
      {/* Top Section Wrapper  */}
      <div className="px-4 sm:px-6 md:px-8 flex flex-col gap-5 shrink-0">
        <h1 className="font-sans font-medium text-xl md:text-2xl">
          Itinerary Suggestions
        </h1>

        {/* Origin / Destination */}
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-2 flex-1">
            <Input
              inputValue={originInput}
              onChange={(e) => setOriginInput(e.target.value)}
              onClear={() => {
                setOriginInput("");
                setOriginLat("");
                setOriginLon("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleGeocode(originInput, "origin");
                }
              }}
              leadingIcon={
                <IconOriginCircle
                  strokeWidth={2}
                  innerCircleSize="size-2 md:size-2.5"
                  className="stroke-white size-6 md:size-7"
                />
              }
              trailingIcon={
                <IconX
                  strokeWidth={2}
                  className="text-sky-600 size-6 md:size-7"
                />
              }
              placeholderText="Enter origin"
            />

            <Input
              inputValue={destinationInput}
              onChange={(e) => setDestinationInput(e.target.value)}
              onClear={() => {
                setDestinationInput("");
                setDestLat("");
                setDestLon("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleGeocode(destinationInput, "destination");
                }
              }}
              leadingIcon={
                <IconMapPin
                  strokeWidth={2}
                  className="stroke-white size-6 md:size-7"
                />
              }
              trailingIcon={
                <IconX
                  strokeWidth={2}
                  className="text-sky-600 size-6 md:size-7"
                />
              }
              placeholderText="Enter destination"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setOriginInput(destinationInput);
              setDestinationInput(originInput);
              const prevOriginLat = originLat;
              const prevOriginLon = originLon;
              setOriginLat(destLat);
              setOriginLon(destLon);
              setDestLat(prevOriginLat);
              setDestLon(prevOriginLon);
            }}
            className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition cursor-pointer"
          >
            <IconArrowDownUp
              strokeWidth={2}
              size={24}
              className="text-sky-600"
            />
          </button>
        </div>

        {/* Date / Time / Walking Speed */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-row gap-2 pr-12">
            <Dropdown
              innerRef={dateDropdownRef}
              value={formatDateLabel(selectedDate)}
              placeholder="Select date"
              dropdownMenuState={dateDropdownMenuState}
              onClick={toggleDateDropdown}
              className="flex-1"
              leadingIcon={
                <IconCalendar
                  strokeWidth={2}
                  className="text-sky-600 size-5 md:size-6"
                />
              }
              trailingIcon={
                <IconChevron
                  chevronState={dateDropdownMenuState}
                  strokeWidth={2}
                  className="text-sky-600 size-5 md:size-6"
                />
              }
            >
              {availableDates.map((dateString) => {
                const label = formatDateLabel(dateString);
                const isCurrentlySelected =
                  label === formatDateLabel(selectedDate);
                return (
                  <DropdownOption
                    key={dateString}
                    value={label}
                    isSelected={isCurrentlySelected}
                    onClick={() => {
                      setSelectedDate(dateString);
                      toggleDateDropdown();
                    }}
                  />
                );
              })}
            </Dropdown>

            <Dropdown
              innerRef={timeDropdownRef}
              value={selectedTime}
              placeholder="Select time"
              dropdownMenuState={timeDropdownMenuState}
              onClick={toggleTimeDropdown}
              className="w-32"
              leadingIcon={
                <IconClock
                  strokeWidth={2}
                  className="text-sky-600 size-5 md:size-6"
                />
              }
              trailingIcon={
                <IconChevron
                  chevronState={timeDropdownMenuState}
                  strokeWidth={2}
                  className="text-sky-600 size-5 md:size-6"
                />
              }
            >
              {TIME_OPTIONS.map((timeStr) => {
                const isExactMatch = timeStr === selectedTime;
                const isClosestMatch =
                  timeStr === getClosestTimeInterval(selectedTime);
                return (
                  <DropdownOption
                    key={timeStr}
                    value={timeStr}
                    isSelected={isExactMatch}
                    isAnchor={isClosestMatch}
                    onClick={(value) => {
                      setSelectedTime(value);
                      toggleTimeDropdown();
                    }}
                  />
                );
              })}
            </Dropdown>
          </div>
          <div className="flex flex-row items-center gap-3 pr-12 pt-2">
            <button
              type="button"
              onClick={() => {
                setSelectedTime(getCurrentTime());
                setSelectedDate(getCurrentDate());
              }}
              className="h-11 px-5 rounded-full border border-sky-600 text-sky-600 bg-white hover:bg-sky-50 font-medium text-sm md:text-base transition-colors cursor-pointer whitespace-nowrap"
            >
              Leaving now
            </button>

            <Dropdown
              innerRef={walkingSpeedDropdownRef}
              value={formatWalkingSpeedLabel(selectedWalkingSpeed)}
              placeholder="Select Walking Speed"
              dropdownMenuState={walkingSpeedMenuState}
              onClick={toggleWalkingSpeedDropdown}
              className="flex-1"
              leadingIcon={
                <IconWalking className="fill-sky-600 size-5 md:size-6" />
              }
              trailingIcon={
                <IconChevron
                  chevronState={walkingSpeedMenuState}
                  strokeWidth={2}
                  className="text-sky-600 size-5 md:size-6"
                />
              }
            >
              {WALKING_SPEED_OPTIONS.map((option) => {
                return (
                  <DropdownOption
                    key={option.speedMPS}
                    value={formatWalkingSpeedLabel(option.speedMPS)}
                    isSelected={option.speedMPS === selectedWalkingSpeed}
                    onClick={() => {
                      setSelectedWalkingSpeed(option.speedMPS);
                      toggleWalkingSpeedDropdown();
                    }}
                  />
                );
              })}
            </Dropdown>
          </div>
        </div>
      </div>
      {/* --- END TOP SECTION --- */}

      {/* Route Results Section  */}

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {/* Full-Width Separator  */}
        <div className="h-px bg-gray-200 shrink-0 mt-2"></div>
        {isLoadingItinerary ? (
          <div className="flex-1 flex flex-col items-center justify-start mt-10 gap-4">
            <BarLoader color="#0284c7" size={50} speedMultiplier={2} />
            <p className="text-gray-500 font-medium animate-pulse">
              Calculating optimal route...
            </p>
          </div>
        ) : itineraryError ? (
          <div className="flex-1 flex items-start mt-10 justify-center px-4 sm:px-6 md:px-8">
            <div className="w-full max-w-sm p-4 bg-red-50 border border-red-100 rounded-xl text-center text-red-700 shadow-sm">
              <p className="text-sm mt-1.5">{itineraryError}</p>
            </div>
          </div>
        ) : itineraryData ? (
          <div className="w-full h-30">
            {<ItineraryCard itineraryData={itineraryData} isSelected={true} />}
          </div>
        ) : (
          <div className="flex-1 flex items-start mt-10 justify-center px-4 sm:px-6 md:px-8">
            <div className="w-full max-w-sm p-4  bg-gray-50 border border-gray-100 rounded-xl text-center text-gray-600 shadow-sm">
              <p className="text-sm mt-1.5">
                Enter an origin and destination to see itinerary suggestions.
              </p>
            </div>
          </div>
        )}
        {/* --- START TEST BUTTONS (BOTTOM) --- */} {/*TODO: DELETE */}
        {/* mt-auto pushes this firmly to the bottom of the scroll container */}
        <div className="px-4 sm:px-6 md:px-8 pb-8 pt-4 mt-auto shrink-0">
          <div className="flex flex-col gap-3 p-4 bg-amber-50/50 border border-amber-200/50 rounded-xl">
            <span className="text-[11px] font-bold text-amber-700/80 uppercase tracking-wider flex justify-between items-center">
              Dev Tools: Quick Load Routes
              <button
                type="button"
                onClick={() => {
                  setOriginInput("");
                  setDestinationInput("");
                  setOriginLat("");
                  setOriginLon("");
                  setDestLat("");
                  setDestLon("");
                  setItineraryData(null);
                }}
                className="text-red-500 hover:text-red-700 transition-colors"
              >
                Clear All
              </button>
            </span>
            <div className="flex flex-wrap gap-2">
              {TEST_CASES.map((tc, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => {
                    setOriginInput(tc.originText);
                    setDestinationInput(tc.destText);
                    setOriginLat(tc.originLat);
                    setOriginLon(tc.originLon);
                    setDestLat(tc.destLat);
                    setDestLon(tc.destLon);
                  }}
                  className="px-3 py-1.5 bg-white border border-amber-300 text-amber-800 text-xs rounded-md hover:bg-amber-100 hover:border-amber-400 transition-colors shadow-sm"
                >
                  {tc.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* --- END TEST BUTTONS --- */}
      </div>
    </div>
  );
}
