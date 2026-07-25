import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Sparkles, Trophy, Zap } from "lucide-react-native";

import { Card, ProgressBar, Screen, SectionLabel } from "@/components/ui";
import { VitalityRing } from "@/components/vitality-ring";
import { Colors, Radius, Spacing, alpha } from "@/constants/theme";
import { useApp } from "@/data/store";

export default function RewardsScreen() {
  const { state } = useApp();
  const { profile, points, trend, badges, challenges } = state;

  const nextReward = challenges.find((challenge) => !challenge.done);
  const ringValue = nextReward
    ? Math.min(100, Math.round(((nextReward.have ?? 0) / Math.max(nextReward.target ?? 1, 1)) * 100))
    : 100;

  const goalRewards = [
    {
      id: "healthy-choice",
      title: "Healthy choices streak",
      reward: "Vitality boost",
      description: "Unlocked when you keep choosing healthier baskets, swaps, and recipes.",
      unlocked: badges.some((badge) => badge.earned) || challenges.some((challenge) => challenge.done),
      detail: badges.some((badge) => badge.earned) || challenges.some((challenge) => challenge.done)
        ? "You are building a strong healthy-living pattern."
        : "Keep going with healthier purchases and meal decisions.",
    },
    {
      id: "financial-wellness",
      title: "Financial wellness goal",
      reward: "Cashback uplift",
      description: "Unlocked when your healthy-spend trend stays strong and your pantry choices stay intentional.",
      unlocked: profile.healthScore >= 60 || trend.some((month) => month.healthy >= 60),
      detail: profile.healthScore >= 60 || trend.some((month) => month.healthy >= 60)
        ? "Your spending pattern is supporting both wellness and value."
        : "A stronger healthy-share of spend will unlock this reward.",
    },
    {
      id: "zero-waste",
      title: "Zero-waste cooking goal",
      reward: "Healthy habit bonus",
      description: "Unlocked when you use expiring items and cook more sustainably.",
      unlocked: badges.some((badge) => badge.id === "b-waste" && badge.earned) || challenges.some((challenge) => challenge.id === "c-waste" && challenge.done),
      detail: badges.some((badge) => badge.id === "b-waste" && badge.earned) || challenges.some((challenge) => challenge.id === "c-waste" && challenge.done)
        ? "You are turning food waste into a healthier habit."
        : "Try a zero-waste recipe to unlock this reward.",
    },
  ];

  return (
    <Screen title="Your Rewards" subtitle={`${profile.tier} tier · powered by Vitality`}>
      <View style={styles.cashback}>
        <View style={styles.cashbackHead}>
          <Text style={styles.cashbackKicker}>DISCOVERY MILES</Text>
          <Trophy size={18} color={Colors.goldFg} />
        </View>
        <View style={styles.cashbackValueRow}>
          <Text style={styles.cashbackValue}>{profile.cashbackPercent}%</Text>
          <Text style={styles.cashbackTier}>back in Discovery Miles</Text>
        </View>
        <View style={styles.cashbackFoot}>
          <Text style={styles.cashbackFootLabel}>Est. back on an average basket · {profile.tier} tier</Text>
          <Text style={styles.cashbackFootValue}>R{profile.cashbackMonth.toFixed(2)}</Text>
        </View>
      </View>

      <Card style={styles.row}>
        <VitalityRing
          value={ringValue}
          size={94}
          stroke={11}
          label={points.toLocaleString()}
          sublabel="points"
        />
        <View style={styles.flex}>
          <Text style={styles.kicker}>VITALITY POINTS</Text>
          <View style={[styles.inlineRow, { marginTop: 4 }]}>
            <Sparkles size={14} color={Colors.vitality} />
            <Text style={styles.vitalityText}>
              {nextReward
                ? `${nextReward.have ?? 0}/${nextReward.target ?? 1} toward the next goal`
                : "All goals are on track"}
            </Text>
          </View>
          <Text style={styles.body}>
            {nextReward
              ? `Keep building healthy habits to unlock the next Vitality reward.`
              : "Your recent choices are already helping you reach your goals."}
          </Text>
        </View>
      </Card>

      <SectionLabel>Goal-based Vitality rewards</SectionLabel>
      {goalRewards.map((reward) => (
        <Card key={reward.id} style={[styles.voucher, reward.unlocked ? styles.voucherUnlocked : null]}>
          <View style={styles.rowHead}>
            <View style={styles.flex}>
              <View style={styles.inlineRow}>
                <Sparkles size={15} color={reward.unlocked ? Colors.vitality : Colors.muted} />
                <Text style={styles.itemName} numberOfLines={1}>{reward.title}</Text>
              </View>
              <Text style={styles.body}>{reward.description}</Text>
            </View>
            <Text style={[styles.reward, reward.unlocked ? styles.rewardUnlocked : null]}>{reward.reward}</Text>
          </View>
          <Text style={styles.meta}>{reward.detail}</Text>
        </Card>
      ))}

      <SectionLabel>Challenges</SectionLabel>
      {challenges.map((ch) => (
        <Card key={ch.id}>
          <View style={styles.rowHead}>
            <View style={styles.flex}>
              <View style={styles.inlineRow}>
                <Zap size={15} color={Colors.magenta} />
                <Text style={styles.itemName} numberOfLines={1}>{ch.title}</Text>
              </View>
              <Text style={styles.body}>{ch.desc}</Text>
            </View>
            <Text style={styles.reward}>+{ch.reward}</Text>
          </View>

          <ProgressBar value={ch.progress} color={Colors.magenta} />
          {ch.target != null ? (
            <Text style={styles.meta}>{ch.have ?? 0} of {ch.target} done</Text>
          ) : null}

          <View style={styles.challengeStatusWrap}>
            <Text style={[styles.challengeStatus, ch.done ? styles.challengeStatusDone : null]}>
              {ch.done ? "Goal reached" : "In progress"}
            </Text>
          </View>
        </Card>
      ))}

      {trend.length > 0 ? (
        <>
          <SectionLabel>Healthy share of spend</SectionLabel>
          <Card>
            <View style={styles.chart}>
              {trend.map((m) => (
                <View key={m.month} style={styles.chartCol}>
                  <Text style={styles.chartValue}>{m.healthy}%</Text>
                  <View style={styles.chartBars}>
                    <View style={[styles.barHealthy, { flex: Math.max(m.healthy, 1) }]} />
                    <View style={[styles.barOther, { flex: Math.max(m.unhealthy, 1) }]} />
                  </View>
                  <Text style={styles.meta}>{m.month}</Text>
                </View>
              ))}
            </View>
            <View style={styles.legend}>
              <View style={styles.inlineRow}>
                <View style={[styles.swatch, { backgroundColor: Colors.vitality }]} />
                <Text style={styles.meta}>HealthyFood</Text>
              </View>
              <View style={styles.inlineRow}>
                <View style={[styles.swatch, { backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border }]} />
                <Text style={styles.meta}>Other</Text>
              </View>
            </View>
            <Text style={styles.body}>
              Share of your till-slip spend classified as HealthyFood, month by month.
            </Text>
          </Card>
        </>
      ) : null}

      <SectionLabel>Achievement badges</SectionLabel>
      <View style={styles.badgeGrid}>
        {badges.map((b) => (
          <View
            key={b.id}
            style={[
              styles.badge,
              b.earned
                ? { borderColor: alpha(Colors.vitality, 0.45), backgroundColor: alpha(Colors.vitality, 0.1) }
                : styles.badgeLocked,
            ]}
          >
            <Text style={styles.badgeName}>{b.name}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.lg },
  rowHead: { flexDirection: "row", justifyContent: "space-between", gap: Spacing.md },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  kicker: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, color: Colors.muted },
  body: { fontSize: 12, color: Colors.muted, marginTop: 4, lineHeight: 17 },
  meta: { fontSize: 11, color: Colors.muted, marginTop: 4 },
  itemName: { fontSize: 14, fontWeight: "700", color: Colors.foreground, flexShrink: 1 },
  vitalityText: { fontSize: 13, fontWeight: "700", color: Colors.vitality },
  reward: { fontSize: 12, fontWeight: "800", color: Colors.muted },
  rewardUnlocked: { color: Colors.vitality },

  cashback: {
    backgroundColor: Colors.gold, borderRadius: Radius.xl, padding: Spacing.xl,
    overflow: "hidden",
  },
  cashbackHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cashbackKicker: { fontSize: 11, fontWeight: "800", letterSpacing: 1.4, color: Colors.goldFg, opacity: 0.8 },
  cashbackValueRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: Spacing.lg },
  cashbackValue: { fontSize: 44, fontWeight: "800", color: Colors.goldFg, lineHeight: 46 },
  cashbackTier: { fontSize: 13, fontWeight: "700", color: Colors.goldFg, opacity: 0.9, paddingBottom: 4 },
  cashbackFoot: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginTop: Spacing.lg,
  },
  cashbackFootLabel: { fontSize: 13, color: Colors.goldFg, opacity: 0.9 },
  cashbackFootValue: { fontSize: 13, fontWeight: "700", color: Colors.goldFg },

  voucher: {
    borderColor: alpha(Colors.border, 0.45),
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  voucherUnlocked: {
    borderColor: alpha(Colors.vitality, 0.45),
    backgroundColor: alpha(Colors.vitality, 0.07),
  },
  voucherCode: { fontSize: 12, fontWeight: "700", color: Colors.vitality, marginTop: 2 },

  pointsCol: { alignItems: "flex-end" },
  pointsValue: { fontSize: 14, fontWeight: "800", color: Colors.foreground },

  challengeStatusWrap: { marginTop: Spacing.md, alignSelf: "flex-start" },
  challengeStatus: { fontSize: 12, fontWeight: "700", color: Colors.muted },
  challengeStatusDone: { color: Colors.vitality },

  chart: { flexDirection: "row", gap: Spacing.lg, height: 168 },
  chartCol: { flex: 1, alignItems: "center" },
  chartValue: { fontSize: 11, fontWeight: "700", color: Colors.vitality },
  chartBars: { flex: 1, alignSelf: "stretch", justifyContent: "flex-end", gap: 3, marginVertical: 4 },
  barHealthy: { backgroundColor: Colors.vitality, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  barOther: { backgroundColor: Colors.surface2, borderBottomLeftRadius: 6, borderBottomRightRadius: 6 },
  legend: { flexDirection: "row", gap: Spacing.lg, marginTop: Spacing.md },
  swatch: { height: 8, width: 8, borderRadius: 2 },

  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  badge: {
    width: "31%", flexGrow: 1, borderRadius: Radius.lg, borderWidth: 1,
    padding: Spacing.md, alignItems: "center",
  },
  badgeLocked: { borderColor: Colors.border, backgroundColor: Colors.surface, opacity: 0.6 },
  badgeIcon: { fontSize: 22 },
  badgeName: { fontSize: 11, fontWeight: "700", color: Colors.foreground, textAlign: "center", marginTop: 2 },
  badgeDesc: { fontSize: 9, color: Colors.muted, textAlign: "center", marginTop: 1 },
  badgeProgress: { alignSelf: "stretch", marginTop: -4 },
});
