export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

// The smallest size of anything you tap, in density-independent pixels (Android's guideline).
export const touch = { min: 48 } as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

// A soft shadow for raised cards and the floating button (Android uses elevation).
export const elevation = {
  card: {
    shadowColor: '#0E1630',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  float: {
    shadowColor: '#0E1630',
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

export const typography = {
  title: { fontSize: 26, fontWeight: '800', lineHeight: 32, letterSpacing: -0.5 },
  heading: { fontSize: 16, fontWeight: '700', lineHeight: 24, letterSpacing: -0.2 },
  body: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  label: { fontSize: 12.5, fontWeight: '500', lineHeight: 16 },
  caption: { fontSize: 12, fontWeight: '400', lineHeight: 16 },
} as const;
