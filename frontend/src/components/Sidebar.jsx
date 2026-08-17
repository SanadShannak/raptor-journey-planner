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
import { validateAndTimeFormat } from "../utils/validators";
import ItineraryDetails from "./ItineraryDetails";
import { formatDateLabel } from "../utils/formatDateLabel";

const DIGITRANSIT_API_KEY = import.meta.env.VITE_DIGITRANSIT_API_KEY;

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

export default function Sidebar({
  originInput,
  setOriginInput,
  destinationInput,
  setDestinationInput,
  originLat,
  setOriginLat,
  originLon,
  setOriginLon,
  destLat,
  setDestLat,
  destLon,
  setDestLon,
  itineraryData,
  setItineraryData,
}) {
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

  const [dateDropdownMenuState, setDateDropdownMenuState] = useState(false);
  const [timeDropdownMenuState, setTimeDropdownMenuState] = useState(false);
  const [walkingSpeedMenuState, setWalkingSpeedMenuState] = useState(false);
  const [originDropdownMenuState, setOriginDropdownMenuState] = useState(false);
  const [destDropdownMenuState, setDestDropdownMenuState] = useState(false);

  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getCurrentDate());

  const [selectedTime, setSelectedTime] = useState(getCurrentTime());
  const [timeInputValue, setTimeInputValue] = useState(selectedTime);
  const [selectedWalkingSpeed, setSelectedWalkingSpeed] = useState(1.27778);

  const [isLoadingItinerary, setIsLoadingItinerary] = useState(false);
  const [itineraryError, setItineraryError] = useState(null);

  const [originDropdownOptions, setOriginDropdownOptions] = useState([]);
  const [destDropdownOptions, setDestDropdownOptions] = useState([]);

  const dateDropdownRef = useRef(null);
  const timeDropdownRef = useRef(null);
  const walkingSpeedDropdownRef = useRef(null);
  const originTimeoutRef = useRef(null);
  const destTimeoutRef = useRef(null);
  const originDropdownRef = useRef(null);
  const destDropdownRef = useRef(null);
  const originAbortControllerRef = useRef(null);
  const destAbortControllerRef = useRef(null);

  const [itineraryDetailSidebarActive, setItineraryDetailSidebarActive] =
    useState(null);

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
      if (
        originDropdownRef.current &&
        !originDropdownRef.current.contains(event.target)
      ) {
        setOriginDropdownMenuState(false);
      }
      if (
        destDropdownRef.current &&
        !destDropdownRef.current.contains(event.target)
      ) {
        setDestDropdownMenuState(false);
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
      setItineraryDetailSidebarActive(false);

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
              // console.log("Routing data error:", data.error);
              setItineraryError(data.error);
            } else {
              // console.log(
              //   `http://localhost:3000/api/route?originLat=${originLat}&originLon=${originLon}&destLat=${destLat}&destLon=${destLon}&date=${selectedDate}&time=${timeForApi}&WALKING_SPEED_MPS=${selectedWalkingSpeed}`,
              // );
              // console.log("Itinerary data from routing engine:", data);
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
      }, 750);
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
    setWalkingSpeedMenuState(false);
    setOriginDropdownMenuState(false);
    setTimeDropdownMenuState(false);
    setDestDropdownMenuState(false);
  };

  const toggleWalkingSpeedDropdown = () => {
    setWalkingSpeedMenuState((prev) => !prev);
    setOriginDropdownMenuState(false);
    setDateDropdownMenuState(false);
    setTimeDropdownMenuState(false);
    setDestDropdownMenuState(false);
  };

  const toggleTimeDropdown = () => {
    setTimeDropdownMenuState((prev) => !prev);
    setOriginDropdownMenuState(false);
    setDateDropdownMenuState(false);
    setWalkingSpeedMenuState(false);
    setDestDropdownMenuState(false);
  };

  const toggleOriginDropdown = () => {
    setOriginDropdownMenuState((prev) => !prev);
    setDateDropdownMenuState(false);
    setTimeDropdownMenuState(false);
    setWalkingSpeedMenuState(false);
    setDestDropdownMenuState(false);
  };

  const toggleDestinationDropdown = () => {
    setDestDropdownMenuState((prev) => !prev);
    setOriginDropdownMenuState(false);
    setDateDropdownMenuState(false);
    setTimeDropdownMenuState(false);
    setWalkingSpeedMenuState(false);
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

    if (type === "origin") {
      if (originAbortControllerRef.current) {
        originAbortControllerRef.current.abort();
      }
      setOriginDropdownMenuState(false);
    } else if (type === "destination") {
      if (destAbortControllerRef.current) {
        destAbortControllerRef.current.abort();
      }
      setDestDropdownMenuState(false);
    }
    try {
      const response = await fetch(
        `https://api.digitransit.fi/geocoding/v1/search?text=${encodeURIComponent(searchText)}`,
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
          setOriginDropdownMenuState(false);
        } else if (type === "destination") {
          setDestLat(lat);
          setDestLon(lon);
          setDestinationInput(formattedLabel);
          setDestDropdownMenuState(false);
        }
      }
      // else {
      //   console.log("No locations found for", searchText);
      // }
    } catch (error) {
      console.error("Geocoding failed:", error);
    }
  };

  const handleGeocodeDropdown = async (searchText, type) => {
    if (!searchText) {
      if (type === "origin") {
        if (originAbortControllerRef.current)
          originAbortControllerRef.current.abort();
        setOriginDropdownOptions([]);
        setOriginDropdownMenuState(false);
      } else {
        if (destAbortControllerRef.current)
          destAbortControllerRef.current.abort();
        setDestDropdownOptions([]);
        setDestDropdownMenuState(false);
      }
      return;
    }
    let signal = null;
    if (type === "origin") {
      if (originAbortControllerRef.current) {
        originAbortControllerRef.current.abort();
      }
      originAbortControllerRef.current = new AbortController();
      signal = originAbortControllerRef.current.signal;
    } else if (type === "destination") {
      if (destAbortControllerRef.current) {
        destAbortControllerRef.current.abort();
      }
      destAbortControllerRef.current = new AbortController();
      signal = destAbortControllerRef.current.signal;
    }

    try {
      const response = await fetch(
        `https://api.digitransit.fi/geocoding/v1/search?text=${encodeURIComponent(searchText)}`,
        {
          headers: {
            "digitransit-subscription-key": DIGITRANSIT_API_KEY,
          },
          signal,
        },
      );
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const newOptions = [];
        for (let result of data.features) {
          const [lon, lat] = result.geometry.coordinates;
          const formattedLabel = result.properties.label;
          newOptions.push({ lat: lat, lon: lon, label: formattedLabel });
        }
        if (type === "origin" && newOptions.length > 0) {
          setOriginDropdownOptions(newOptions);
          if (originDropdownMenuState !== true) {
            setOriginDropdownMenuState(true);
          }
        } else if (type === "destination" && newOptions.length > 0) {
          setDestDropdownOptions(newOptions);
          if (destDropdownMenuState !== true) {
            setDestDropdownMenuState(true);
          }
        }
      } else {
        if (type === "origin") {
          setOriginDropdownOptions([]);
          setOriginDropdownMenuState(false);
        } else {
          setDestDropdownOptions([]);
          setDestDropdownMenuState(false);
        }
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Geocoding failed:", error);
      }
    }
  };

  const handleOriginInputKeyDown = (e) => {
    if (e.key === "Enter") {
      if (originTimeoutRef.current) clearTimeout(originTimeoutRef.current);
      if (originAbortControllerRef.current)
        originAbortControllerRef.current.abort();
      handleGeocode(originInput, "origin");
      setOriginDropdownMenuState(false);
    } else {
      if (originTimeoutRef.current) {
        clearTimeout(originTimeoutRef.current);
      }
      originTimeoutRef.current = setTimeout(() => {
        if (originInput) {
          handleGeocodeDropdown(originInput, "origin");
        } else {
          setOriginDropdownOptions([]);
          setOriginDropdownMenuState(false);
        }
      }, 200);
    }
  };

  const handleDestinationInputKeyDown = (e) => {
    if (e.key === "Enter") {
      if (destTimeoutRef.current) clearTimeout(destTimeoutRef.current);
      if (destAbortControllerRef.current)
        destAbortControllerRef.current.abort();
      handleGeocode(destinationInput, "destination");
      setDestDropdownMenuState(false);
    } else {
      if (destTimeoutRef.current) {
        clearTimeout(destTimeoutRef.current);
      }
      destTimeoutRef.current = setTimeout(() => {
        if (destinationInput) {
          handleGeocodeDropdown(destinationInput, "destination");
        } else {
          setDestDropdownOptions([]);
          setDestDropdownMenuState(false);
        }
      }, 200);
    }
  };
  if (itineraryDetailSidebarActive) {
    return (
      <ItineraryDetails
        itineraryData={itineraryData}
        originName={originInput}
        destinationName={destinationInput}
        onBack={() => setItineraryDetailSidebarActive(false)}
      />
    );
  }
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
        transition-all
        duration-200
      "
    >
      <div className="px-4 sm:px-6 md:px-8 flex flex-col gap-5 shrink-0">
        <h1 className="font-sans font-medium text-xl md:text-2xl">
          Itinerary Suggestions
        </h1>

        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-2 flex-1">
            <div className="relative flex flex-col">
              <Input
                inputValue={originInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setOriginInput(val);
                  if (!val) {
                    if (originAbortControllerRef.current)
                      originAbortControllerRef.current.abort();
                    if (originTimeoutRef.current)
                      clearTimeout(originTimeoutRef.current);
                    setOriginDropdownOptions([]);
                    setOriginDropdownMenuState(false);
                  }
                }}
                onClear={() => {
                  if (originAbortControllerRef.current)
                    originAbortControllerRef.current.abort();
                  if (originTimeoutRef.current)
                    clearTimeout(originTimeoutRef.current);
                  setOriginInput("");
                  setOriginLat("");
                  setOriginLon("");
                  setOriginDropdownMenuState(false);
                  setOriginDropdownOptions([]);
                }}
                onKeyDown={handleOriginInputKeyDown}
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
              <Dropdown
                innerRef={originDropdownRef}
                dropdownMenuState={originDropdownMenuState}
                onClick={toggleOriginDropdown}
                showTrigger={false}
                className="absolute top-full left-0 w-full  z-20"
              >
                {originDropdownOptions.map((originOption, index) => {
                  const label = originOption.label;
                  return (
                    <DropdownOption
                      key={index}
                      value={label}
                      onClick={() => {
                        setOriginInput(label);
                        setOriginLat(originOption.lat);
                        setOriginLon(originOption.lon);
                        setOriginDropdownMenuState(false);
                      }}
                    />
                  );
                })}
              </Dropdown>
            </div>
            <div className="relative flex flex-col">
              <Input
                inputValue={destinationInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setDestinationInput(val);
                  if (!val) {
                    if (destAbortControllerRef.current)
                      destAbortControllerRef.current.abort();
                    if (destTimeoutRef.current)
                      clearTimeout(destTimeoutRef.current);
                    setDestDropdownOptions([]);
                    setDestDropdownMenuState(false);
                  }
                }}
                onClear={() => {
                  if (destAbortControllerRef.current)
                    destAbortControllerRef.current.abort();
                  if (destTimeoutRef.current)
                    clearTimeout(destTimeoutRef.current);
                  setDestinationInput("");
                  setDestLat("");
                  setDestLon("");
                  setDestDropdownMenuState(false);
                  setDestDropdownOptions([]);
                }}

                onKeyDown={handleDestinationInputKeyDown}
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

              <Dropdown
                innerRef={destDropdownRef}
                dropdownMenuState={destDropdownMenuState}
                onClick={toggleDestinationDropdown}
                showTrigger={false}
                className="absolute top-full left-0 w-full  z-20"
              >
                {destDropdownOptions.map((destOption, index) => {
                  const label = destOption.label;
                  return (
                    <DropdownOption
                      key={index}
                      value={label}
                      onClick={() => {
                        setDestinationInput(label);
                        setDestLat(destOption.lat);
                        setDestLon(destOption.lon);
                        setDestDropdownMenuState(false);
                      }}
                    />
                  );
                })}
              </Dropdown>
            </div>
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

            <div className="relative flex flex-col w-32" ref={timeDropdownRef}>
              <Input
                inputValue={timeInputValue}
                validator={validateAndTimeFormat}
                onChange={(e) => setTimeInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();

                    const trimmed = timeInputValue.trim();
                    const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
                    const shortRegex = /^([0-1]?[0-9]|2[0-3])([0-5][0-9])$/;

                    let finalizedTime = getCurrentTime();

                    if (timeRegex.test(trimmed)) {
                      const [h, m] = trimmed.split(":");
                      finalizedTime = `${h.padStart(2, "0")}:${m}`;
                    } else if (shortRegex.test(trimmed)) {
                      const h = trimmed.slice(0, 2);
                      const m = trimmed.slice(2);
                      finalizedTime = `${h}:${m}`;
                    }

                    setSelectedTime(finalizedTime);
                    setTimeInputValue(finalizedTime);
                    setTimeDropdownMenuState(false);

                    e.target.blur();
                  }
                }}
                onFocus={() => {
                  if (!timeDropdownMenuState) {
                    setTimeDropdownMenuState(true);
                    setDateDropdownMenuState(false);
                    setWalkingSpeedMenuState(false);
                    setOriginDropdownMenuState(false);
                    setDestDropdownMenuState(false);
                  }
                }}
                onTrailingClick={(e) => {
                  e.stopPropagation();
                  toggleTimeDropdown();
                }}
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
                className={`w-32 ${timeDropdownMenuState ? "border-sky-600 ring-1 ring-sky-600 shadow-lg" : ""}`}
              />

              <Dropdown
                innerRef={timeDropdownRef}
                dropdownMenuState={timeDropdownMenuState}
                onClick={toggleTimeDropdown}
                showTrigger={false}
                className="absolute left-0 w-full mt-1 z-20"
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
                        setTimeInputValue(value);
                        setTimeDropdownMenuState(false);
                      }}
                    />
                  );
                })}
              </Dropdown>
            </div>
          </div>
          <div className="flex flex-row items-center gap-3 pr-12 pt-2">
            <button
              type="button"
              onClick={() => {
                const nowTime = getCurrentTime();
                setSelectedTime(nowTime);
                setTimeInputValue(nowTime);
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

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
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
            {
              <ItineraryCard
                itineraryData={itineraryData}
                isSelected={true}
                onClick={() => setItineraryDetailSidebarActive(true)}
              />
            }
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
      </div>
    </div>
  );
}
