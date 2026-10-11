const serverStartLoadTime = performance.now();

const app = require("./app.js");
const connectDB = require("./config/db.js");
const runMigrations = require("./config/migrations.js");
const serverConfig = require("./serverConfig.js");
const logger = require("./utils/logger");

const startServer = async () => {
  try {
    await connectDB();
    await runMigrations();
    app.listen(serverConfig.PORT, () => {
      logger.info(`[Server] Listening on Port ${serverConfig.PORT}`);
      logger.info(
        `[Server] Active Network: ${serverConfig.ACTIVE_NETWORK.toUpperCase()}`,
      );
    });

    const serverEndLoadTime = performance.now();
    const serverLoadExecTime = (
      (serverEndLoadTime - serverStartLoadTime) /
      1000
    ).toFixed(2);
    logger.info(`Server loaded in ${serverLoadExecTime}s.`);
  } catch (error) {
    logger.fatal({ err: error }, "Failed to start");
    process.exit(1);
  }
};

module.exports = startServer;
