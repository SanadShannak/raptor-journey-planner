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
    name: "Component 2: Parse Active Services",
    scriptPath: path.join(allParsersFolderPath, "parseActiveServices.js"),
  },
  {
    name: "Component 3: Parse Routes",
    scriptPath: path.join(allParsersFolderPath, "parseRoutes.js"),
  },
  {
    name: "Component 4: Parse Timetables",
    scriptPath: path.join(allParsersFolderPath, "parseTimetables.js"),
  },
  {
    name: "Component 5: Map Stop-To-Routes",
    scriptPath: path.join(allParsersFolderPath, "parseStopToRoutes.js"),
  },
  {
    name: "Component 6: Generate Spatial Grid",
    scriptPath: path.join(allParsersFolderPath, "generateSpatialGrid.js"),
  },
  {
    name: "Component 7: Generate Footpaths",
    scriptPath: path.join(allParsersFolderPath, "generateFootpaths.js"),
  },
  {
    name: "Component 8: Build Trip Shapes",
    scriptPath: path.join(allParsersFolderPath, "generateShapes.js"),
  },
];

console.log("\x1b[32m%s\x1b[0m", "Offline Pipeline Execution Starting...\n");

const parsingStartTime = performance.now();
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

const parsingEndTime = performance.now();
const parsingExecTime = ((parsingEndTime - parsingStartTime) / 1000).toFixed(2);
console.log(`Parsing Finished in ${parsingExecTime}s`);

console.log("\x1b[32m%s\x1b[0m", "\nOffline Pipeline Execution Finished.");
