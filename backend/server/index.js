const express = require("express");
const cors = require("cors");
const serverConfig = require("./serverConfig");

// Import Route Handlers
const validDatesApi = require("./routes/validDatesApi");
const plannerApi = require("./routes/plannerApi");
const stopsApi = require("./routes/stopsApi");
const networkApi = require("./routes/networkApi");
const routesApi = require("./routes/routesApi");

// Initialize the express app
const app = express();

// Apply global middleware configuration
app.use(cors());
app.use(express.json());

// System health probe
app.get("/api/health", (req, res) => {
  res.json({ status: "active", message: "Core infrastructure active" });
});

// Mount modular routers
app.use("/api/valid-dates", validDatesApi);
app.use("/api/planner", plannerApi);
/*
 * One router, two mounts: `/api/stop/:id` is a stop, `/api/stops?bounds` is the
 * set of them in an area. Same file because they are the same resource read two
 * ways, and splitting them would mean two copies of `describeStop`.
 */
app.use("/api/stop", stopsApi);
app.use("/api/stops", stopsApi);
app.use("/api/network", networkApi);
app.use("/api/routes", routesApi);

// Bind the server
app.listen(serverConfig.PORT, () => {
  console.log(`[Server] Listening on Port ${serverConfig.PORT}`);
  console.log(
    `[Server] Active Network: ${serverConfig.ACTIVE_NETWORK.toUpperCase()}`,
  );
});
