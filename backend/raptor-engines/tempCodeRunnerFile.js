// Expand initial footpaths ONLY for explicit "stop" origin queries
    if (sourceNode.type === "stop") {
      const currentStopFootpaths = footpaths[stop] || [];

      currentStopFootpaths.forEach((footpath) => {
        const neighborStop = footpath["to_stop_id"];
        const footpathDuration = Math.round(
          footpath["distance"] / WALKING_SPEED_MPS,
        );
        const penalty = footpath["stop_access_penalty"];
        const totalWalkTimeToNeighbor = footpathDuration + penalty;
        const arrivalTimeAtNeighborAfterWalk =
          arrivalTimeAtStop + totalWalkTimeToNeighbor;
        // If walking to this neighbor is faster than any previously known Round 0 time
        if (arrivalTimeAtNeighborAfterWalk < arrivalTimes[0][neighborStop]) {
          arrivalTimes[0][neighborStop] = arrivalTimeAtNeighborAfterWalk;
          bestArrivalTimes[neighborStop] = arrivalTimeAtNeighborAfterWalk;
          markedStops.add(neighborStop);

          //  Point the parent back to our starting station, NOT "ORIGIN"
          parentStop[0][neighborStop] = stop;
          parentTrip[0][neighborStop] = -1;
          parentRoute[0][neighborStop] = totalWalkTimeToNeighbor;
        }
      });
    }