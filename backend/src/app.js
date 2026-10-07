const express = require("express");
const cors = require("cors");
const serverConfig = require("./serverConfig");
const cookieParser = require("cookie-parser");

const validDatesApi = require("./routes/validDatesApi");
const plannerApi = require("./routes/plannerApi");
const stopsApi = require("./routes/stopsApi");
const networkApi = require("./routes/networkApi");
const routesApi = require("./routes/routesApi");
const authApi = require("./routes/authApi");
const cardApi = require("./routes/cardApi");
const userApi = require("./routes/userApi");

const app = express();

app.use(cors({ credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/api/health", (req, res) => {
  res.json({ status: "active", message: "API infrastructure active." });
});

app.use("/api/valid-dates", validDatesApi);
app.use("/api/planner", plannerApi);
app.use("/api/stop", stopsApi);
app.use("/api/stops", stopsApi);
app.use("/api/network", networkApi);
app.use("/api/routes", routesApi);
app.use("/api/auth", authApi);
app.use("/api/cards", cardApi);
app.use("/api/user", userApi);

app.get("/", (req, res) => {
  res.redirect("/api/health");
});

module.exports = app;
