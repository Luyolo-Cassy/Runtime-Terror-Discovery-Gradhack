import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

// Define the shape of our ingredient objects
type Ingredient = {
  item_name: string;
  category: string;
};

export default function PantryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Parse the data we passed from the camera screen
  // If no data is passed (e.g., navigating from Home), default to an empty array
  const rawItems = params.items ? (params.items as string) : '[]';
  const ingredients: Ingredient[] = JSON.parse(rawItems);

  // How each individual list item should look
  const renderItem = ({ item }: { item: Ingredient }) => (
    <View style={styles.itemCard}>
      <Text style={styles.itemName}>{item.item_name}</Text>
      <View style={styles.categoryBadge}>
        <Text style={styles.categoryText}>{item.category}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Your Pantry</Text>
      <Text style={styles.subtitle}>Here is what we found:</Text>

      {ingredients.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No ingredients found yet!</Text>
        </View>
      ) : (
        <FlatList
          data={ingredients}
          keyExtractor={(item, index) => index.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
        />
      )}

      {/* Action Buttons */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={() => router.push('/recipes')}
        >
          <Text style={styles.primaryButtonText}>👨‍🍳 Generate Recipe</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.secondaryButton}
          onPress={() => router.push('/')}
        >
          <Text style={styles.secondaryButtonText}>Back to Home</Text>
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
    backgroundColor: '#F7FFF7',
    padding: 24,
    paddingTop: 60, // Extra padding for the top notch
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2F4858',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  listContainer: {
    paddingBottom: 20,
  },
  itemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  itemName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  categoryBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  categoryText: {
    color: '#4CB963',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 18,
    color: '#999',
  },
  footer: {
    marginTop: 20,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#4CB963',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  secondaryButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#4CB963',
    fontSize: 16,
    fontWeight: 'bold',
  },
});