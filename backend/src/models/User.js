const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },

    savedStops: [
      {
        nickname: { type: String, default: "" },
        stopId: { type: String, required: true },
        savedOn: { type: Date, default: Date.now },
      },
    ],
    savedRoutes: [
      {
        nickname: { type: String, default: "" },
        lineId: String,
        patternId: Number,
        routeShortName: String,
        routeLongName: String,
        savedOn: { type: Date, default: Date.now },
      },
    ],
    savedItineraries: [
      {
        nickname: { type: String, default: "" },
        origin: { label: String, lat: Number, lon: Number },
        destination: { label: String, lat: Number, lon: Number },
        pace: String,
        savedOn: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);

module.exports = User;
