module.exports = {
  //To switch networks, just change this string to whatever city/network you want to use the parsing pipeline with, for example, 'hsl'->'amman'
  ACTIVE_NETWORK: "hsl",

  // Structural rules & requirements for ingesting data
  rules: {
    requiredFiles: [
      "stops.txt",
      "routes.txt",
      "stop_times.txt",
      "trips*.txt",
      "calendar.txt",
      "calendar_dates.txt",
    ],
    requiredStopHeaders: ["stop_id", "stop_name", "stop_lat", "stop_lon"],
    requiredRouteHeaders: ["route_id", "route_short_name"],
    requiredTripHeaders: ["route_id", "trip_id","service_id"],
    requiredStopTimesHeaders: [
      "trip_id",
      "stop_id",
      "arrival_time",
      "departure_time",
    ],
    requiredCalendarDatesHeaders: ["service_id", "date", "exception_type"],
    requiredCalendarHeaders: [
      "service_id",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
      "start_date",
      "end_date",
    ],
  },
};
