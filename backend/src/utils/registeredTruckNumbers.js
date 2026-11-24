const Truck = require('../models/Truck');

const normalizePlate = value => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

async function attachTruckNumbers(loads) {
  const records = Array.isArray(loads) ? loads : [loads];
  const needsLookup = records.some(load => load && !load.truckNumber && load.truckPlate);
  if (!needsLookup) return loads;

  // Resolve legacy submissions against the fleet registry. Normalize punctuation
  // and spacing because older records may not use the registry's exact plate format.
  const trucks = await Truck.find({}).select('plateNumber truckNumber').lean();
  const numbersByPlate = new Map(
    trucks.map(truck => [normalizePlate(truck.plateNumber), truck.truckNumber]).filter(([plate, number]) => plate && number)
  );

  records.forEach(load => {
    if (load && !load.truckNumber) {
      load.truckNumber = numbersByPlate.get(normalizePlate(load.truckPlate)) || null;
    }
  });
  return loads;
}

module.exports = { attachTruckNumbers, normalizePlate };