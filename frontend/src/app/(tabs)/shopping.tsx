import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CalendarPlus, Check, ShoppingBag, ShoppingCart, Store, X } from "lucide-react-native";

import { ActionButton, Card, EmptyState, Screen, SectionLabel } from "@/components/ui";
import { Colors, Radius, Spacing, alpha } from "@/constants/theme";
import { useApp } from "@/data/store";
import type { ShoppingItem } from "@/data/mockData";

export default function ShoppingScreen() {
  const { state } = useApp();
  const nowItems = state.shopping.filter((s) => !s.forFutureRecipe);
  const futureItems = state.shopping.filter((s) => s.forFutureRecipe);

  // Estimate the basket at the cheapest partner per line. "Healthy food is
  // expensive" is the objection this screen exists to answer, so we show the
  // number rather than hiding it.
  const total = state.shopping.reduce((sum, s) => {
    if (s.checked) return sum;
    const prices = s.stores.map((st) => st.price).filter((p) => p > 0);
    return sum + (prices.length ? Math.min(...prices) : 0);
  }, 0);

  return (
    <Screen title="Shopping List" subtitle="Cross-referenced with Woolworths & Checkers">
      <View style={styles.summaryRow}>
        <View style={[styles.pill, { backgroundColor: alpha(Colors.vitality, 0.15) }]}>
          <Text style={[styles.pillText, { color: Colors.vitality }]}>
            {state.shopping.length} item{state.shopping.length === 1 ? "" : "s"}
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: alpha(Colors.magenta, 0.15) }]}>
          <Text style={[styles.pillText, { color: Colors.magenta }]}>Best-price picks</Text>
        </View>
        <Text style={styles.total}>Est. R{total.toFixed(2)}</Text>
      </View>

      <SectionLabel>Missing for current recipes</SectionLabel>
      {nowItems.map((item) => <Row key={item.id} item={item} />)}
      {nowItems.length === 0 && !state.loading ? (
        <EmptyState
          icon={<ShoppingCart size={24} color={Colors.muted} />}
          title="Nothing missing right now"
          hint="Generate a recipe and anything you don't have will land here."
        />
      ) : null}

      <SectionLabel>Saved for your next shop</SectionLabel>
      <Text style={styles.hint}>
        Items for upcoming recipes carry over here until you buy them.
      </Text>
      {futureItems.map((item) => <Row key={item.id} item={item} />)}
      {futureItems.length === 0 ? (
        <Card style={styles.emptyRow}>
          <Text style={styles.meta}>No future items saved yet.</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

function Row({ item }: { item: ShoppingItem }) {
  const { actions } = useApp();
  const priced = item.stores.filter((s) => s.price > 0);
  const best = priced.length ? [...priced].sort((a, b) => a.price - b.price)[0] : null;
  const worst = priced.length ? Math.max(...priced.map((p) => p.price)) : 0;

  return (
    <Card style={item.checked ? styles.checked : undefined}>
      <View style={styles.rowHead}>
        <View style={styles.flex}>
          <View style={styles.inlineRow}>
            <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
            {item.forFutureRecipe ? (
              <View style={[styles.tag, { backgroundColor: alpha(Colors.magenta, 0.15) }]}>
                <CalendarPlus size={9} color={Colors.magenta} />
                <Text style={[styles.tagText, { color: Colors.magenta }]}>planned</Text>
              </View>
            ) : null}
          </View>
          {item.recipe ? (
            <Text style={styles.meta} numberOfLines={1}>for {item.recipe}</Text>
          ) : null}
        </View>

        <View style={styles.inlineRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mark ${item.name} as picked up`}
            onPress={() => actions.toggleShopping(item.id)}
            hitSlop={6}
            style={[
              styles.checkButton,
              item.checked
                ? { backgroundColor: Colors.vitality, borderColor: Colors.vitality }
                : null,
            ]}
          >
            <Check size={14} color={item.checked ? Colors.vitalityFg : Colors.muted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.name} from the list`}
            onPress={() => actions.removeShopping(item.id)}
            hitSlop={6}
            style={styles.iconButton}
          >
            <X size={14} color={Colors.muted} />
          </Pressable>
        </View>
      </View>

      {item.stores.map((s) => {
        const isBest = best != null && s.name === best.name;
        return (
          <View
            key={s.name}
            style={[
              styles.storeRow,
              { backgroundColor: isBest ? alpha(Colors.vitality, 0.12) : Colors.surface2 },
            ]}
          >
            <View style={[styles.inlineRow, styles.flex]}>
              <Store size={14} color={isBest ? Colors.vitality : Colors.muted} />
              <Text style={styles.storeName} numberOfLines={1}>{s.name}</Text>
              {s.healthy ? (
                <View style={[styles.tag, { backgroundColor: alpha(Colors.magenta, 0.15) }]}>
                  <Text style={[styles.tagText, { color: Colors.magenta }]}>HealthyFood</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.price, isBest ? { color: Colors.vitality } : null]}>
              {s.price > 0 ? `R${s.price.toFixed(2)}` : "—"}
            </Text>
          </View>
        );
      })}

      {priced.length > 1 && best ? (
        <Text style={styles.saving}>
          Cheapest at {best.name} — saves R{(worst - best.price).toFixed(2)} versus the priciest partner.
        </Text>
      ) : null}

      <ActionButton
        label="Bought — move to pantry"
        icon={<ShoppingBag size={15} color={Colors.primaryFg} />}
        onPress={() => actions.buyShopping(item.id)}
        style={{ marginTop: Spacing.md }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  hint: { fontSize: 12, color: Colors.muted, lineHeight: 17 },
  meta: { fontSize: 11, color: Colors.muted, marginTop: 2 },

  summaryRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, flexWrap: "wrap" },
  pill: { borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { fontSize: 12, fontWeight: "600" },
  total: { marginLeft: "auto", fontSize: 14, fontWeight: "800", color: Colors.foreground },

  checked: { opacity: 0.6 },
  rowHead: { flexDirection: "row", justifyContent: "space-between", gap: Spacing.sm },
  itemName: { fontSize: 14, fontWeight: "700", color: Colors.foreground, flexShrink: 1 },

  checkButton: {
    height: 32, width: 32, borderRadius: 16, borderWidth: 1, borderColor: Colors.border,
    alignItems: "center", justifyContent: "center",
  },
  iconButton: { height: 32, width: 32, alignItems: "center", justifyContent: "center" },

  storeRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    gap: Spacing.sm, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 9, marginTop: 6,
  },
  storeName: { fontSize: 13, color: Colors.foreground, flexShrink: 1 },
  price: { fontSize: 13, fontWeight: "700", color: Colors.foreground },
  saving: { fontSize: 11, color: Colors.muted, marginTop: Spacing.sm },

  tag: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: Colors.surface2, borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  tagText: { fontSize: 9, fontWeight: "700", color: Colors.muted },

  emptyRow: { alignItems: "center", paddingVertical: Spacing.lg },
});
