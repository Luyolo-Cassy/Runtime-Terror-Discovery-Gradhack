import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";

import { Colors, RingStops } from "@/constants/theme";

/**
 * The signature Discovery-style multi-colour ring (lime → teal → yellow →
 * orange → magenta), reused on Home, Pantry, Rewards and Profile.
 *
 * Same maths as the web version, drawn with react-native-svg: a stroke-dasharray
 * of `dash` followed by `circumference - dash` leaves exactly `value` percent of
 * the circle painted. Rotating -90° puts the start of the arc at 12 o'clock.
 */
export function VitalityRing({
  value,
  size = 116,
  stroke = 14,
  label,
  sublabel,
}: {
  /** 0–100. */
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
}) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const dash = (pct / 100) * circumference;
  const gradientId = `ring-${size}-${stroke}`;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            {RingStops.map((color, i) => (
              <Stop
                key={color}
                offset={`${(i / (RingStops.length - 1)) * 100}%`}
                stopColor={color}
              />
            ))}
          </LinearGradient>
        </Defs>

        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={Colors.surface2}
          strokeWidth={stroke}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          // SVG arcs start at 3 o'clock; rotate so progress reads from the top.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      <View style={styles.center} pointerEvents="none">
        {label ? <Text style={styles.label}>{label}</Text> : null}
        {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  center: {
    position: "absolute", top: 0, right: 0, bottom: 0, left: 0,
    alignItems: "center", justifyContent: "center",
  },
  label: { fontSize: 22, fontWeight: "800", color: Colors.foreground },
  sublabel: { fontSize: 11, color: Colors.muted, marginTop: 2 },
});
