const mongoose = require("mongoose");
const serverConfig = require("../serverConfig");

/*
 * Which server this is about to empty, without printing the credentials in it.
 *
 * Named because MONGO_URI reaches this file only when the runner loads the env
 * file -- `npm run resetdb` does, a bare `node src/config/resetDb.js` does not,
 * and serverConfig then falls back to localhost. On a machine with a local
 * mongod that fallback *connects*, so the wipe quietly lands on the local
 * database while the operator believes they are clearing the remote one.
 */
const describeTarget = (uri) => {
  try {
    const { protocol, hostname, pathname } = new URL(uri);
    const database = pathname.replace(/^\//, "");
    return `${protocol}//${hostname}${database ? "/" + database : ""}`;
  } catch {
    return "an unparseable MONGO_URI";
  }
};

const wipeDB = async () => {
  try {
    console.log(`Wiping ${describeTarget(serverConfig.MONGO_URI)} ...`);
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
