import React, { useEffect } from "react";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View,
  type StyleProp, type ViewStyle, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { AlertCircle, HeartPulse, Wifi, WifiOff } from "lucide-react-native";

import { Colors, Radius, Shadows, Spacing, alpha } from "@/constants/theme";
import { useApp } from "@/data/store";

/**
 * Screen chrome: sticky-feeling header, live/demo badge, error strip, scrolling
 * body and a floating toast.
 *
 * The mode badge is deliberate — it always says whether what you're looking at
 * came from BigQuery or from the sample data. Nobody should have to guess
 * whether a demo is real.
 */
export function Screen({
  title,
  subtitle,
  children,
  scrollRef,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  scrollRef?: React.RefObject<ScrollView | null>;
}) {
  const { state, actions } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(actions.clearToast, 3200);
    return () => clearTimeout(t);
  }, [state.toast, actions]);

  const initials = state.profile.name
    .split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.brand}>
            <HeartPulse size={18} color={Colors.primary} strokeWidth={2.5} />
            <Text style={styles.brandText}>HEALTHYFOOD</Text>
            <ModeBadge live={state.mode === "live" && !state.error} />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Your profile"
            onPress={() => router.push("/profile")}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{initials}</Text>
          </Pressable>
        </View>

        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {state.loading ? (
          <View style={styles.loadingTrack}>
            <View style={styles.loadingBar} />
          </View>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={state.loading}
            onRefresh={() => actions.hydrate()}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {state.error ? (
          <View style={styles.errorStrip}>
            <AlertCircle size={15} color={Colors.warning} />
            <Text style={styles.errorText}>
              <Text style={styles.errorBold}>Showing demo data. </Text>
              {state.error}
            </Text>
          </View>
        ) : null}

        {children}
      </ScrollView>

      {state.toast ? (
        <View
          accessibilityRole="alert"
          style={[styles.toast, { bottom: insets.bottom + 24 }]}
          pointerEvents="none"
        >
          <Text style={styles.toastText}>{state.toast}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ModeBadge({ live }: { live: boolean }) {
  return (
    <View style={[styles.badge, { backgroundColor: live ? alpha(Colors.vitality, 0.15) : Colors.surface2 }]}>
      {live
        ? <Wifi size={9} color={Colors.vitality} />
        : <WifiOff size={9} color={Colors.muted} />}
      <Text style={[styles.badgeText, { color: live ? Colors.vitality : Colors.muted }]}>
        {live ? "LIVE" : "DEMO"}
      </Text>
    </View>
  );
}

export function Card({
  children, style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, Shadows.card, style]}>{children}</View>;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function Chip({
  children, icon, tone = "muted",
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "muted" | "magenta" | "vitality";
}) {
  const bg = tone === "magenta"
    ? alpha(Colors.magenta, 0.15)
    : tone === "vitality" ? alpha(Colors.vitality, 0.15) : Colors.surface2;
  const fg = tone === "magenta"
    ? Colors.magenta
    : tone === "vitality" ? Colors.vitality : Colors.muted;

  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      {icon}
      <Text style={[styles.chipText, { color: fg }]}>{children}</Text>
    </View>
  );
}

export function EmptyState({
  icon, title, hint,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <Card style={styles.empty}>
      {icon ? <View style={styles.emptyIcon}>{icon}</View> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
    </Card>
  );
}

/** Primary action button, with a built-in busy state. */
export function ActionButton({
  label, onPress, icon, busy, disabled, variant = "primary", style,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  busy?: boolean;
  disabled?: boolean;
  variant?: "primary" | "magenta" | "gold" | "outline" | "muted";
  style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || busy;
  const palette: Record<string, { bg: string; fg: string; border?: string }> = {
    primary: { bg: Colors.primary, fg: Colors.primaryFg },
    magenta: { bg: Colors.magenta, fg: Colors.magentaFg },
    gold: { bg: Colors.gold, fg: Colors.goldFg },
    outline: { bg: Colors.surface, fg: Colors.foreground, border: Colors.border },
    muted: { bg: Colors.surface2, fg: Colors.muted },
  };
  const p = palette[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: p.bg, opacity: off ? 0.6 : pressed ? 0.85 : 1 },
        p.border ? { borderWidth: 1, borderColor: p.border } : null,
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={p.fg} /> : icon}
      <Text style={[styles.buttonText, { color: p.fg }]}>{label}</Text>
    </Pressable>
  );
}

/** Thin progress track used by challenges, badges and reward affordability. */
export function ProgressBar({ value, color = Colors.primary }: { value: number; color?: string }) {
  return (
    <View style={styles.progressTrack}>
      <View
        style={[
          styles.progressFill,
          { width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    backgroundColor: Colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center", gap: 6 },
  brandText: {
    fontSize: 11, fontWeight: "800", letterSpacing: 1.4, color: Colors.primary,
  },
  avatar: {
    height: 36, width: 36, borderRadius: 18, backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: Colors.primaryFg, fontWeight: "800", fontSize: 12 },

  title: { fontSize: 26, fontWeight: "800", color: Colors.foreground, marginTop: Spacing.md },
  subtitle: { fontSize: 14, color: Colors.muted, marginTop: 2 },

  loadingTrack: {
    height: 3, borderRadius: 2, backgroundColor: Colors.surface2,
    marginTop: Spacing.md, overflow: "hidden",
  },
  loadingBar: { height: 3, width: "35%", borderRadius: 2, backgroundColor: Colors.primary },

  badge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2,
  },
  badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },

  body: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, gap: Spacing.md },

  errorStrip: {
    flexDirection: "row", gap: Spacing.sm, alignItems: "flex-start",
    backgroundColor: alpha(Colors.warning, 0.12),
    borderColor: alpha(Colors.warning, 0.4), borderWidth: 1,
    borderRadius: Radius.md, padding: Spacing.md,
  },
  errorText: { flex: 1, fontSize: 12, color: Colors.muted, lineHeight: 17 },
  errorBold: { fontWeight: "700", color: Colors.foreground },

  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },

  sectionLabel: {
    fontSize: 11, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase",
    color: Colors.muted, marginTop: Spacing.md, marginBottom: -4,
  },

  chip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: Radius.pill,
  },
  chipText: { fontSize: 10, fontWeight: "700" },

  empty: { alignItems: "center", paddingVertical: Spacing.xxl },
  emptyIcon: { marginBottom: Spacing.sm },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: Colors.foreground, textAlign: "center" },
  emptyHint: { fontSize: 12, color: Colors.muted, textAlign: "center", marginTop: 4, lineHeight: 17 },

  button: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: Spacing.sm, borderRadius: Radius.lg, paddingVertical: 14, paddingHorizontal: Spacing.lg,
  },
  buttonText: { fontSize: 14, fontWeight: "700" },

  progressTrack: {
    height: 8, borderRadius: 4, backgroundColor: Colors.surface2,
    overflow: "hidden", marginTop: Spacing.md,
  },
  progressFill: { height: 8, borderRadius: 4 },

  toast: {
    position: "absolute", left: Spacing.xl, right: Spacing.xl,
    backgroundColor: Colors.foreground, borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  toastText: { color: Colors.background, fontSize: 13, fontWeight: "600", textAlign: "center" },
});
