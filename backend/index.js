const express = require("express");
const cors = require("cors");
// Trigger the cold-start memory caching
const memoryCache = require("./memoryCache");

// Initialize the express app
const app = express();
const PORT = 3000;

// Apply global middleware configuration
app.use(cors());
app.use(express.json());

// System health probe to make sure Express server is active and reachable
app.get("/api/health", (req, res) => {
  res.json({ status: "active", message: "Core infrastructure active" });
});

// Bind the server to the designated local port
app.listen(PORT, () => {
  console.log(`Listening on Port ${PORT}`);
});
