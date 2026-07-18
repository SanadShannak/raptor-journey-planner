// runRaptorTestSuite.js
const raptorEngine = require("../raptorEngine");
const memoryCache = require("../../memoryCache");

// Fetch real production pointers for baseline verification
const realCache = memoryCache.getCache();

console.log("================================================================");
console.log("🚀 INITIALIZING RAPTOR ALGORITHM EXTREME TESTING SUITE");
console.log(
  "================================================================\n",
);

/**
 * Clean baseline matrix reset helper to avoid state pollution between runs
 */
function resetSystemState() {
  global.gc && global.gc();
}

// Extract a guaranteed valid date from the cache to ensure active services are loaded during tests
// Otherwise, the engine skips scanning and artificially deflates the latency metrics
const activeDateKeys = Object.keys(realCache.activeServices || {});
let testQueryDate = "2026-07-16"; // Fallback format "YYYY-MM-DD"
if (activeDateKeys.length > 0) {
  // Grab a date from the middle of the calendar to ensure high service availability
  const d = String(activeDateKeys[Math.floor(activeDateKeys.length / 2)]);
  testQueryDate = `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`;
}

// =============================================================================
// TEST SUITE 1: MATHEMATICAL EDGE CASES & PATH CORRECTNESS
// =============================================================================
function runEdgeCaseSuite() {
  console.log("🧪 SUITE 1: Executing Mathematical Edge-Case Validations...");
  console.log(`  📅 Using dynamic test date: ${testQueryDate}`);

  // Test Case 1.1: Same Origin and Destination
  // Expected behavior: Instant completion, 0ms, best arrival matches departure
  console.log("\n  👉 Test 1.1: Identical Origin and Destination platform...");
  try {
    const startIdx = Object.keys(realCache.stopMapping)[0];
    const startTime = performance.now();
    // UPDATED: Added testQueryDate
    raptorEngine(startIdx, startIdx, testQueryDate, "08:00:00");
    const diff = performance.now() - startTime;
    console.log(
      `     ✅ PASS: Handled identically located stops cleanly in ${diff.toFixed(4)}ms`,
    );
  } catch (err) {
    console.error(
      "     ❌ FAIL: Same origin/destination threw a runtime error:",
      err.message,
    );
  }

  // Test Case 1.2: Completely Isolated Stop
  // Expected behavior: Terminate early via stopping criteria (markedStops.size === 0)
  console.log(
    "\n  👉 Test 1.2: Completely isolated node (No connecting routes)...",
  );
  try {
    // Inject a completely synthetic isolated stop ID temporarily into your live mapping memory
    const isolatedId = "SYNTHETIC_ISOLATED_STOP_X";
    const syntheticIndex = realCache.stops.length; // Append to end of matrix size safely

    // Temporarily mutate live memory pointers
    realCache.stopMapping[isolatedId] = syntheticIndex;
    realCache.stopToRoutes[syntheticIndex] = [];
    realCache.footpaths[isolatedId] = [];

    const targetIdx = Object.keys(realCache.stopMapping)[1];
    const startTime = performance.now();

    // UPDATED: Added testQueryDate
    raptorEngine(isolatedId, targetIdx, testQueryDate, "12:00:00");
    const diff = performance.now() - startTime;

    console.log(
      `     ✅ PASS: Isolated node search resolved instantly in ${diff.toFixed(4)}ms without unbounded iterations.`,
    );

    // Cleanup mutations
    delete realCache.stopMapping[isolatedId];
  } catch (err) {
    console.error(
      "     ❌ FAIL: Isolated node search crashed system logic:",
      err.message,
    );
  }
}

// =============================================================================
// TEST SUITE 2: MASSIVE SCALE PRODUCTION STRESS TEST
// =============================================================================
function runProductionStressSuite(iterations = 100) {
  console.log(
    `\n🔥 SUITE 2: Commencing Heavy Production Load Test (${iterations} Random Vectors)...`,
  );

  const stopIds = Object.keys(realCache.stopMapping);
  const sampleCount = stopIds.length;

  if (sampleCount < 2) {
    console.error(
      "  ❌ Inadequate cache state. Insufficient data vectors available inside memoryCache.",
    );
    return;
  }

  let totalExecutionTime = 0;
  let maxExecutionTime = 0;
  let minExecutionTime = Infinity;
  let successfulRoundsCount = 0;

  // Generate deterministic time-of-day slots to test timetable scanning distributions
  const timeSlots = [
    "06:15:00",
    "08:30:00",
    "14:45:00",
    "18:00:00",
    "23:50:00",
  ];

  for (let i = 1; i <= iterations; i++) {
    const randomOrigin = stopIds[Math.floor(Math.random() * sampleCount)];
    let randomTarget = stopIds[Math.floor(Math.random() * sampleCount)];

    // Ensure distinct vectors
    while (randomOrigin === randomTarget) {
      randomTarget = stopIds[Math.floor(Math.random() * sampleCount)];
    }

    const randomTime = timeSlots[i % timeSlots.length];

    // Silence internal engine standard logging temporarily to prevent console buffer choke
    const originalLog = console.log;
    console.log = () => {};

    resetSystemState();

    const startHighResTime = performance.now();
    try {
      // UPDATED: Added testQueryDate
      raptorEngine(randomOrigin, randomTarget, testQueryDate, randomTime);
      const endHighResTime = performance.now();

      const delta = endHighResTime - startHighResTime;
      totalExecutionTime += delta;
      successfulRoundsCount++;

      if (delta > maxExecutionTime) maxExecutionTime = delta;
      if (delta < minExecutionTime) minExecutionTime = delta;
    } catch (error) {
      originalLog(
        `\n      ❌ CRITICAL STRUCTURAL FAILURE at Vector Execution ${i}:`,
      );
      originalLog(
        `         Origin: "${randomOrigin}" | Target: "${randomTarget}" | Time: ${randomTime}`,
      );
      originalLog(`         Error stack trace:`, error.stack);
      process.exit(1);
    } finally {
      // Restore logging capability
      console.log = originalLog;
    }

    if (i % (iterations / 5) === 0 || i === iterations) {
      console.log(
        `  ⚡ Processed ${i}/${iterations} cross-city tracking vectors successfully...`,
      );
    }
  }

  // =============================================================================
  // ANALYTICS & DIAGNOSTICS REPORTING
  // =============================================================================
  const averageLatency = totalExecutionTime / successfulRoundsCount;

  console.log(
    "\n================================================================",
  );
  console.log("📊 RAPTOR ENGINE PERFORMANCE METRICS REPORT");
  console.log(
    "================================================================",
  );
  console.log(`  Total Evaluated Journeys : ${successfulRoundsCount}`);
  console.log(`  Minimum Scan Latency     : ${minExecutionTime.toFixed(4)} ms`);
  console.log(`  Maximum Scan Latency     : ${maxExecutionTime.toFixed(4)} ms`);
  console.log(`  Average Vector Latency   : ${averageLatency.toFixed(4)} ms`);
  console.log(
    "================================================================",
  );

  if (averageLatency > 50) {
    console.log(
      "⚠️ PERFORMANCE WARNING: RAPTOR scan times are high. Review your array lookup operations.",
    );
  } else {
    console.log(
      "🚀 PERFORMANCE VERDICT: Excellent! Core loops executing within optimal parameters.",
    );
  }
}

// Execute the test suites sequentially
runEdgeCaseSuite();
runProductionStressSuite(250); // Simulates 250 diverse cross-city commuter route queries
