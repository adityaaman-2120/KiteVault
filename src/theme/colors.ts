export type ColorTokens = {
  background: string;
  surface: string;
  surfaceMuted: string;
  // Thin lines that only separate things (card edges, dividers). Not for controls.
  border: string;
  // The edge of something you can touch or type into (text boxes, switches, check boxes).
  // Strong enough to be seen by people with low vision (at least 3:1 against what is behind it).
  outline: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  // A gentle tint of the main colour, for selected chips, icon badges and highlights.
  primarySoft: string;
  // The top bar. Darker than the page so the bar and the screen read as two separate layers.
  header: string;
  onHeader: string;
  // The brand orange, as readable text ("Vault" in the name, small highlights).
  accent: string;
  danger: string;
  warning: string;
  success: string;
};

// The palette comes from the Kitelux logo: night blue #0E1630, amber #FFB547 and the kite's
// oranges. Every text pair is checked for contrast in src/theme/__tests__/contrast.test.ts.
export const lightColors: ColorTokens = {
  background: '#F4F5FA',
  surface: '#FFFFFF',
  surfaceMuted: '#E8EAF3',
  border: '#DDE1EE',
  outline: '#6B7391',
  text: '#0E1630',
  textMuted: '#4A5272',
  primary: '#1B2A5C',
  onPrimary: '#FFFFFF',
  primarySoft: '#E4E8F7',
  header: '#1B2A5C',
  onHeader: '#FFFFFF',
  accent: '#B4530A',
  danger: '#B3261E',
  warning: '#8A5300',
  success: '#1E7A52',
};

export const darkColors: ColorTokens = {
  background: '#0E1630',
  surface: '#172042',
  surfaceMuted: '#212C5A',
  border: '#2A3566',
  outline: '#8B94B8',
  text: '#F4F5FA',
  textMuted: '#B7BFDD',
  primary: '#FFB547',
  onPrimary: '#0E1630',
  primarySoft: '#2B2F4E',
  header: '#080D20',
  onHeader: '#F4F5FA',
  accent: '#FFB547',
  danger: '#FF8A80',
  warning: '#FFC861',
  success: '#6FD3A5',
};
