const MIN_STOPS = 3;

function calculateProjection(fillLevel, completedStops, totalStops) {
  // Always critical if actual fill level is 90% or more
  if (fillLevel >= 90) {
    let projection = null;
    if (completedStops >= MIN_STOPS && completedStops > 0) {
      projection = (fillLevel * totalStops) / completedStops;
    }
    return {
      status: 'CRITICAL',
      projection: projection !== null ? Math.round(projection * 10) / 10 : null,
    };
  }

  // Insufficient data below 3 stops
  if (completedStops < MIN_STOPS || completedStops === 0) {
    return {
      status: 'INSUFFICIENT_DATA',
      projection: null,
    };
  }

  // Calculate projection
  const projection = (fillLevel * totalStops) / completedStops;
  const roundedProjection = Math.round(projection * 10) / 10;

  let status = 'OK';
  if (projection > 100) {
    status = 'CRITICAL';
  } else if (projection >= 90) {
    status = 'WARNING';
  }

  return {
    status,
    projection: roundedProjection,
  };
}

module.exports = {
  MIN_STOPS,
  calculateProjection,
};
