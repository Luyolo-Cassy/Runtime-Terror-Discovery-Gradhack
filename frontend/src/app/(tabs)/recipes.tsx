import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  ChefHat, ChevronDown, ChevronUp, Clock, Recycle, ShoppingCart, Sparkles, Store, Wallet,
} from "lucide-react-native";

import { ActionButton, Card, Chip, EmptyState, Screen, SectionLabel } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { Colors, Radius, Spacing, alpha } from "@/constants/theme";
import { useApp } from "@/data/store";
import type { MissingIngredient, SavedRecipe } from "@/data/mockData";

export default function RecipesScreen() {
  const { state, actions } = useApp();
  const generating = Boolean(state.busy.recipe);
  const current = state.currentRecipe;

  return (
    <Screen title="Recipes" subtitle="Built from what's already in your kitchen">
      <View style={styles.actionRow}>
        <ActionButton
          label="Suggest a meal"
          icon={<Sparkles size={18} color={Colors.primaryFg} />}
          onPress={() => actions.generateRecipe(false)}
          busy={generating}
          style={styles.flex}
        />
        <ActionButton
          label="Zero-waste"
          variant="magenta"
          icon={<Recycle size={18} color={Colors.magentaFg} />}
          onPress={() => actions.generateRecipe(true)}
          busy={generating}
          style={styles.flex}
        />
      </View>
      <Text style={styles.centerHint}>
        Both use your pantry and profile. Zero-waste prioritises whatever is closest to expiring.
      </Text>

      {current?.recipe ? (
        <>
          <SectionLabel>Fresh from the kitchen</SectionLabel>
          <Card>
            <View style={styles.recipeHead}>
              <Text style={styles.recipeTitle}>{current.recipe_name}</Text>
              <ChefHat size={18} color={Colors.primary} />
            </View>

            {/* Showing WHY this recipe is the difference between "an LLM wrote
                something" and "the app knows me". */}
            <View style={styles.chipRow}>
              {current.focus_items?.length ? (
                <Chip tone="magenta" icon={<Recycle size={10} color={Colors.magenta} />}>
                  {`uses ${current.focus_items.length} expiring item${current.focus_items.length > 1 ? "s" : ""}`}
                </Chip>
              ) : null}
              {current.personalized_for?.budget_tier ? (
                <Chip icon={<Wallet size={10} color={Colors.muted} />}>
                  {`${current.personalized_for.budget_tier} budget`}
                </Chip>
              ) : null}
              {current.personalized_for?.preferred_category ? (
                <Chip>{current.personalized_for.preferred_category}</Chip>
              ) : null}
              {current.personalized_for?.vitality_tier ? (
                <Chip>{`${current.personalized_for.vitality_tier} tier`}</Chip>
              ) : null}
            </View>

            <Markdown text={current.recipe} />

            <MissingList
              missing={current.missing_ingredients ?? []}
              onAdd={(items, forFuture) =>
                actions.addMissingToShopping(items, current.recipe_name, forFuture)
              }
            />
          </Card>
        </>
      ) : null}

      <SectionLabel>Saved recipes</SectionLabel>
      {state.recipes.map((r) => (
        <SavedRecipeCard
          key={r.recipe_id}
          recipe={r}
          onAdd={(items, forFuture) => actions.addMissingToShopping(items, r.recipe_name, forFuture)}
        />
      ))}
      {state.recipes.length === 0 && !state.loading ? (
        <EmptyState
          icon={<ChefHat size={24} color={Colors.muted} />}
          title="No recipes yet"
          hint="Generate one above — it'll be saved here so you can cook it again."
        />
      ) : null}
    </Screen>
  );
}

function SavedRecipeCard({
  recipe, onAdd,
}: {
  recipe: SavedRecipe;
  onAdd: (items: MissingIngredient[], forFuture: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const when = recipe.created_at ? new Date(recipe.created_at) : null;
  const validDate = when && !Number.isNaN(when.getTime());

  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.savedHead}
      >
        <View style={styles.flex}>
          <Text style={styles.savedTitle} numberOfLines={1}>{recipe.recipe_name}</Text>
          <View style={styles.savedMetaRow}>
            {validDate ? (
              <View style={styles.inlineRow}>
                <Clock size={10} color={Colors.muted} />
                <Text style={styles.meta}>
                  {when.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                </Text>
              </View>
            ) : null}
            {recipe.missing_ingredients.length > 0 ? (
              <Text style={styles.meta}>{recipe.missing_ingredients.length} item(s) to buy</Text>
            ) : null}
          </View>
        </View>
        {open
          ? <ChevronUp size={16} color={Colors.muted} />
          : <ChevronDown size={16} color={Colors.muted} />}
      </Pressable>

      {open ? (
        <>
          <Markdown text={recipe.recipe_text} />
          <MissingList missing={recipe.missing_ingredients} onAdd={onAdd} />
        </>
      ) : null}
    </Card>
  );
}

function MissingList({
  missing, onAdd,
}: {
  missing: MissingIngredient[];
  onAdd: (items: MissingIngredient[], forFuture: boolean) => void;
}) {
  if (!missing.length) {
    return (
      <View style={styles.haveAll}>
        <Text style={styles.haveAllText}>
          You already have everything for this. Nothing to buy.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.missingWrap}>
      <Text style={styles.missingLabel}>STILL NEED TO BUY</Text>
      {missing.map((m) => (
        <View key={m.item_name} style={styles.missingRow}>
          <Text style={styles.missingName} numberOfLines={1}>{m.item_name}</Text>
          {m.retailer ? (
            <View style={styles.inlineRow}>
              <Store size={9} color={Colors.muted} />
              <Text style={styles.meta}>{m.retailer}</Text>
            </View>
          ) : null}
        </View>
      ))}

      <View style={styles.actionRow}>
        <ActionButton
          label="Add to list"
          icon={<ShoppingCart size={15} color={Colors.primaryFg} />}
          onPress={() => onAdd(missing, false)}
          style={styles.flex}
        />
        <ActionButton label="Next shop" variant="outline" onPress={() => onAdd(missing, true)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionRow: { flexDirection: "row", gap: Spacing.md, marginTop: Spacing.md },
  centerHint: { fontSize: 11, color: Colors.muted, textAlign: "center", marginTop: -4, lineHeight: 16 },

  recipeHead: { flexDirection: "row", justifyContent: "space-between", gap: Spacing.sm },
  recipeTitle: { flex: 1, fontSize: 18, fontWeight: "800", color: Colors.foreground },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: Spacing.md },

  savedHead: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  savedTitle: { fontSize: 14, fontWeight: "700", color: Colors.foreground },
  savedMetaRow: { flexDirection: "row", gap: Spacing.md, marginTop: 3, alignItems: "center" },
  meta: { fontSize: 11, color: Colors.muted },

  haveAll: {
    marginTop: Spacing.lg, borderRadius: Radius.md, padding: Spacing.md,
    backgroundColor: alpha(Colors.vitality, 0.12),
    borderWidth: 1, borderColor: alpha(Colors.vitality, 0.35),
  },
  haveAllText: { fontSize: 12, fontWeight: "700", color: Colors.vitality },

  missingWrap: { marginTop: Spacing.lg, gap: 6 },
  missingLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1, color: Colors.muted },
  missingRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    gap: Spacing.sm, backgroundColor: Colors.surface2,
    borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 9,
  },
  missingName: { flex: 1, fontSize: 13, color: Colors.foreground },
});
