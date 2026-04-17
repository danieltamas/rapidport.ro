// Rapidport design tokens — single source of truth. Do not hardcode colors/fonts/spacing outside this file.

// ---------------------------------------------------------------------------
// Colors — dark mode (primary)
// ---------------------------------------------------------------------------
export const colorDark = {
  bgPrimary: '#0A0A0A',
  bgSecondary: '#111111',
  bgTertiary: '#1A1A1A',
  bgHover: '#1F1F1F',

  borderDefault: '#262626',
  borderStrong: '#3A3A3A',
  borderFocus: '#C72E49',

  textPrimary: '#FAFAFA',
  textSecondary: '#A3A3A3',
  textTertiary: '#737373',
  textDisabled: '#525252',
} as const

// ---------------------------------------------------------------------------
// Colors — accent (signature red)
// ---------------------------------------------------------------------------
export const colorAccent = {
  accentPrimary: '#C72E49',
  accentHover: '#D8405B',
  accentPressed: '#A82541',
  accentSubtle: '#C72E491A', // 10% opacity
} as const

// ---------------------------------------------------------------------------
// Colors — semantic
// ---------------------------------------------------------------------------
export const colorSemantic = {
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
} as const

// ---------------------------------------------------------------------------
// Colors — light mode (for /legal/* pages only)
// Accent colors are shared (same red as above).
// ---------------------------------------------------------------------------
export const colorLight = {
  bgPrimaryLight: '#FFFFFF',
  bgSecondaryLight: '#FAFAFA',
  textPrimaryLight: '#0A0A0A',
  textSecondaryLight: '#525252',
} as const

// ---------------------------------------------------------------------------
// Unified color token map
// ---------------------------------------------------------------------------
export const color = {
  ...colorDark,
  ...colorAccent,
  ...colorSemantic,
  ...colorLight,
} as const

// ---------------------------------------------------------------------------
// Font families
// ---------------------------------------------------------------------------
export const fontFamily = {
  fontSans: "'Inter', system-ui, -apple-system, sans-serif",
  fontMono: "'JetBrains Mono', 'Menlo', monospace",
} as const

// ---------------------------------------------------------------------------
// Font scale
// Each entry: { size (px), lineHeight (unitless), letterSpacing (em string) }
// ---------------------------------------------------------------------------
export const fontScale = {
  displayXl: { size: 64, lineHeight: 1.05, letterSpacing: '-0.04em' },
  displayLg: { size: 48, lineHeight: 1.1, letterSpacing: '-0.03em' },
  h1: { size: 36, lineHeight: 1.15, letterSpacing: '-0.02em' },
  h2: { size: 28, lineHeight: 1.2, letterSpacing: '-0.02em' },
  h3: { size: 22, lineHeight: 1.3, letterSpacing: '-0.01em' },
  h4: { size: 18, lineHeight: 1.4, letterSpacing: '0' },
  bodyLg: { size: 17, lineHeight: 1.6, letterSpacing: '0' },
  body: { size: 15, lineHeight: 1.6, letterSpacing: '0' },
  bodySm: { size: 13, lineHeight: 1.5, letterSpacing: '0' },
  caption: { size: 12, lineHeight: 1.4, letterSpacing: '0.01em' },
  monoBody: { size: 14, lineHeight: 1.5, letterSpacing: '0' },
  monoSm: { size: 12, lineHeight: 1.4, letterSpacing: '0' },
} as const

// ---------------------------------------------------------------------------
// Font weights
// ---------------------------------------------------------------------------
export const fontWeight = {
  weightRegular: 400,
  weightMedium: 500,
  weightMonoRegular: 450,
  weightSemibold: 600,
} as const

// ---------------------------------------------------------------------------
// Spacing scale (strictly 4px-based)
// ---------------------------------------------------------------------------
export const space = {
  space4: 4,
  space8: 8,
  space12: 12,
  space16: 16,
  space24: 24,
  space32: 32,
  space48: 48,
  space64: 64,
  space96: 96,
  space128: 128,
} as const

// ---------------------------------------------------------------------------
// Border radius
// ---------------------------------------------------------------------------
export const radius = {
  radiusSm: 4,
  radiusMd: 6,
  radiusLg: 8,
  radiusFull: 9999,
} as const

// ---------------------------------------------------------------------------
// Z-index scale (low → high: sticky, dropdown, tooltip, modal, toast)
// ---------------------------------------------------------------------------
export const zIndex = {
  sticky: 10,
  dropdown: 100,
  tooltip: 1000,
  modal: 10000,
  toast: 100000,
} as const

// ---------------------------------------------------------------------------
// Catchall theme export
// ---------------------------------------------------------------------------
export const theme = {
  color,
  fontFamily,
  fontScale,
  fontWeight,
  space,
  radius,
  zIndex,
} as const
