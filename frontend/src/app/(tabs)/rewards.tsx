import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Check, Gift, Lock, Sparkles, Ticket, Trophy, Zap } from "lucide-react-native";

import { ActionButton, Card, EmptyState, ProgressBar, Screen, SectionLabel } from "@/components/ui";
import { VitalityRing } from "@/components/vitality-ring";
import { Colors, Radius, Spacing, alpha } from "@/constants/theme";
import { useApp } from "@/data/store";
import type { Reward } from "@/data/mockData";

export default function RewardsScreen() {
  const { state, actions } = useApp();
  const { profile, points, trend, badges, challenges, rewards, vouchers } = state;

  // Progress toward the next reward they can't yet afford — more motivating
  // than an arbitrary "points modulo 2000" ring.
  const nextReward = [...rewards]
    .sort((a, b) => a.points_required - b.points_required)
    .find((r) => r.points_required > points);
  const ringValue = nextReward
    ? Math.min(100, Math.round((points / nextReward.points_required) * 100))
    : 100;

  return (
    <Screen title="Your Rewards" subtitle={`${profile.tier} tier · powered by Vitality`}>
      <View style={styles.cashback}>
        <View style={styles.cashbackHead}>
          <Text style={styles.cashbackKicker}>HEALTHYFOOD CASHBACK</Text>
          <Trophy size={18} color={Colors.goldFg} />
        </View>
        <View style={styles.cashbackValueRow}>
          <Text style={styles.cashbackValue}>{profile.cashbackPercent}%</Text>
          <Text style={styles.cashbackTier}>{profile.tier} tier</Text>
        </View>
        <View style={styles.cashbackFoot}>
          <Text style={styles.cashbackFootLabel}>Est. back on an average basket</Text>
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
                ? `${(nextReward.points_required - points).toLocaleString()} to go`
                : "Everything unlocked"}
            </Text>
          </View>
          <Text style={styles.body}>
            {nextReward ? `Next up: ${nextReward.reward_name}.` : "You can claim any reward in the catalogue."}
          </Text>
        </View>
      </Card>

      {vouchers.length > 0 ? (
        <>
          <SectionLabel>Your vouchers</SectionLabel>
          {vouchers.map((v) => (
            <Card key={v.code} style={styles.voucher}>
              <View style={styles.inlineRow}>
                <Ticket size={18} color={Colors.vitality} />
                <View style={styles.flex}>
                  <Text style={styles.itemName} numberOfLines={1}>{v.rewardName}</Text>
                  <Text style={styles.voucherCode}>{v.code}</Text>
                </View>
              </View>
            </Card>
          ))}
        </>
      ) : null}

      <SectionLabel>Redeem your points</SectionLabel>
      {rewards.map((r) => (
        <RewardCard
          key={r.reward_id}
          reward={r}
          points={points}
          busy={Boolean(state.busy[`reward-${r.reward_id}`])}
        />
      ))}
      {rewards.length === 0 && !state.loading ? (
        <EmptyState
          icon={<Gift size={24} color={Colors.muted} />}
          title="No rewards available"
          hint="The rewards catalogue is empty or unreachable right now."
        />
      ) : null}

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

          <ActionButton
            label={ch.done ? `Claim ${ch.reward} pts` : "In progress"}
            icon={ch.done ? <Check size={13} color={Colors.vitalityFg} /> : undefined}
            variant={ch.done ? "primary" : "muted"}
            onPress={() => actions.completeChallenge(ch)}
            style={styles.challengeButton}
          />
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
            <Text style={styles.badgeIcon}>{b.icon}</Text>
            <Text style={styles.badgeName}>{b.name}</Text>
            <Text style={styles.badgeDesc}>{b.desc}</Text>
            {!b.earned && b.progress != null && b.progress > 0 ? (
              <View style={styles.badgeProgress}>
                <ProgressBar value={b.progress} color={Colors.vitality} />
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </Screen>
  );
}

function RewardCard({ reward, points, busy }: { reward: Reward; points: number; busy: boolean }) {
  const { actions } = useApp();
  const affordable = points >= reward.points_required;
  const shortfall = reward.points_required - points;

  return (
    <Card style={affordable ? { borderColor: alpha(Colors.vitality, 0.45) } : undefined}>
      <View style={styles.rowHead}>
        <View style={styles.flex}>
          <Text style={styles.itemName} numberOfLines={1}>{reward.reward_name}</Text>
          <Text style={styles.body}>
            {reward.partner_name ?? "Discovery"}
            {reward.reward_type ? ` · ${reward.reward_type}` : ""}
          </Text>
        </View>
        <View style={styles.pointsCol}>
          <Text style={styles.pointsValue}>{reward.points_required.toLocaleString()}</Text>
          <Text style={styles.kicker}>POINTS</Text>
        </View>
      </View>

      {!affordable ? (
        <ProgressBar value={(points / reward.points_required) * 100} color={Colors.primary} />
      ) : null}

      <ActionButton
        label={affordable ? "Claim reward" : `${shortfall.toLocaleString()} points to go`}
        icon={affordable
          ? <Gift size={15} color={Colors.goldFg} />
          : <Lock size={14} color={Colors.muted} />}
        variant={affordable ? "gold" : "muted"}
        onPress={() => actions.claimReward(reward)}
        disabled={!affordable}
        busy={busy}
        style={{ marginTop: Spacing.md }}
      />
    </Card>
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
  reward: { fontSize: 12, fontWeight: "800", color: Colors.vitality },

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
    borderColor: alpha(Colors.vitality, 0.45),
    backgroundColor: alpha(Colors.vitality, 0.07),
    padding: Spacing.md,
  },
  voucherCode: { fontSize: 12, fontWeight: "700", color: Colors.vitality, marginTop: 2 },

  pointsCol: { alignItems: "flex-end" },
  pointsValue: { fontSize: 14, fontWeight: "800", color: Colors.foreground },

  challengeButton: { marginTop: Spacing.md, alignSelf: "flex-start", paddingVertical: 10 },

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
