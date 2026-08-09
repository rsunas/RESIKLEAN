# Resiklean

Cloud-based waste collection route compliance and volumetric measurement system for Naga City — built for BSIT Capstone at Ateneo de Naga University.

## Team
- Bon Roan R. Hernandez
- Richard Adrian E. Suñas

**Adviser:** Sir Ian Peter L. Lastimosa

## What it does

Resiklean digitizes the Naga City SWMO's paper-based route compliance and truckload triangulation process across four role-based modules:

- **Resident** — tracks their collection schedule, reports missed collection with AI-verified photo evidence
- **Waste Collector** — offline-first route map with automatic geofenced "Collected" logging
- **Staff** — digitizes truckload triangulation and tonnage calculation at the sanitary landfill
- **SWMO Administrator** — cloud dashboard for compliance reports and route history

## Repo structure

resiklean/
├── backend/          # Node.js + Express.js API, MongoDB Atlas, JWT auth, Socket.io
├── mobile/            # React Native + Expo app (Resident, Collector, Staff)
└── web-dashboard/     # React.js app (SWMO Administrator)

## Tech stack

| Layer | Tech |
|---|---|
| Mobile | React Native, Expo (EAS), HeroUI, SQLite, NetInfo |
| Web | React.js, HeroUI |
| Backend | Node.js, Express.js, Socket.io, JWT |
| Database | MongoDB Atlas |
| Storage | Cloudinary |
| Maps / Geofencing | Mapbox |
| Computer Vision | Roboflow YOLOv8s |

## Getting started

### Backend
cd backend
npm install
cp .env.example .env
npm run dev

### Mobile
cd mobile
npm install
cp .env.example .env
npx expo start

### Web dashboard
cd web-dashboard
npm install
cp .env.example .env
npm run dev

## Branching strategy

- `main` — stable, defense-ready code only
- `dev` — integration branch; all feature branches merge here first
- `feature/<module>-<short-description>` — one branch per task

Open a PR into `dev` when a feature is ready for review. `main` only gets updated from `dev` at milestones.
