// Rapidport design tokens — inferred types for use in component props.
import type { theme, color, fontFamily, fontScale, fontWeight, space, radius, zIndex } from './index'

export type Theme = typeof theme
export type ColorToken = keyof typeof color
export type FontFamilyToken = keyof typeof fontFamily
export type FontScaleToken = keyof typeof fontScale
export type FontWeightToken = keyof typeof fontWeight
export type SpaceToken = keyof typeof space
export type RadiusToken = keyof typeof radius
export type ZIndexToken = keyof typeof zIndex
