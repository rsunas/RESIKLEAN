/** Shared dark surfaces and their foregrounds. Brand fills keep white labels. */
export const darkPalette = {
  background: '#101815',
  surface: '#1A2420',
  field: '#24332B',
  border: '#42574B',
  text: '#F3F7F4',
  muted: '#B4C4BB',
  accent: '#85DCB0',
  tint: '#173E2D',
  blue: '#9BBFFF',
  blueTint: '#203655',
  warning: '#F5C778',
  warningTint: '#42331C',
  danger: '#FFABA5',
  dangerTint: '#482724',
  purple: '#DCB3F5',
  purpleTint: '#392A48',
} as const;

export const darkCategoryColors = {
  biodegradable: { text: darkPalette.accent, tint: darkPalette.tint },
  'non-biodegradable': { text: darkPalette.blue, tint: darkPalette.blueTint },
  recyclables: { text: darkPalette.warning, tint: darkPalette.warningTint },
  hazardous: { text: darkPalette.danger, tint: darkPalette.dangerTint },
} as const;
