const User = require("../models/User");
const describeLine = require("../utils/describeLine");
const describeStop = require("../utils/describeStop");
const { resolveLine, resolveVariant } = require("../utils/resolveRoute");
const resolveStop = require("../utils/resolveStop");

const getUserSavedStops = async (req, res) => {
  try {
    const user = req.user;
    return res.status(200).json({ data: user.savedStops });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const addUserSavedStop = async (req, res) => {
  try {
    const userId = req.user._id;
    const { stopId } = req.params;
    const { nickname } = req.body;

    const internalStopId = resolveStop(stopId);
    if (internalStopId === undefined)
      return res.status(404).json({ error: "Stop ID missing or not found." });

    const describedStop = describeStop(internalStopId);

    let formattedNickname = nickname?.trim();

    const user = await User.findById(userId).select("-password");

    if (user.savedStops.some((s) => s.stopId === stopId)) {
      return res.status(400).json({ message: "This stop is already saved." });
    }

    if (user.savedStops.length >= 5) {
      return res
        .status(422)
        .json({ message: "Limit of maximum 5 saved stops per user reached." });
    }

    if (formattedNickname) {
      const nicknameExists = user.savedStops.some(
        (s) => s.nickname?.toLowerCase() === formattedNickname.toLowerCase(),
      );
      if (nicknameExists) {
        return res
          .status(400)
          .json({ message: "Another saved stop already has this nickname." });
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
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const changeUserSavedStopNickname = async (req, res) => {
  try {
    const userId = req.user._id;
    const { itemId } = req.params;
    const { nickname } = req.body;

    let formattedNickname = nickname?.trim();
    if (!formattedNickname)
      return res.status(400).json({ message: "Nickname cannot be empty." });

    const user = await User.findById(userId).select("-password");

    const stop = user.savedStops.find((s) => s._id.toString() === itemId);
    if (!stop)
      return res.status(404).json({ message: "Saved stop not found." });

    if (formattedNickname.toLowerCase() === stop.nickname?.toLowerCase()) {
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
      return res
        .status(400)
        .json({ message: "Another saved stop already has this nickname." });
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
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const removeUserSavedStop = async (req, res) => {
  try {
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
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const getUserSavedRoutes = async (req, res) => {
  try {
    const user = req.user;
    return res.status(200).json({ data: user.savedRoutes });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const addUserSavedRoute = async (req, res) => {
  try {
    const userId = req.user._id;
    const { lineId, patternId } = req.params;
    const numPatternId = Number(patternId);
    const { nickname } = req.body;

    const line = resolveLine(lineId);
    if (!line) return res.status(404).json({ message: "Line not found." });

    const variant = resolveVariant(line, numPatternId);
    if (!variant)
      return res
        .status(404)
        .json({ message: "Variant not found on this line." });

    const describedLine = describeLine(line);
    let formattedNickname = nickname?.trim();

    const user = await User.findById(userId).select("-password");

    const routeExists = user.savedRoutes.some(
      (r) => r.lineId === lineId && r.patternId === numPatternId,
    );
    if (routeExists) {
      return res.status(400).json({ message: "This route is already saved." });
    }

    if (user.savedRoutes.length >= 5) {
      return res
        .status(422)
        .json({ message: "Limit of maximum 5 saved routes per user reached." });
    }

    if (formattedNickname) {
      const nicknameExists = user.savedRoutes.some(
        (s) => s.nickname?.toLowerCase() === formattedNickname.toLowerCase(),
      );
      if (nicknameExists) {
        return res
          .status(400)
          .json({ message: "Another saved route already has this nickname." });
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
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const changeUserSavedRouteNickname = async (req, res) => {
  try {
    const userId = req.user._id;
    const { itemId } = req.params;
    const { nickname } = req.body;

    let formattedNickname = nickname?.trim();
    if (!formattedNickname)
      return res.status(400).json({ message: "Nickname cannot be empty." });

    const user = await User.findById(userId).select("-password");

    const route = user.savedRoutes.find((r) => r._id.toString() === itemId);
    if (!route)
      return res.status(404).json({ message: "Saved route not found." });

    if (formattedNickname.toLowerCase() === route.nickname?.toLowerCase()) {
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
      return res
        .status(400)
        .json({ message: "Another saved route already has this nickname." });
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
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const removeUserSavedRoute = async (req, res) => {
  try {
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
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const getUserSavedItineraries = async (req, res) => {
  try {
    const user = req.user;
    return res.status(200).json({ data: user.savedItineraries });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const addUserSavedItinerary = async (req, res) => {
  try {
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
      return res
        .status(400)
        .json({ message: "This itinerary is already saved." });
    }

    if (user.savedItineraries.length >= 5) {
      return res.status(422).json({
        message: "Limit of maximum 5 saved itineraries per user reached.",
      });
    }

    if (formattedNickname) {
      const nicknameExists = user.savedItineraries.some(
        (i) => i.nickname?.toLowerCase() === formattedNickname.toLowerCase(),
      );
      if (nicknameExists) {
        return res.status(400).json({
          message: "Another saved itinerary already has this nickname.",
        });
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
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const changeUserSavedItineraryNickname = async (req, res) => {
  try {
    const userId = req.user._id;
    const { itemId } = req.params;
    const { nickname } = req.body;

    let formattedNickname = nickname?.trim();
    if (!formattedNickname)
      return res.status(400).json({ message: "Nickname cannot be empty." });

    const user = await User.findById(userId).select("-password");

    const itinerary = user.savedItineraries.find(
      (i) => i._id.toString() === itemId,
    );
    if (!itinerary)
      return res.status(404).json({ message: "Saved itinerary not found." });

    if (formattedNickname.toLowerCase() === itinerary.nickname?.toLowerCase()) {
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
      return res.status(400).json({
        message: "Another saved itinerary already has this nickname.",
      });
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
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const removeUserSavedItinerary = async (req, res) => {
  try {
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
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
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
