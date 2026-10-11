const AppError = require("../utils/AppError");
const User = require("../models/User");
const describeLine = require("../utils/describeLine");
const describeStop = require("../utils/describeStop");
const { resolveLine, resolveVariant } = require("../utils/resolveRoute");
const resolveStop = require("../utils/resolveStop");

const getUserSavedStops = async (req, res) => {
  const user = req.user;
  return res.status(200).json({ data: user.savedStops });
};

const addUserSavedStop = async (req, res) => {
  const userId = req.user._id;
  const { stopId } = req.params;
  const { nickname } = req.body;

  const internalStopId = resolveStop(stopId);
  if (internalStopId === undefined)
    throw new AppError(404, "STOP_NOT_FOUND", "Stop ID missing or not found.");

  const describedStop = describeStop(internalStopId);

  let formattedNickname = nickname?.trim();

  const user = await User.findById(userId).select("-password");

  if (user.savedStops.some((s) => s.stopId === stopId)) {
    throw new AppError(400, "ALREADY_SAVED", "This stop is already saved.");
  }

  if (user.savedStops.length >= 5) {
    throw new AppError(422, "SAVED_LIMIT_REACHED", "Limit of maximum 5 saved stops per user reached.");
  }

  if (formattedNickname) {
    const nicknameExists = user.savedStops.some(
      (s) => s.nickname?.toLowerCase() === formattedNickname.toLowerCase(),
    );
    if (nicknameExists) {
      throw new AppError(400, "DUPLICATE_NICKNAME", "Another saved stop already has this nickname.");
    }
  } else {
    formattedNickname = describedStop.name;
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      $push: { savedStops: { stopId: stopId, nickname: formattedNickname } },
    },
    { returnDocument: "after", select: "-password" },
  );

  return res
    .status(201)
    .json({ message: "Stop saved successfully", data: updatedUser });
};

const changeUserSavedStopNickname = async (req, res) => {
  const userId = req.user._id;
  const { itemId } = req.params;
  const { nickname } = req.body;

  let formattedNickname = nickname?.trim();
  if (!formattedNickname)
    throw new AppError(400, "EMPTY_NICKNAME", "Nickname cannot be empty.");

  const user = await User.findById(userId).select("-password");

  const stop = user.savedStops.find((s) => s._id.toString() === itemId);
  if (!stop)
    throw new AppError(404, "SAVED_ITEM_NOT_FOUND", "Saved stop not found.");

  // Exact, so a change of case alone ("home" → "Home") is saved.
  if (formattedNickname === stop.nickname) {
    return res
      .status(200)
      .json({ message: "Same nickname provided. Unchanged.", data: user });
  }

  const nicknameExists = user.savedStops.some(
    (s) =>
      s._id.toString() !== itemId &&
      s.nickname?.toLowerCase() === formattedNickname.toLowerCase(),
  );
  if (nicknameExists) {
    throw new AppError(400, "DUPLICATE_NICKNAME", "Another saved stop already has this nickname.");
  }

  const updatedUser = await User.findOneAndUpdate(
    { _id: userId, "savedStops._id": itemId },
    { $set: { "savedStops.$.nickname": formattedNickname } },
    { returnDocument: "after", select: "-password" },
  );

  return res.status(200).json({
    message: "Stop nickname changed successfully",
    data: updatedUser,
  });
};

const removeUserSavedStop = async (req, res) => {
  const userId = req.user._id;
  const { itemId } = req.params;

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $pull: { savedStops: { _id: itemId } } },
    { returnDocument: "after", select: "-password" },
  );

  return res
    .status(200)
    .json({ message: "Stop removed successfully", data: updatedUser });
};

const getUserSavedRoutes = async (req, res) => {
  const user = req.user;
  return res.status(200).json({ data: user.savedRoutes });
};

const addUserSavedRoute = async (req, res) => {
  const userId = req.user._id;
  const { lineId, patternId } = req.params;
  const numPatternId = Number(patternId);
  const { nickname } = req.body;

  const line = resolveLine(lineId);
  if (!line) throw new AppError(404, "LINE_NOT_FOUND", "Line not found.");

  const variant = resolveVariant(line, numPatternId);
  if (!variant)
    throw new AppError(404, "VARIANT_NOT_FOUND", "Variant not found on this line.");

  const describedLine = describeLine(line);
  let formattedNickname = nickname?.trim();

  const user = await User.findById(userId).select("-password");

  const routeExists = user.savedRoutes.some(
    (r) => r.lineId === lineId && r.patternId === numPatternId,
  );
  if (routeExists) {
    throw new AppError(400, "ALREADY_SAVED", "This route is already saved.");
  }

  if (user.savedRoutes.length >= 5) {
    throw new AppError(422, "SAVED_LIMIT_REACHED", "Limit of maximum 5 saved routes per user reached.");
  }

  if (formattedNickname) {
    const nicknameExists = user.savedRoutes.some(
      (s) => s.nickname?.toLowerCase() === formattedNickname.toLowerCase(),
    );
    if (nicknameExists) {
      throw new AppError(400, "DUPLICATE_NICKNAME", "Another saved route already has this nickname.");
    }
  } else {
    formattedNickname = `${variant.route.long_name}${variant.route.direction_id !== undefined ? ` Direction: ${variant.route.direction_id}` : ""}`;
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      $push: {
        savedRoutes: {
          nickname: formattedNickname,
          lineId: lineId,
          patternId: numPatternId,
          routeShortName: describedLine.routeShortName,
          routeLongName: describedLine.routeLongName,
        },
      },
    },
    { returnDocument: "after", select: "-password" },
  );
  return res
    .status(201)
    .json({ message: "Route saved successfully", data: updatedUser });
};

const changeUserSavedRouteNickname = async (req, res) => {
  const userId = req.user._id;
  const { itemId } = req.params;
  const { nickname } = req.body;

  let formattedNickname = nickname?.trim();
  if (!formattedNickname)
    throw new AppError(400, "EMPTY_NICKNAME", "Nickname cannot be empty.");

  const user = await User.findById(userId).select("-password");

  const route = user.savedRoutes.find((r) => r._id.toString() === itemId);
  if (!route)
    throw new AppError(404, "SAVED_ITEM_NOT_FOUND", "Saved route not found.");

  // Exact, so a change of case alone ("home" → "Home") is saved.
  if (formattedNickname === route.nickname) {
    return res
      .status(200)
      .json({ message: "Same nickname provided. Unchanged.", data: user });
  }

  const nicknameExists = user.savedRoutes.some(
    (r) =>
      r._id.toString() !== itemId &&
      r.nickname?.toLowerCase() === formattedNickname.toLowerCase(),
  );
  if (nicknameExists) {
    throw new AppError(400, "DUPLICATE_NICKNAME", "Another saved route already has this nickname.");
  }

  const updatedUser = await User.findOneAndUpdate(
    { _id: userId, "savedRoutes._id": itemId },
    { $set: { "savedRoutes.$.nickname": formattedNickname } },
    { returnDocument: "after", select: "-password" },
  );

  return res.status(200).json({
    message: "Route nickname changed successfully",
    data: updatedUser,
  });
};

const removeUserSavedRoute = async (req, res) => {
  const userId = req.user._id;
  const { itemId } = req.params;

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $pull: { savedRoutes: { _id: itemId } } },
    { returnDocument: "after", select: "-password" },
  );

  return res
    .status(200)
    .json({ message: "Route removed successfully", data: updatedUser });
};

const getUserSavedItineraries = async (req, res) => {
  const user = req.user;
  return res.status(200).json({ data: user.savedItineraries });
};

const addUserSavedItinerary = async (req, res) => {
  const userId = req.user._id;

  const {
    originLat,
    originLon,
    originLabel,
    destLat,
    destLon,
    destLabel,
    nickname,
    pace = "average",
  } = req.body;

  let formattedNickname = nickname?.trim();
  let formattedOriginLabel = originLabel?.trim() || "Point A";
  let formattedDestLabel = destLabel?.trim() || "Point B";

  const user = await User.findById(userId).select("-password");

  const itineraryExists = user.savedItineraries.some(
    (i) =>
      i.origin.lat === originLat &&
      i.origin.lon === originLon &&
      i.destination.lat === destLat &&
      i.destination.lon === destLon &&
      i.pace === pace,
  );
  if (itineraryExists) {
    throw new AppError(400, "ALREADY_SAVED", "This itinerary is already saved.");
  }

  if (user.savedItineraries.length >= 5) {
    throw new AppError(422, "SAVED_LIMIT_REACHED", "Limit of maximum 5 saved itineraries per user reached.");
  }

  if (formattedNickname) {
    const nicknameExists = user.savedItineraries.some(
      (i) => i.nickname?.toLowerCase() === formattedNickname.toLowerCase(),
    );
    if (nicknameExists) {
      throw new AppError(400, "DUPLICATE_NICKNAME", "Another saved itinerary already has this nickname.");
    }
  } else {
    formattedNickname = "My Saved Itinerary";
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      $push: {
        savedItineraries: {
          origin: {
            label: formattedOriginLabel,
            lat: originLat,
            lon: originLon,
          },
          destination: {
            label: formattedDestLabel,
            lat: destLat,
            lon: destLon,
          },
          pace: pace,
          nickname: formattedNickname,
        },
      },
    },
    { returnDocument: "after", select: "-password" },
  );
  return res
    .status(201)
    .json({ message: "Itinerary saved successfully", data: updatedUser });
};

const changeUserSavedItineraryNickname = async (req, res) => {
  const userId = req.user._id;
  const { itemId } = req.params;
  const { nickname } = req.body;

  let formattedNickname = nickname?.trim();
  if (!formattedNickname)
    throw new AppError(400, "EMPTY_NICKNAME", "Nickname cannot be empty.");

  const user = await User.findById(userId).select("-password");

  const itinerary = user.savedItineraries.find(
    (i) => i._id.toString() === itemId,
  );
  if (!itinerary)
    throw new AppError(404, "SAVED_ITEM_NOT_FOUND", "Saved itinerary not found.");

  // Exact, so a change of case alone ("home" → "Home") is saved.
  if (formattedNickname === itinerary.nickname) {
    return res
      .status(200)
      .json({ message: "Same nickname provided. Unchanged.", data: user });
  }

  const nicknameExists = user.savedItineraries.some(
    (i) =>
      i._id.toString() !== itemId &&
      i.nickname?.toLowerCase() === formattedNickname.toLowerCase(),
  );

  if (nicknameExists) {
    throw new AppError(400, "DUPLICATE_NICKNAME", "Another saved itinerary already has this nickname.");
  }

  const updatedUser = await User.findOneAndUpdate(
    { _id: userId, "savedItineraries._id": itemId },
    { $set: { "savedItineraries.$.nickname": formattedNickname } },
    { returnDocument: "after", select: "-password" },
  );

  return res.status(200).json({
    message: "Itinerary nickname changed successfully",
    data: updatedUser,
  });
};

const removeUserSavedItinerary = async (req, res) => {
  const userId = req.user._id;
  const { itemId } = req.params;

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $pull: { savedItineraries: { _id: itemId } } },
    { returnDocument: "after", select: "-password" },
  );

  return res
    .status(200)
    .json({ message: "Itinerary removed successfully", data: updatedUser });
};

module.exports = {
  getUserSavedStops,
  addUserSavedStop,
  changeUserSavedStopNickname,
  removeUserSavedStop,
  getUserSavedRoutes,
  addUserSavedRoute,
  changeUserSavedRouteNickname,
  removeUserSavedRoute,
  getUserSavedItineraries,
  addUserSavedItinerary,
  changeUserSavedItineraryNickname,
  removeUserSavedItinerary,
};
