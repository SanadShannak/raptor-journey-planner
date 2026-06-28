const { execSync } = require("child_process");
const path = require("path");
// Custom dynamic configuration
const config = require("./pipelineConfig");
// Dynamic directory paths based on whatever network is active (hsl, amman, etc..)
const activeNetwork = config.ACTIVE_NETWORK;
// Path to directory of all parsers
const allParsersFolderPath = path.join(__dirname, "parsers");
// Array of parsing components that form our pipeline
const parsingComponents = [
  {
    name: "Component 1: Parse Stops",
    scriptPath: path.join(allParsersFolderPath, "parseStops.js"),
  },
  {
    name: "Component 2: Parse Routes",
    scriptPath: path.join(allParsersFolderPath, "parseRoutes.js"),
  },
  {
    name: "Component 3: Parse Timetables",
    scriptPath: path.join(allParsersFolderPath, "parseTimetables.js"),
  },
  {
    name: "Component 4: Generate Footpaths",
    scriptPath: path.join(allParsersFolderPath, "generateFootpaths.js"),
  },
];

console.log("\x1b[32m%s\x1b[0m", "Offline Pipeline Execution Starting...\n");

// Loop through each parser and execute them synchronously
parsingComponents.forEach(({ name, scriptPath }) => {
  try {
    execSync(`node "${scriptPath}"`, { stdio: "inherit" }); // using execSync to synchronously execute each parser as a child process (stdio: "inherit" to pipe the child process's terminal streams directly into the master process)
  } catch (err) {
    console.error(
      "\x1b[31m",
      `Error while executing path ${scriptPath}`,
      "\x1b[0m",
    );
    process.exit(1);
  }
});

console.log("\x1b[32m%s\x1b[0m", "\nOffline Pipeline Execution Finished.");
