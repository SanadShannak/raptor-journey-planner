const mongoose = require("mongoose");
const serverConfig = require("../serverConfig");
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(serverConfig.MONGO_URI);
    console.log(`[Database] MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`[Database] Error: ${error}`);
    process.exit(1);
  }
};

module.exports = connectDB;
