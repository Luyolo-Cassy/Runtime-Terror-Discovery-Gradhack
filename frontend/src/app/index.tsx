import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  // The router allows us to navigate to other screens
  const router = useRouter();

  return (
    <View style={styles.container}>
      {/* Header Section */}
      <View style={styles.header}>
        <Text style={styles.title}>HealthyFood</Text>
        <Text style={styles.subtitle}>Your AI Kitchen Assistant</Text>
      </View>

      {/* Main Action Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={styles.primaryButton} 
          onPress={() => router.push('/camera')}
        >
          <Text style={styles.primaryButtonText}>📷 Scan Pantry or Receipt</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.secondaryButton} 
          onPress={() => router.push('/recipes')}
        >
          <Text style={styles.secondaryButtonText}>🥗 Generate Recipes</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.secondaryButton} 
          onPress={() => router.push('/rewards')}
        >
          <Text style={styles.secondaryButtonText}>🎁 Claim Rewards</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ==========================================
// STYLES
// ==========================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FFF7', // A light, healthy green tint
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 50,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#2F4858',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#4CB963',
    fontWeight: '600',
  },
  buttonContainer: {
    gap: 16, // Adds space between buttons
  },
  primaryButton: {
    backgroundColor: '#4CB963',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#4CB963',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#4CB963',
    fontSize: 18,
    fontWeight: 'bold',
  },
});