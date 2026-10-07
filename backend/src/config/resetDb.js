const mongoose = require("mongoose");
const serverConfig = require("../serverConfig");

const wipeDB = async () => {
  try {
    await mongoose.connect(serverConfig.MONGO_URI);
    console.log("Connected to database. Wiping ..");
    await mongoose.connection.dropDatabase();
    console.log("Successfully wiped database.");
    process.exit(0);
  } catch (error) {
    console.error("Error wiping database", error);
  }
};

wipeDB();
