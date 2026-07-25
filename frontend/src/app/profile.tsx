import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, ActivityIndicator } from "react-native";
import {
  Calendar, Check, Diamond, Link2, Mail, Pencil, RotateCcw, ShoppingBasket,
  TrendingUp, Users, Wallet,
} from "lucide-react-native";

import { ActionButton, Card, Screen, SectionLabel } from "@/components/ui";
import { VitalityRing } from "@/components/vitality-ring";
import { Colors, Radius, Spacing, alpha } from "@/constants/theme";
import { TIERS, useApp } from "@/data/store";
import * as api from "@/data/api";

const ALL_PARTNERS = ["Checkers", "Woolworths"];

export default function ProfileScreen() {
  const { state, actions } = useApp();
  const { profile, pantry, points, users } = state;

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);

  // Keep the form in step when the profile is replaced by a user switch.
  useEffect(() => {
    setName(profile.name);
    setEmail(profile.email);
  }, [profile.name, profile.email]);

  return (
    <Screen title="Profile" subtitle="Your account and Vitality status">
      <Card style={styles.row}>
        <VitalityRing
          value={profile.healthScore}
          size={106}
          stroke={13}
          label={`${profile.healthScore}`}
          sublabel="health score"
        />
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1}>{profile.name}</Text>
          <Text style={styles.meta} numberOfLines={1}>{profile.userId}</Text>
          <View style={styles.tierPill}>
            <Diamond size={12} color={Colors.goldFg} />
            <Text style={styles.tierText}>{profile.tier} status</Text>
          </View>
        </View>
      </Card>
      <Text style={styles.hint}>
        Health score is the share of your till-slip spend that the HealthyFood
        catalogue classifies as healthy.
      </Text>

      <View style={styles.statRow}>
        <Card style={[styles.flex, styles.statCard]}>
          <Text style={styles.kicker}>VITALITY POINTS</Text>
          <Text style={styles.statValue}>{points.toLocaleString()}</Text>
        </Card>
        <Card style={[styles.flex, styles.statCard]}>
          <Text style={styles.kicker}>PANTRY ITEMS</Text>
          <Text style={styles.statValue}>{pantry.length}</Text>
        </Card>
      </View>

      {/* The computed profile — what the system inferred, not what was typed. */}
      <SectionLabel>What we've learned about you</SectionLabel>
      <Card>
        <Row
          icon={<Wallet size={15} color={Colors.muted} />}
          label="Budget tier"
          value={profile.budgetTier ? cap(profile.budgetTier) : "—"}
        />
        <Row
          icon={<ShoppingBasket size={15} color={Colors.muted} />}
          label="Average basket"
          value={profile.avgBasketSpend != null ? `R${profile.avgBasketSpend.toFixed(2)}` : "—"}
        />
        <Row
          icon={<TrendingUp size={15} color={Colors.muted} />}
          label="Favourite category"
          value={profile.preferredCategory ?? "—"}
        />
        <Text style={styles.hint}>
          Inferred from your purchase history — it sharpens every recipe and swap
          the app suggests.
        </Text>
      </Card>

      <EvolutionCard userId={profile.userId} />

      <SectionLabel>Vitality status track</SectionLabel>
      <Card>
        <View style={styles.tierTrack}>
          {TIERS.map((t) => {
            const passed = TIERS.indexOf(t) <= TIERS.indexOf(profile.tier);
            return (
              <View key={t} style={styles.tierStep}>
                <View style={[styles.tierDot, passed ? styles.tierDotOn : styles.tierDotOff]} />
                <Text style={[styles.tierLabel, t === profile.tier ? styles.tierLabelOn : null]}>
                  {t}
                </Text>
              </View>
            );
          })}
        </View>
        <Text style={styles.hint}>
          Keep earning points and eating well to reach Diamond and unlock higher CashBack.
        </Text>
      </Card>

      {users.length > 0 ? (
        <>
          <SectionLabel>Switch customer</SectionLabel>
          <Text style={styles.hint}>
            Real customer IDs from the dataset — useful for showing how differently
            the app behaves for different shopping habits.
          </Text>
          <Card>
            {users.slice(0, 12).map((u) => {
              const current = u.user_id === profile.userId;
              return (
                <Pressable
                  key={u.user_id}
                  accessibilityRole="button"
                  disabled={current || state.loading}
                  onPress={() => actions.switchUser(u.user_id)}
                  style={[styles.userRow, current ? styles.userRowActive : null]}
                >
                  <View style={[styles.inlineRow, styles.flex]}>
                    <Users size={14} color={current ? Colors.primary : Colors.muted} />
                    <View style={styles.flex}>
                      <Text
                        style={[styles.userName, current ? { color: Colors.primary } : null]}
                        numberOfLines={1}
                      >
                        {u.name}
                      </Text>
                      <Text style={styles.meta}>{u.user_id}</Text>
                    </View>
                  </View>
                  <Text style={styles.meta}>{current ? "current" : `${u.baskets} baskets`}</Text>
                </Pressable>
              );
            })}
          </Card>
        </>
      ) : null}

      <SectionLabel>Account</SectionLabel>
      <Card>
        {editing ? (
          <>
            <Text style={styles.inputLabel}>Name</Text>
            <TextInput value={name} onChangeText={setName} style={styles.input} />
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />
            <View style={styles.editButtons}>
              <ActionButton
                label="Save"
                icon={<Check size={14} color={Colors.primaryFg} />}
                onPress={() => { actions.updateProfile({ name, email }); setEditing(false); }}
                style={styles.flex}
              />
              <ActionButton
                label="Cancel"
                variant="outline"
                onPress={() => { setName(profile.name); setEmail(profile.email); setEditing(false); }}
              />
            </View>
            <Text style={styles.hint}>
              Saved on this device only — we don't send personal contact details to the API.
            </Text>
          </>
        ) : (
          <>
            <Row icon={<Mail size={15} color={Colors.muted} />} label="Email" value={profile.email} />
            <Row icon={<Calendar size={15} color={Colors.muted} />} label="Member since" value={profile.memberSince} />
            <ActionButton
              label="Edit profile"
              variant="outline"
              icon={<Pencil size={14} color={Colors.foreground} />}
              onPress={() => setEditing(true)}
              style={{ marginTop: Spacing.md }}
            />
          </>
        )}
      </Card>

      <SectionLabel>Linked partners</SectionLabel>
      <Text style={styles.hint}>
        Linked stores share your basket ID so your pantry stays up to date without
        you scanning anything.
      </Text>
      <Card>
        {ALL_PARTNERS.map((p) => {
          const linked = profile.linkedPartners.includes(p);
          return (
            <View key={p} style={styles.partnerRow}>
              <View style={styles.inlineRow}>
                <Link2 size={14} color={linked ? Colors.primary : Colors.muted} />
                <Text style={styles.partnerName}>{p}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  actions.updateProfile({
                    linkedPartners: linked
                      ? profile.linkedPartners.filter((x) => x !== p)
                      : [...profile.linkedPartners, p],
                  })
                }
                style={[
                  styles.partnerButton,
                  { backgroundColor: linked ? alpha(Colors.primary, 0.15) : Colors.surface2 },
                ]}
              >
                <Text style={[styles.partnerButtonText, linked ? { color: Colors.primary } : null]}>
                  {linked ? "Linked" : "Link"}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </Card>

      <ActionButton
        label={state.mode === "live" ? "Reload from API" : "Reset demo data"}
        variant="outline"
        icon={<RotateCcw size={15} color={Colors.muted} />}
        onPress={actions.reset}
      />
    </Screen>
  );
}

/**
 * Requirement 4.4 made visible: the same profile computed on the customer's
 * first few baskets versus their whole history, side by side. It's the clearest
 * way to show the profile develops with data rather than being a static row.
 */
function EvolutionCard({ userId }: { userId: string }) {
  const [data, setData] = useState<{
    new_user_profile: api.EvolutionSnapshot;
    established_profile: api.EvolutionSnapshot;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!api.IS_LIVE) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    api.getProfileEvolution(userId)
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  if (!api.IS_LIVE) return null;

  if (loading) {
    return (
      <Card style={[styles.inlineRow, { padding: Spacing.lg }]}>
        <ActivityIndicator size="small" color={Colors.primary} />
        <Text style={styles.meta}>Comparing your first baskets to today…</Text>
      </Card>
    );
  }
  if (!data) return null;

  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

  return (
    <>
      <SectionLabel>How your profile has developed</SectionLabel>
      <Card>
        <View style={styles.snapshotRow}>
          <Snapshot
            title="First 3 baskets"
            healthy={pct(data.new_user_profile.healthy_spend_pct)}
            snapshot={data.new_user_profile}
            muted
          />
          <Snapshot
            title="Today"
            healthy={pct(data.established_profile.healthy_spend_pct)}
            snapshot={data.established_profile}
          />
        </View>
        <Text style={styles.hint}>
          The system knew very little at sign-up. Every slip since then has sharpened
          what it recommends — {data.established_profile.basket_count} baskets in total.
        </Text>
      </Card>
    </>
  );
}

function Snapshot({
  title, healthy, snapshot, muted,
}: {
  title: string;
  healthy: string;
  snapshot: api.EvolutionSnapshot;
  muted?: boolean;
}) {
  return (
    <View
      style={[
        styles.snapshot,
        muted
          ? { backgroundColor: Colors.surface2 }
          : {
              backgroundColor: alpha(Colors.vitality, 0.1),
              borderWidth: 1,
              borderColor: alpha(Colors.vitality, 0.35),
            },
      ]}
    >
      <Text style={styles.kicker}>{title.toUpperCase()}</Text>
      <Text style={[styles.snapshotValue, muted ? null : { color: Colors.vitality }]}>{healthy}</Text>
      <Text style={styles.snapshotCaption}>healthy spend</Text>
      <Text style={styles.snapshotLine}>R{snapshot.avg_basket_spend?.toFixed(0) ?? "—"} avg basket</Text>
      <Text style={styles.snapshotLine}>{snapshot.budget_tier ? cap(snapshot.budget_tier) : "—"} budget</Text>
      {snapshot.preferred_category ? (
        <Text style={styles.snapshotLine} numberOfLines={2}>{snapshot.preferred_category}</Text>
      ) : null}
    </View>
  );
}

function cap(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.inlineRow}>
        {icon}
        <Text style={styles.detailLabel}>{label}</Text>
      </View>
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.lg },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  kicker: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, color: Colors.muted },
  meta: { fontSize: 11, color: Colors.muted },
  hint: { fontSize: 12, color: Colors.muted, lineHeight: 17, marginTop: Spacing.sm },

  name: { fontSize: 18, fontWeight: "800", color: Colors.foreground },
  tierPill: {
    flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start",
    backgroundColor: Colors.gold, borderRadius: Radius.pill,
    paddingHorizontal: 10, paddingVertical: 5, marginTop: Spacing.sm,
  },
  tierText: { fontSize: 12, fontWeight: "700", color: Colors.goldFg },

  statRow: { flexDirection: "row", gap: Spacing.md },
  statCard: { padding: Spacing.lg },
  statValue: { fontSize: 22, fontWeight: "800", color: Colors.foreground, marginTop: 4 },

  detailRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    gap: Spacing.md, paddingVertical: 6,
  },
  detailLabel: { fontSize: 13, color: Colors.muted },
  detailValue: { flex: 1, fontSize: 13, fontWeight: "600", color: Colors.foreground, textAlign: "right" },

  snapshotRow: { flexDirection: "row", gap: Spacing.md },
  snapshot: { flex: 1, borderRadius: Radius.md, padding: Spacing.md },
  snapshotValue: { fontSize: 22, fontWeight: "800", color: Colors.foreground, marginTop: 4 },
  snapshotCaption: { fontSize: 10, color: Colors.muted },
  snapshotLine: { fontSize: 11, color: Colors.muted, marginTop: 3 },

  tierTrack: { flexDirection: "row", justifyContent: "space-between" },
  tierStep: { flex: 1, alignItems: "center", gap: 6 },
  tierDot: { height: 12, width: 12, borderRadius: 6 },
  tierDotOn: { backgroundColor: Colors.gold },
  tierDotOff: { backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border },
  tierLabel: { fontSize: 10, color: Colors.muted },
  tierLabelOn: { fontWeight: "800", color: Colors.foreground },

  userRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    gap: Spacing.sm, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 9,
  },
  userRowActive: { backgroundColor: alpha(Colors.primary, 0.1) },
  userName: { fontSize: 13, fontWeight: "600", color: Colors.foreground },

  inputLabel: { fontSize: 11, color: Colors.muted, marginTop: Spacing.sm },
  input: {
    borderWidth: 1, borderColor: Colors.input, backgroundColor: Colors.surface,
    borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: 9,
    fontSize: 14, color: Colors.foreground, marginTop: 4,
  },
  editButtons: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.md },

  partnerRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", paddingVertical: 7,
  },
  partnerName: { fontSize: 13, color: Colors.foreground },
  partnerButton: { borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  partnerButtonText: { fontSize: 12, fontWeight: "700", color: Colors.muted },
});
