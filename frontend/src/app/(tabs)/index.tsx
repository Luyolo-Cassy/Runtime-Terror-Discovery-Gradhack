import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  AlertTriangle, ArrowRight, Boxes, ChefHat, Gift, ScanLine, ShoppingCart, Sparkles,
} from "lucide-react-native";

import { ActionButton, Card, Screen, SectionLabel } from "@/components/ui";
import { VitalityRing } from "@/components/vitality-ring";
import { Colors, Radius, Spacing, alpha } from "@/constants/theme";
import { useApp } from "@/data/store";

const TILES = [
  { to: "/pantry", label: "Pantry", desc: "Stored items & swaps", Icon: Boxes },
  { to: "/recipes", label: "Recipes", desc: "Cook what you have", Icon: ChefHat },
  { to: "/receipts", label: "Receipts", desc: "Baskets & slips", Icon: ScanLine },
  { to: "/shopping", label: "Shopping", desc: "Best-price picks", Icon: ShoppingCart },
  { to: "/rewards", label: "Rewards", desc: "Points & challenges", Icon: Gift },
] as const;

export default function HomeScreen() {
  const { state, actions } = useApp();
  const router = useRouter();
  const { profile, pantry, shopping, points } = state;

  const expiring = pantry.filter((i) => i.expiresIn <= 3);
  const generating = Boolean(state.busy.recipe);

  async function quickRecipe() {
    // If anything is about to go off, bias the recipe toward using it up.
    const recipe = await actions.generateRecipe(expiring.length > 0);
    if (recipe) router.push("/recipes");
  }

  return (
    <Screen title={`Hello, ${profile.name.split(" ")[0]}`} subtitle="Here's your everyday-living snapshot">
      <Card style={styles.row}>
        <VitalityRing
          value={profile.healthScore}
          size={112}
          stroke={13}
          label={`${profile.healthScore}`}
          sublabel="health score"
        />
        <View style={styles.flex}>
          <Text style={styles.kicker}>VITALITY POINTS</Text>
          <Text style={styles.bigNumber}>{points.toLocaleString()}</Text>
          <Pressable onPress={() => router.push("/rewards")} style={styles.link}>
            <Text style={styles.linkText}>View rewards</Text>
            <ArrowRight size={12} color={Colors.primary} />
          </Pressable>
        </View>
      </Card>

      <ActionButton
        label={generating ? "Writing your recipe…" : "What can I cook tonight?"}
        icon={<Sparkles size={18} color={Colors.primaryFg} />}
        onPress={quickRecipe}
        busy={generating}
        disabled={pantry.length === 0}
      />

      <View style={styles.statRow}>
        <Stat label="Pantry items" value={pantry.length} onPress={() => router.push("/pantry")} />
        <Stat label="Shopping list" value={shopping.length} onPress={() => router.push("/shopping")} />
      </View>

      {expiring.length > 0 ? (
        <Pressable onPress={() => router.push("/pantry")}>
          <Card style={styles.warnCard}>
            <View style={styles.warnHead}>
              <AlertTriangle size={16} color={Colors.warning} />
              <Text style={styles.warnTitle}>
                {expiring.length} item{expiring.length > 1 ? "s" : ""} expiring soon
              </Text>
            </View>
            <Text style={styles.warnBody}>{expiring.map((i) => i.name).join(" · ")}</Text>
          </Card>
        </Pressable>
      ) : null}

      <SectionLabel>Explore</SectionLabel>
      <View style={styles.tileGrid}>
        {TILES.map(({ to, label, desc, Icon }) => (
          <Pressable
            key={to}
            onPress={() => router.push(to)}
            style={({ pressed }) => [styles.tileWrap, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Card style={styles.tile}>
              <View style={styles.tileIcon}>
                <Icon size={20} color={Colors.primaryFg} />
              </View>
              <Text style={styles.tileLabel}>{label}</Text>
              <Text style={styles.tileDesc}>{desc}</Text>
            </Card>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

function Stat({ label, value, onPress }: { label: string; value: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.flex}>
      <Card style={styles.statCard}>
        <Text style={styles.kicker}>{label.toUpperCase()}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.lg },
  flex: { flex: 1 },
  kicker: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, color: Colors.muted },
  bigNumber: { fontSize: 28, fontWeight: "800", color: Colors.foreground, marginTop: 2 },
  link: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  linkText: { fontSize: 12, fontWeight: "700", color: Colors.primary },

  statRow: { flexDirection: "row", gap: Spacing.md },
  statCard: { padding: Spacing.lg },
  statValue: { fontSize: 22, fontWeight: "800", color: Colors.foreground, marginTop: 4 },

  warnCard: { borderColor: alpha(Colors.warning, 0.45) },
  warnHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  warnTitle: { fontSize: 13, fontWeight: "700", color: Colors.warning },
  warnBody: { fontSize: 12, color: Colors.muted, marginTop: 4 },

  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.md },
  tileWrap: { width: "47.5%", flexGrow: 1 },
  tile: { minHeight: 116 },
  tileIcon: {
    height: 40, width: 40, borderRadius: Radius.md, backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center", marginBottom: Spacing.sm,
  },
  tileLabel: { fontSize: 14, fontWeight: "700", color: Colors.foreground },
  tileDesc: { fontSize: 11, color: Colors.muted, marginTop: 2 },
});
