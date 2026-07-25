/**
 * HealthyFood palette.
 *
 * These are the same colours as the web prototype, converted from oklch to hex
 * because React Native's style engine can't parse oklch. The Discovery-inspired
 * direction is unchanged: teal as the primary/trust colour, a Vitality gold
 * reserved for CashBack, health green for HealthyFood classifications, and the
 * signature multi-colour ring.
 *
 * Sourcing note: these are *inspired-by* values sampled from the Discovery app,
 * not verified official brand-guideline colours. Swap them here if the team gets
 * the real values — nothing else in the app hardcodes a colour.
 */

import { Platform } from "react-native";

export const Colors = {
  background: "#F6F9FB",
  surface: "#FFFFFF",
  surface2: "#F1F4F7",
  card: "#FFFFFF",

  foreground: "#293342",
  muted: "#697280",

  primary: "#00AFAF",
  primaryFg: "#F9FCFF",

  /** HealthyFood green — "this counts as healthy". */
  vitality: "#54BF5C",
  vitalityFg: "#FFFFFF",

  /** Data-viz + swap suggestions. */
  magenta: "#DF3798",
  magentaFg: "#FFFFFF",

  electric: "#2F8ADC",

  gold: "#F4BF3F",
  goldFg: "#412805",

  warning: "#FAAB3F",
  destructive: "#E93954",

  border: "#E4E8ED",
  input: "#D9DFE6",
} as const;

/** Gradient stops, for react-native-svg <LinearGradient> and header cards. */
export const Gradients = {
  teal: ["#00BEB7", "#00AEB5"] as const,
  magenta: ["#E95AB4", "#DB2C87"] as const,
  gold: ["#F7C747", "#F8A13F"] as const,
};

/** The signature Discovery ring: lime → teal → yellow → orange → magenta. */
export const RingStops = ["#6DD456", "#00BEAF", "#EFCC36", "#F3821D", "#DF3798"] as const;

export const Radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };

/**
 * Cards use elevation on Android and a soft shadow on iOS. Spreading this into
 * a style keeps the two platforms visually matched.
 */
export const Shadows = {
  card: Platform.select({
    ios: {
      shadowColor: "#293342",
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 2 },
    default: {},
  }),
  glow: Platform.select({
    ios: {
      shadowColor: "#00AFAF",
      shadowOpacity: 0.35,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 5 },
    default: {},
  }),
} as const;

export const Fonts = Platform.select({
  ios: { sans: "system-ui", rounded: "ui-rounded", mono: "ui-monospace" },
  android: { sans: "sans-serif", rounded: "sans-serif", mono: "monospace" },
  default: { sans: "system-ui", rounded: "system-ui", mono: "monospace" },
});

/** Alpha helper so we can tint backgrounds without a colour-mix function. */
export function alpha(hex: string, opacity: number) {
  const a = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}
