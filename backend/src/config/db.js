const mongoose = require("mongoose");
const serverConfig = require("../serverConfig");
const logger = require("../utils/logger");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(serverConfig.MONGO_URI);
    logger.info(`[Database] MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    logger.fatal({ err: error }, "[Database] Could not connect");
    process.exit(1);
  }
};

module.exports = connectDB;
