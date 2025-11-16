/**
 * Task action types
 */
export enum TaskAction {
  /** Generate image */
  IMAGINE = 'IMAGINE',
  /** Upscale selected */
  UPSCALE = 'UPSCALE',
  /** Select one image and generate four similar variations */
  VARIATION = 'VARIATION',
  /** Reroll */
  REROLL = 'REROLL',
  /** Image to prompt */
  DESCRIBE = 'DESCRIBE',
  /** Analyze and optimize prompt */
  SHORTEN = 'SHORTEN',
  /** Blend multiple images */
  BLEND = 'BLEND',
  /** Pan canvas */
  PAN = 'PAN',
  /** Outpaint (zoom/extend) */
  OUTPAINT = 'OUTPAINT',
  /** Inpaint (region edit) */
  INPAINT = 'INPAINT',
  /** 2x Upsample (V7 subtle/creative) */
  UPSAMPLE_2X = 'UPSAMPLE_2X',
  /** Variation strength (low/high) */
  VARIATION_STRENGTH = 'VARIATION_STRENGTH',
  /** Animate (low/high) */
  ANIMATE = 'ANIMATE',
}

