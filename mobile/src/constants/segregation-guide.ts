import type { ApiWasteType } from '@/types/resident-schedule';

export type SegregationCategory = {
  id: 'biodegradable' | 'non-biodegradable' | 'recyclables' | 'hazardous';
  title: string;
  icon: 'leaf' | 'trash-can-outline' | 'recycle' | 'alert-outline';
  gradient: [string, string];
  tint: string;
  dark: string;
  fill: string;
  examples: string;
  subtitle: string;
  goesHere: string[];
  keepOut: string[];
  collectionType: ApiWasteType | null;
  tips: string[];
};

// Example sorting guidance for the interface. Replace this copy with official SWMO guidance when available.
export const SEGREGATION_CATEGORIES: SegregationCategory[] = [
  {
    id: 'biodegradable', title: 'Biodegradable', icon: 'leaf', gradient: ['#2b9170', '#0e3b2c'], tint: '#e6f3ec', dark: '#0b5d43', fill: '#0f7b55',
    examples: 'Food scraps, garden waste, paper', subtitle: 'Food and plant waste that breaks down naturally.',
    goesHere: ['Food scraps', 'Fruit and vegetable peels', 'Garden waste', 'Paper', 'Eggshells'], keepOut: ['Plastic', 'Glass', 'Metal'], collectionType: 'biodegradable',
    tips: ['Drain liquids before bagging.', 'Put it out in green bags on collection day.'],
  },
  {
    id: 'non-biodegradable', title: 'Non-biodegradable', icon: 'trash-can-outline', gradient: ['#2f6fd0', '#10285a'], tint: '#e6eefb', dark: '#1a52a8', fill: '#1d5fc4',
    examples: 'Wrappers, styrofoam, diapers', subtitle: 'Waste that does not break down and is not recyclable.',
    goesHere: ['Snack wrappers', 'Styrofoam', 'Diapers and pads', 'Plastic sachets', 'Broken ceramics'], keepOut: ['Food scraps', 'Batteries'], collectionType: 'non-biodegradable',
    tips: ['Keep it dry and tied securely.', 'Do not mix it with biodegradable waste.'],
  },
  {
    id: 'recyclables', title: 'Recyclables', icon: 'recycle', gradient: ['#c9701d', '#5e2c05'], tint: '#fbeedd', dark: '#8a4309', fill: '#b45d12',
    examples: 'Bottles, cans, cardboard', subtitle: 'Clean materials that can be processed and reused.',
    goesHere: ['Bottles', 'Cans', 'Cardboard', 'Clean paper', 'Metal scraps'], keepOut: ['Greasy boxes', 'Broken ceramics'], collectionType: null,
    tips: ['Rinse and dry containers first.', 'Flatten boxes to save space.'],
  },
  {
    id: 'hazardous', title: 'Hazardous', icon: 'alert-outline', gradient: ['#cf4234', '#6a120c'], tint: '#fbe7e5', dark: '#a6231d', fill: '#c0392b',
    examples: 'Batteries, bulbs, expired meds', subtitle: 'Waste that can harm people or the environment.',
    goesHere: ['Batteries', 'Light bulbs', 'Expired medicine', 'Aerosol cans', 'Paint and solvents'], keepOut: ['Regular household waste'], collectionType: null,
    tips: ['Store in a sealed container, away from children.', 'Never mix it with other waste.'],
  },
];
