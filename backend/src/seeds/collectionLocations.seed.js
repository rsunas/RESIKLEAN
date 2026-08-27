const mongoose = require('mongoose');
const dotenv = require('dotenv');
const CollectionLocation = require('../models/CollectionLocation');

// Load env vars
dotenv.config();

// Schedule definitions from the 5-page PDF
const BioDays = ['Monday', 'Tuesday', 'Wednesday', 'Friday', 'Saturday'];
const NonBioDays = ['Thursday', 'Sunday'];

const makeSchedule = (timeWindows) => [
  {
    wasteType: 'biodegradable',
    days: BioDays,
    timeWindows
  },
  {
    wasteType: 'non-biodegradable',
    days: NonBioDays,
    timeWindows
  }
];

const locations = [
  {
    name: 'Centro',
    area: 'Area 1',
    type: 'barangay',
    shift: 'night',
    schedules: makeSchedule(['4:00 PM–8:00 PM', '9:00 PM–1:00 AM']),
  },
  {
    name: 'Triangulo',
    area: 'Area 1',
    type: 'barangay',
    shift: 'night',
    schedules: makeSchedule(['4:00 PM–8:00 PM', '9:00 PM–1:00 AM']),
  },
  {
    name: 'Panganiban Drive',
    area: 'Area 1',
    type: 'landmark',
    shift: 'night',
    schedules: makeSchedule(['4:00 PM–8:00 PM', '9:00 PM–1:00 AM']),
  },
  {
    name: 'Diversion Road',
    area: 'Area 1',
    type: 'landmark',
    shift: 'night',
    schedules: makeSchedule(['4:00 PM–8:00 PM', '9:00 PM–1:00 AM']),
  },
  {
    name: 'San Francisco',
    area: 'Area 1',
    type: 'barangay',
    shift: 'night',
    schedules: makeSchedule(['4:00 PM–8:00 PM', '9:00 PM–1:00 AM']),
  },
  {
    name: 'Bagumbayan Sur',
    area: 'Area 2',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['4:00 AM–8:00 AM', '9:00 AM–1:00 PM']),
  },
  {
    name: 'Bagumbayan Norte',
    area: 'Area 2',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['4:00 AM–8:00 AM', '9:00 AM–1:00 PM']),
  },
  {
    name: 'Calauag',
    area: 'Area 2',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['4:00 AM–8:00 AM', '9:00 AM–1:00 PM']),
  },
  {
    name: 'Liboton',
    area: 'Area 2',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['4:00 AM–8:00 AM', '9:00 AM–1:00 PM']),
  },
  {
    name: 'Jacob St.',
    area: 'Area 2',
    type: 'landmark',
    shift: 'day',
    schedules: makeSchedule(['4:00 AM–8:00 AM', '9:00 AM–1:00 PM']),
  },
  {
    name: 'Concepcion Pequeña',
    area: 'Area 3',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['4:00 AM–8:00 AM', '9:00 AM–1:00 PM']),
  },
  {
    name: 'Concepcion Grande',
    area: 'Area 3',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['4:00 AM–8:00 AM', '9:00 AM–1:00 PM']),
  },
  {
    name: 'Del Rosario',
    area: 'Area 3',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['4:00 AM–8:00 AM', '9:00 AM–1:00 PM']),
  },
  {
    name: 'Dayangdang',
    area: 'Area 4',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['4:00 AM–8:00 AM', '9:00 AM–1:00 PM']),
  },
  {
    name: 'Tinago',
    area: 'Area 4',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['4:00 AM–8:00 AM', '9:00 AM–1:00 PM']),
  },
  {
    name: 'Magsaysay Ave.',
    area: 'Area 4',
    type: 'landmark',
    shift: 'day',
    schedules: makeSchedule(['4:00 AM–8:00 AM', '9:00 AM–1:00 PM']),
  },
  {
    name: 'Abella',
    area: 'Area 5',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['4:00 AM–8:00 AM', '9:00 AM–1:00 PM']),
  },
  {
    name: 'Sta. Cruz',
    area: 'Area 5',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['4:00 AM–8:00 AM', '9:00 AM–1:00 PM']),
  },
  {
    name: 'Peñafrancia',
    area: 'Area 5',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['4:00 AM–8:00 AM', '9:00 AM–1:00 PM']),
  },
  {
    name: "Naga City People's Mall",
    area: 'Area 6',
    type: 'landmark',
    shift: 'day',
    schedules: makeSchedule(['5:00 AM–9:00 AM', '10:00 AM–2:00 PM']),
  },
  {
    name: 'Dinaga',
    area: 'Area 6',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['5:00 AM–9:00 AM', '10:00 AM–2:00 PM']),
  },
  {
    name: 'Mabolo',
    area: 'Area 7',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['5:00 AM–9:00 AM', '10:00 AM–2:00 PM']),
  },
  {
    name: 'Tabuco',
    area: 'Area 7',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['5:00 AM–9:00 AM', '10:00 AM–2:00 PM']),
  },
  {
    name: 'Lerma',
    area: 'Area 7',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['5:00 AM–9:00 AM', '10:00 AM–2:00 PM']),
  },
  {
    name: 'Panicuason',
    area: 'Area 8',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['5:00 AM–9:00 AM', '10:00 AM–2:00 PM']),
  },
  {
    name: 'Carolina',
    area: 'Area 8',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['5:00 AM–9:00 AM', '10:00 AM–2:00 PM']),
  },
  {
    name: 'Pacol',
    area: 'Area 8',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['5:00 AM–9:00 AM', '10:00 AM–2:00 PM']),
  },
  {
    name: 'San Isidro',
    area: 'Area 8',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['5:00 AM–9:00 AM', '10:00 AM–2:00 PM']),
  },
  {
    name: 'Balatas',
    area: 'Area 9',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['5:00 AM–9:00 AM', '10:00 AM–2:00 PM']),
  },
  {
    name: 'Cararayan',
    area: 'Area 9',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['5:00 AM–9:00 AM', '10:00 AM–2:00 PM']),
  },
  {
    name: 'San Felipe',
    area: 'Area 10',
    type: 'barangay',
    shift: 'day',
    schedules: makeSchedule(['5:00 AM–9:00 AM', '10:00 AM–2:00 PM']),
  },
  {
    name: 'Naga City Science High School',
    area: 'Area 11',
    type: 'landmark',
    shift: 'day',
    schedules: makeSchedule(['5:00 AM–9:00 AM', '10:00 AM–2:00 PM']),
  },
  {
    name: 'Almeda Highway',
    area: 'Area 11',
    type: 'landmark',
    shift: 'day',
    schedules: makeSchedule(['5:00 AM–9:00 AM', '10:00 AM–2:00 PM']),
  },
  {
    name: 'Naga City Subdivision',
    area: 'Area 12',
    type: 'subdivision',
    shift: 'day',
    schedules: makeSchedule(['7:00 AM–11:00 AM', '12:00 PM–2:00 PM']),
  },
  {
    name: 'Sabella',
    area: 'Area 12',
    type: 'subdivision',
    shift: 'day',
    schedules: makeSchedule(['7:00 AM–11:00 AM', '12:00 PM–2:00 PM']),
  },
  {
    name: 'Northfield',
    area: 'Area 12',
    type: 'subdivision',
    shift: 'day',
    schedules: makeSchedule(['7:00 AM–11:00 AM', '12:00 PM–2:00 PM']),
  },
  {
    name: 'Villa Obiedo',
    area: 'Area 12',
    type: 'subdivision',
    shift: 'day',
    schedules: makeSchedule(['7:00 AM–11:00 AM', '12:00 PM–2:00 PM']),
  },
  {
    name: 'Diversion Road (Area 13)',
    area: 'Area 13',
    type: 'street',
    shift: 'night',
    schedules: makeSchedule(['6:00 PM–10:00 PM', '11:00 PM–3:00 AM']),
  },
  {
    name: 'Concepcion Pequeña to Del Rosario',
    area: 'Area 13',
    type: 'street',
    shift: 'night',
    schedules: makeSchedule(['6:00 PM–10:00 PM', '11:00 PM–3:00 AM']),
  },
  {
    name: 'Panganiban to Rotonda left to Magsaysay Ave. left to Dayangdang',
    area: 'Area 13',
    type: 'street',
    shift: 'night',
    schedules: makeSchedule(['6:00 PM–10:00 PM', '11:00 PM–3:00 AM']),
  },
  {
    name: 'Right to Colgante',
    area: 'Area 13',
    type: 'street',
    shift: 'night',
    schedules: makeSchedule(['6:00 PM–10:00 PM', '11:00 PM–3:00 AM']),
  },
  {
    name: 'Right to Peñafrancia',
    area: 'Area 13',
    type: 'street',
    shift: 'night',
    schedules: makeSchedule(['6:00 PM–10:00 PM', '11:00 PM–3:00 AM']),
  },
  {
    name: 'Left to Liboton (Route 1)',
    area: 'Area 13',
    type: 'street',
    shift: 'night',
    schedules: makeSchedule(['6:00 PM–10:00 PM', '11:00 PM–3:00 AM']),
  },
  {
    name: 'Left to Bagumbayan Sur',
    area: 'Area 13',
    type: 'street',
    shift: 'night',
    schedules: makeSchedule(['6:00 PM–10:00 PM', '11:00 PM–3:00 AM']),
  },
  {
    name: 'U-turn back to Bagumbayan Norte',
    area: 'Area 13',
    type: 'street',
    shift: 'night',
    schedules: makeSchedule(['6:00 PM–10:00 PM', '11:00 PM–3:00 AM']),
  },
  {
    name: 'Back to Bagumbayan Sur',
    area: 'Area 13',
    type: 'street',
    shift: 'night',
    schedules: makeSchedule(['6:00 PM–10:00 PM', '11:00 PM–3:00 AM']),
  },
  {
    name: 'Left to Liboton (Route 2)',
    area: 'Area 13',
    type: 'street',
    shift: 'night',
    schedules: makeSchedule(['6:00 PM–10:00 PM', '11:00 PM–3:00 AM']),
  },
  {
    name: 'Balatas Road - SLF',
    area: 'Area 13',
    type: 'street',
    shift: 'night',
    schedules: makeSchedule(['6:00 PM–10:00 PM', '11:00 PM–3:00 AM']),
  },
  {
    name: 'R.F. Pula Market',
    area: 'Area 15',
    type: 'landmark',
    shift: 'day',
    schedules: makeSchedule(['7:00 AM–11:00 AM', '12:00 PM–3:00 PM']),
  },
  {
    name: 'Villa Grande Homes',
    area: 'Area 15',
    type: 'subdivision',
    shift: 'day',
    schedules: makeSchedule(['7:00 AM–11:00 AM', '12:00 PM–3:00 PM']),
  },
  {
    name: 'St. Andrew',
    area: 'Area 15',
    type: 'subdivision',
    shift: 'day',
    schedules: makeSchedule(['7:00 AM–11:00 AM', '12:00 PM–3:00 PM']),
  },
  {
    name: 'St. James',
    area: 'Area 15',
    type: 'subdivision',
    shift: 'day',
    schedules: makeSchedule(['7:00 AM–11:00 AM', '12:00 PM–3:00 PM']),
  },
  {
    name: 'St. Jude',
    area: 'Area 15',
    type: 'subdivision',
    shift: 'day',
    schedules: makeSchedule(['7:00 AM–11:00 AM', '12:00 PM–3:00 PM']),
  },
  {
    name: 'Monte Cielo',
    area: 'Area 15',
    type: 'subdivision',
    shift: 'day',
    schedules: makeSchedule(['7:00 AM–11:00 AM', '12:00 PM–3:00 PM']),
  },
  {
    name: 'Camella Homes',
    area: 'Area 15',
    type: 'subdivision',
    shift: 'day',
    schedules: makeSchedule(['7:00 AM–11:00 AM', '12:00 PM–3:00 PM']),
  },
  {
    name: 'Doña Conchita Subdivision',
    area: 'Area 15',
    type: 'subdivision',
    shift: 'day',
    schedules: makeSchedule(['7:00 AM–11:00 AM', '12:00 PM–3:00 PM']),
  },
  {
    name: 'Executive Townhomes',
    area: 'Area 15',
    type: 'subdivision',
    shift: 'day',
    schedules: makeSchedule(['7:00 AM–11:00 AM', '12:00 PM–3:00 PM']),
  },
  {
    name: 'Parkview Subdivision',
    area: 'Area 15',
    type: 'subdivision',
    shift: 'day',
    schedules: makeSchedule(['7:00 AM–11:00 AM', '12:00 PM–3:00 PM']),
  },
  {
    name: 'Urban Residences',
    area: 'Area 15',
    type: 'subdivision',
    shift: 'day',
    schedules: makeSchedule(['7:00 AM–11:00 AM', '12:00 PM–3:00 PM']),
  },
];

const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const connectDB = require('../config/db');

const seedLocations = async () => {
  try {
    await connectDB();
    console.log('MongoDB Connected for Seeding...');

    await CollectionLocation.deleteMany({});
    console.log('Cleared existing collection locations');

    await CollectionLocation.insertMany(locations);
    console.log(`Successfully seeded ${locations.length} collection locations!`);

    process.exit(0);
  } catch (err) {
    console.error('Error seeding data:', err);
    process.exit(1);
  }
};

seedLocations();
