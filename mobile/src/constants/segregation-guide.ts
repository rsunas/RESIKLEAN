import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from 'expo/node_modules/@expo/vector-icons';

export type GuideCategoryId = 'biodegradable' | 'non-biodegradable' | 'recyclables' | 'hazardous';
export type GuideIcon = ComponentProps<typeof MaterialCommunityIcons>['name'];
export type SegregationCategory = {
  id: GuideCategoryId; title: string; icon: GuideIcon;
  gradient: [string, string]; tint: string; dark: string; fill: string;
  examples: string; goesHere: GuideItemId[]; keepOut: GuideItemId[]; tip: string;
};

// Editable SWMO copy. Item ids also name optional JPG/WebP photos in assets/guide/items.
export const GUIDE_ITEMS = {
  'food-scraps': { label: 'Food scraps', icon: 'food-apple' },
  'garden-waste': { label: 'Garden waste', icon: 'leaf' },
  paper: { label: 'Paper', icon: 'file-document' },
  eggshells: { label: 'Eggshells', icon: 'egg-outline' },
  plastic: { label: 'Plastic', icon: 'bottle-soda-classic' },
  metal: { label: 'Metal', icon: 'barrel' },
  wrappers: { label: 'Wrappers', icon: 'candy' },
  styrofoam: { label: 'Styrofoam', icon: 'cup' },
  diapers: { label: 'Diapers', icon: 'baby-face-outline' },
  sachets: { label: 'Sachets', icon: 'food-variant' },
  batteries: { label: 'Batteries', icon: 'battery-charging' },
  bottles: { label: 'Bottles', icon: 'bottle-soda-classic' },
  cans: { label: 'Cans', icon: 'barrel' },
  cardboard: { label: 'Cardboard', icon: 'package-variant-closed' },
  'greasy-boxes': { label: 'Greasy boxes', icon: 'food-takeout-box' },
  'broken-ceramics': { label: 'Broken ceramics', icon: 'bowl-mix-outline' },
  'light-bulbs': { label: 'Light bulbs', icon: 'lightbulb' },
  medicine: { label: 'Medicine', icon: 'pill' },
  'aerosol-cans': { label: 'Aerosol cans', icon: 'spray' },
  'household-waste': { label: 'Household waste', icon: 'delete' },
} satisfies Record<string, { label: string; icon: GuideIcon }>;
export type GuideItemId = keyof typeof GUIDE_ITEMS;

export const SEGREGATION_CATEGORIES: SegregationCategory[] = [
  {
    id: 'biodegradable', title: 'Biodegradable', icon: 'leaf', gradient: ['#2b9170', '#0e3b2c'], tint: '#e6f3ec', dark: '#0b5d43', fill: '#0f7b55',
    examples: 'Food scraps, garden waste, paper',
    goesHere: ['food-scraps', 'garden-waste', 'paper', 'eggshells'], keepOut: ['plastic', 'metal'], tip: 'Drain wet waste first',
  },
  {
    id: 'non-biodegradable', title: 'Non-biodegradable', icon: 'trash-can-outline', gradient: ['#2f6fd0', '#10285a'], tint: '#e6eefb', dark: '#1a52a8', fill: '#1d5fc4',
    examples: 'Wrappers, styrofoam, diapers',
    goesHere: ['wrappers', 'styrofoam', 'diapers', 'sachets'], keepOut: ['food-scraps', 'batteries'], tip: 'Keep it dry and tied',
  },
  {
    id: 'recyclables', title: 'Recyclables', icon: 'recycle', gradient: ['#c9701d', '#5e2c05'], tint: '#fbeedd', dark: '#8a4309', fill: '#b45d12',
    examples: 'Bottles, cans, cardboard',
    goesHere: ['bottles', 'cans', 'cardboard', 'paper'], keepOut: ['greasy-boxes', 'broken-ceramics'], tip: 'Rinse and dry first',
  },
  {
    id: 'hazardous', title: 'Hazardous', icon: 'alert-outline', gradient: ['#cf4234', '#6a120c'], tint: '#fbe7e5', dark: '#a6231d', fill: '#c0392b',
    examples: 'Batteries, bulbs, expired meds',
    goesHere: ['batteries', 'light-bulbs', 'medicine', 'aerosol-cans'], keepOut: ['household-waste'], tip: 'Sealed, away from kids',
  },
];

export function getGuideCategory(id: string) {
  return SEGREGATION_CATEGORIES.find(category => category.id === id);
}

export const GUIDE_UI = {
  white: '#FFFFFF', ink: '#0e2a20', muted: '#4b5563', past: '#6b7280',
  mutedCircle: '#eef1ef', pastCircle: '#e5e8e6', mutedIcon: '#84918b',
  tipSurface: '#f3f6f4', danger: '#c0392b', backdrop: 'rgba(11,40,30,0.5)',
  radius: { sheet: 28, card: 24, row: 18, button: 14, tile: 10 },
  font: { heading: 22, sheetTitle: 28, group: 17, item: 13, tip: 15, type: 16, time: 13 },
};
