const serverStartLoadTime = performance.now();

const app = require("./app.js");
const connectDB = require("./config/db.js");
const serverConfig = require("./serverConfig.js");

const startServer = async () => {
  try {
    await connectDB();
    app.listen(serverConfig.PORT, () => {
      console.log(`[Server] Listening on Port ${serverConfig.PORT}`);
      console.log(
        `[Server] Active Network: ${serverConfig.ACTIVE_NETWORK.toUpperCase()}`,
      );
    });

    const serverEndLoadTime = performance.now();
    const serverLoadExecTime = (
      (serverEndLoadTime - serverStartLoadTime) /
      1000
    ).toFixed(2);
    console.log(`Server loaded in ${serverLoadExecTime}s.`);
  } catch (error) {
    console.error("Failed to connect to database: ", error);
    process.exit(1);
  }
};

module.exports = startServer;
