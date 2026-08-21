const express = require("express");
const cors = require("cors");
const serverConfig = require("./serverConfig");

// Import Route Handlers
const validDatesApi = require("./routes/validDatesApi");
const routingApi = require("./routes/routingApi");
const stopsApi = require("./routes/stopsApi");

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
app.use("/api/route", routingApi);
app.use("/api/stop", stopsApi);

// Bind the server
app.listen(serverConfig.PORT, () => {
  console.log(`[Server] Listening on Port ${serverConfig.PORT}`);
  console.log(
    `[Server] Active Network: ${serverConfig.ACTIVE_NETWORK.toUpperCase()}`,
  );
});
