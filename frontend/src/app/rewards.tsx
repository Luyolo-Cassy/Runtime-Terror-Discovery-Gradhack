import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { listRewards, claimReward } from '../services/api';

type Reward = {
  reward_id: string;
  reward_name: string;
  partner_name?: string;
  points_required?: number;
  vouchers_required?: number;
  reward_type?: string;
};

export default function RewardsScreen() {
  const router = useRouter();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setIsLoading(true);
    try {
      setRewards(await listRewards());
    } catch {
      Alert.alert('Error', 'Could not load rewards.');
    } finally {
      setIsLoading(false);
    }
  };

  const onClaim = async (reward: Reward) => {
    setClaimingId(reward.reward_id);
    try {
      const res = await claimReward(reward.reward_id);
      Alert.alert('Reward claimed! 🎉', `Your code: ${res.voucher_code}`);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Could not claim this reward.';
      Alert.alert('Not yet', msg);
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Rewards</Text>
        <Text style={styles.subtitle}>Turn healthy habits into vouchers</Text>
      </View>

      <View style={styles.contentContainer}>
        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color="#4CB963" />
            <Text style={styles.loadingText}>Loading rewards...</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {rewards.length === 0 && <Text style={styles.empty}>No rewards available right now.</Text>}
            {rewards.map((r) => (
              <View key={r.reward_id} style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rewardName}>{r.reward_name}</Text>
                  {!!r.partner_name && <Text style={styles.partner}>{r.partner_name}</Text>}
                  <Text style={styles.cost}>
                    {r.vouchers_required ? `${r.vouchers_required} voucher(s)` : ''}
                    {r.points_required ? ` · ${r.points_required} pts` : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.claimButton}
                  onPress={() => onClaim(r)}
                  disabled={claimingId === r.reward_id}
                >
                  <Text style={styles.claimText}>
                    {claimingId === r.reward_id ? '...' : 'Claim'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/')}>
          <Text style={styles.secondaryButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FFF7', paddingTop: 60 },
  header: { paddingHorizontal: 24, marginBottom: 10 },
  headerTitle: { fontSize: 32, fontWeight: 'bold', color: '#2F4858' },
  subtitle: { fontSize: 16, color: '#666' },
  contentContainer: {
    flex: 1, backgroundColor: '#FFFFFF', borderTopLeftRadius: 30, borderTopRightRadius: 30,
    padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05, shadowRadius: 10, elevation: 5,
  },
  loadingState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 16, fontSize: 16, color: '#4CB963', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E6EFE8', borderRadius: 14, padding: 16, marginBottom: 12,
  },
  rewardName: { fontSize: 17, fontWeight: 'bold', color: '#2F4858' },
  partner: { fontSize: 13, color: '#4CB963', marginTop: 2 },
  cost: { fontSize: 13, color: '#888', marginTop: 4 },
  claimButton: { backgroundColor: '#4CB963', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10 },
  claimText: { color: '#FFFFFF', fontWeight: 'bold' },
  footer: { padding: 24, backgroundColor: '#FFFFFF' },
  secondaryButton: { paddingVertical: 16, alignItems: 'center' },
  secondaryButtonText: { color: '#4CB963', fontSize: 16, fontWeight: 'bold' },
});