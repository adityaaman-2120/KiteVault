export type ColorTokens = {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  danger: string;
  warning: string;
  success: string;
};

export const lightColors: ColorTokens = {
  background: '#F5F7F9',
  surface: '#FFFFFF',
  surfaceMuted: '#EAEFF3',
  border: '#D9E0E6',
  text: '#16202A',
  textMuted: '#5C6B7A',
  primary: '#2F6F8F',
  onPrimary: '#FFFFFF',
  danger: '#B3413A',
  warning: '#A86B12',
  success: '#2E7D5B',
};

export const darkColors: ColorTokens = {
  background: '#0F1519',
  surface: '#182026',
  surfaceMuted: '#212B33',
  border: '#2C3842',
  text: '#E8EEF2',
  textMuted: '#93A3B1',
  primary: '#6DB3D1',
  onPrimary: '#0B1418',
  danger: '#E5736B',
  warning: '#E0A44A',
  success: '#5FBF93',
};
