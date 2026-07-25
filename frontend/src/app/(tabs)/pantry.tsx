import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import {
  AlertTriangle, ArrowRight, Boxes, Droplet, Plus, Salad, Sparkles, Store,
  Trash2, Wheat,
} from "lucide-react-native";

import { ActionButton, Card, EmptyState, Screen, SectionLabel } from "@/components/ui";
import { VitalityRing } from "@/components/vitality-ring";
import { Colors, Radius, Spacing, alpha } from "@/constants/theme";
import { useApp } from "@/data/store";
import type { PantryItem, Substitution } from "@/data/mockData";

const INSIGHT_ICONS = { wheat: Wheat, salad: Salad, droplet: Droplet } as const;

const SOURCE_LABEL: Record<string, string> = {
  checkers: "Checkers", woolworths: "Woolworths", scan: "Scanned",
  shopping: "Bought", manual: "Added", partner: "Partner",
};

function expiryTone(days: number) {
  if (days <= 0) return { label: "Use now", color: Colors.destructive };
  if (days <= 2) return { label: `${days}d left`, color: Colors.destructive };
  if (days <= 5) return { label: `${days}d left`, color: Colors.warning };
  return { label: `${days}d left`, color: Colors.muted };
}

export default function PantryScreen() {
  const { state, actions } = useApp();
  const router = useRouter();
  const { pantry, insights, swaps } = state;

  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);

  const expiringSoon = pantry.filter((i) => i.expiresIn <= 3);
  const generating = Boolean(state.busy.recipe);

  // Share of stored items the HealthyFood catalogue classified as healthy —
  // not a guess based on the category name.
  const healthyShare = pantry.length
    ? Math.round((pantry.filter((i) => i.isHealthy !== false).length / pantry.length) * 100)
    : 0;

  async function handleZeroWaste() {
    const recipe = await actions.generateRecipe(true);
    if (recipe) router.push("/recipes");
  }

  async function handleAdd() {
    if (!newItem.trim()) return;
    setAdding(true);
    await actions.addPantryItem(newItem);
    setNewItem("");
    setAdding(false);
  }

  return (
    <Screen
      title="Your Pantry"
      subtitle={`${pantry.length} items · ${expiringSoon.length} need attention`}
    >
      <Card style={styles.row}>
        <VitalityRing value={healthyShare} size={100} stroke={12} label={`${healthyShare}%`} sublabel="healthy" />
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>Pantry health</Text>
          <Text style={styles.cardBody}>
            The share of what's in your kitchen right now that the HealthyFood
            catalogue classifies as healthy.
          </Text>
        </View>
      </Card>

      <ActionButton
        label={generating ? "Writing your recipe…" : "Generate Zero-Waste Recipe"}
        icon={<Sparkles size={18} color={Colors.primaryFg} />}
        onPress={handleZeroWaste}
        busy={generating}
        disabled={pantry.length === 0}
      />
      {expiringSoon.length > 0 ? (
        <Text style={styles.centerHint}>
          Built around your {expiringSoon.length} item{expiringSoon.length > 1 ? "s" : ""} closest to expiring.
        </Text>
      ) : null}

      {expiringSoon.length > 0 ? (
        <Card style={{ borderColor: alpha(Colors.warning, 0.45) }}>
          <View style={styles.inlineRow}>
            <AlertTriangle size={16} color={Colors.warning} />
            <Text style={styles.warnTitle}>Expiring soon</Text>
          </View>
          <Text style={styles.cardBody}>{expiringSoon.map((i) => i.name).join(" · ")}</Text>
        </Card>
      ) : null}

      <SectionLabel>Insights for you</SectionLabel>
      {insights.map((ins) => {
        const Icon = INSIGHT_ICONS[ins.icon as keyof typeof INSIGHT_ICONS] ?? Salad;
        const tone = ins.tone === "warn"
          ? Colors.warning
          : ins.tone === "good" ? Colors.vitality : Colors.electric;
        return (
          <Card key={ins.id} style={styles.tightCard}>
            <View style={styles.insightRow}>
              <View style={[styles.insightIcon, { backgroundColor: alpha(tone, 0.15) }]}>
                <Icon size={16} color={tone} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.itemName}>{ins.title}</Text>
                <Text style={styles.cardBody}>{ins.detail}</Text>
              </View>
            </View>
          </Card>
        );
      })}

      {swaps.length > 0 ? (
        <>
          <SectionLabel>Suggested swaps</SectionLabel>
          <Text style={styles.hint}>
            Picked from things you buy repeatedly, replaced with a real catalogue
            product at a store you already shop at.
          </Text>
          {swaps.map((swap) => <SwapCard key={`${swap.from}-${swap.to}`} swap={swap} />)}
        </>
      ) : null}

      <SectionLabel>Stored items</SectionLabel>
      <View style={styles.addRow}>
        <TextInput
          value={newItem}
          onChangeText={setNewItem}
          onSubmitEditing={handleAdd}
          placeholder="Add something you already have…"
          placeholderTextColor={Colors.muted}
          accessibilityLabel="Add a pantry item"
          returnKeyType="done"
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add item"
          onPress={handleAdd}
          disabled={adding || !newItem.trim()}
          style={({ pressed }) => [
            styles.addButton,
            { opacity: adding || !newItem.trim() ? 0.5 : pressed ? 0.85 : 1 },
          ]}
        >
          <Plus size={18} color={Colors.primaryFg} />
        </Pressable>
      </View>

      {pantry.map((item) => <PantryRow key={item.id} item={item} />)}

      {pantry.length === 0 && !state.loading ? (
        <EmptyState
          icon={<Boxes size={24} color={Colors.muted} />}
          title="Your pantry is empty"
          hint="Import a partner basket on the Receipts tab, or add an item above."
        />
      ) : null}
    </Screen>
  );
}

function SwapCard({ swap }: { swap: Substitution }) {
  const { actions } = useApp();
  return (
    <Card style={{ borderColor: alpha(Colors.magenta, 0.35) }}>
      <View style={styles.swapHead}>
        <Text style={styles.itemName}>{swap.from}</Text>
        <ArrowRight size={14} color={Colors.magenta} />
        <Text style={[styles.itemName, { color: Colors.magenta }]}>{swap.to}</Text>
      </View>
      <Text style={styles.cardBody}>{swap.reason}</Text>
      {swap.retailer ? (
        <View style={[styles.inlineRow, { marginTop: 4 }]}>
          <Store size={10} color={Colors.muted} />
          <Text style={styles.meta}>Available at {swap.retailer}</Text>
        </View>
      ) : null}
      <ActionButton
        label="Swap it (+10 pts)"
        variant="magenta"
        onPress={() => actions.acceptSwap(swap)}
        style={styles.swapButton}
      />
    </Card>
  );
}

function PantryRow({ item }: { item: PantryItem }) {
  const { actions } = useApp();
  const tone = expiryTone(item.expiresIn);

  return (
    <Card style={styles.tightCard}>
      <View style={styles.itemRow}>
        <View style={styles.flex}>
          <View style={styles.inlineRow}>
            <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
            {item.substituted ? (
              <View style={[styles.tag, { backgroundColor: alpha(Colors.vitality, 0.15) }]}>
                <Text style={[styles.tagText, { color: Colors.vitality }]}>swapped</Text>
              </View>
            ) : null}
          </View>
          <View style={[styles.inlineRow, { marginTop: 3 }]}>
            <Text style={styles.meta} numberOfLines={1}>{item.category}</Text>
            {item.source ? (
              <View style={styles.tag}>
                <Store size={9} color={Colors.muted} />
                <Text style={styles.tagText}>{SOURCE_LABEL[item.source] ?? item.source}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.inlineRow}>
          <View style={[styles.pill, { backgroundColor: alpha(tone.color, 0.15) }]}>
            <Text style={[styles.pillText, { color: tone.color }]}>{tone.label}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.name}`}
            onPress={() => actions.removePantryItem(item.id)}
            hitSlop={8}
            style={styles.iconButton}
          >
            <Trash2 size={14} color={Colors.muted} />
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.lg },
  flex: { flex: 1 },
  tightCard: { padding: Spacing.md },
  cardTitle: { fontSize: 14, fontWeight: "700", color: Colors.foreground },
  cardBody: { fontSize: 12, color: Colors.muted, marginTop: 4, lineHeight: 17 },
  hint: { fontSize: 12, color: Colors.muted, lineHeight: 17 },
  centerHint: { fontSize: 11, color: Colors.muted, textAlign: "center", marginTop: -6 },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  warnTitle: { fontSize: 13, fontWeight: "700", color: Colors.warning },

  insightRow: { flexDirection: "row", gap: Spacing.md, alignItems: "flex-start" },
  insightIcon: { height: 36, width: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },

  swapHead: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  swapButton: { marginTop: Spacing.md, alignSelf: "flex-start", paddingVertical: 10 },

  addRow: { flexDirection: "row", gap: Spacing.sm },
  input: {
    flex: 1, borderWidth: 1, borderColor: Colors.input, backgroundColor: Colors.surface,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10,
    fontSize: 14, color: Colors.foreground,
  },
  addButton: {
    height: 44, width: 44, borderRadius: Radius.md, backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
  },

  itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: Spacing.sm },
  itemName: { fontSize: 14, fontWeight: "600", color: Colors.foreground, flexShrink: 1 },
  meta: { fontSize: 11, color: Colors.muted, flexShrink: 1 },
  tag: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: Colors.surface2, borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  tagText: { fontSize: 9, fontWeight: "700", color: Colors.muted },
  pill: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: "600" },
  iconButton: { height: 28, width: 28, alignItems: "center", justifyContent: "center" },
});
