import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { generateRecipe } from '../services/api';

type MissingItem = { item_name: string; retailer?: string | null; category?: string | null };
type Personalized = { budget_tier?: string; preferred_category?: string; healthy_spend_pct?: number; vitality_tier?: string } | null;

export default function RecipesScreen() {
  const router = useRouter();
  const [recipeText, setRecipeText] = useState<string | null>(null);
  const [recipeName, setRecipeName] = useState<string | null>(null);
  const [missing, setMissing] = useState<MissingItem[]>([]);
  const [personalized, setPersonalized] = useState<Personalized>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchNewRecipe();
  }, []);

  const fetchNewRecipe = async () => {
    setIsLoading(true);
    setRecipeText(null);
    setMissing([]);
    try {
      const result = await generateRecipe();
      if (!result.recipe) {
        Alert.alert('Pantry empty', result.message || 'Scan a receipt first!');
        return;
      }
      setRecipeText(result.recipe);
      setRecipeName(result.recipe_name || 'Your Recipe');
      setMissing(result.missing_ingredients || []);
      setPersonalized(result.personalized_for || null);
    } catch (error) {
      Alert.alert('Error', 'Could not generate a recipe. Do you have ingredients in your pantry?');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chef Gemini</Text>
        <Text style={styles.subtitle}>Cooking up something healthy...</Text>
      </View>

      <View style={styles.contentContainer}>
        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color="#4CB963" />
            <Text style={styles.loadingText}>Writing your custom recipe...</Text>
          </View>
        ) : (
          <ScrollView style={styles.recipeScroll} showsVerticalScrollIndicator={false}>
            {personalized && (
              <View style={styles.personalBanner}>
                <Text style={styles.personalText}>
                  ✨ Tailored to your {personalized.budget_tier || ''} budget
                  {personalized.preferred_category ? ` · loves ${personalized.preferred_category}` : ''}
                </Text>
              </View>
            )}

            {recipeName && <Text style={styles.recipeName}>{recipeName}</Text>}
            <Text style={styles.recipeText}>{recipeText}</Text>

            {missing.length > 0 && (
              <View style={styles.missingBox}>
                <Text style={styles.missingTitle}>🛒 HealthyFood items you still need</Text>
                {missing.map((m, i) => (
                  <View key={i} style={styles.missingRow}>
                    <Text style={styles.missingItem}>{m.item_name}</Text>
                    {!!m.retailer && <Text style={styles.missingRetailer}>{m.retailer}</Text>}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryButton} onPress={fetchNewRecipe} disabled={isLoading}>
          <Text style={styles.primaryButtonText}>🎲 Generate Another</Text>
        </TouchableOpacity>
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
  recipeScroll: { flex: 1 },
  personalBanner: { backgroundColor: '#E9F8EE', borderRadius: 10, padding: 12, marginBottom: 16 },
  personalText: { color: '#2F6B43', fontWeight: '600', fontSize: 14 },
  recipeName: { fontSize: 22, fontWeight: 'bold', color: '#2F4858', marginBottom: 8 },
  recipeText: { fontSize: 16, lineHeight: 24, color: '#333' },
  missingBox: { marginTop: 24, backgroundColor: '#FFF8E6', borderRadius: 12, padding: 16 },
  missingTitle: { fontSize: 16, fontWeight: 'bold', color: '#8A6D00', marginBottom: 10 },
  missingRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  missingItem: { fontSize: 15, color: '#333', fontWeight: '600' },
  missingRetailer: { fontSize: 13, color: '#999' },
  footer: { padding: 24, backgroundColor: '#FFFFFF', gap: 12 },
  primaryButton: { backgroundColor: '#4CB963', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  secondaryButton: { paddingVertical: 16, alignItems: 'center' },
  secondaryButtonText: { color: '#4CB963', fontSize: 16, fontWeight: 'bold' },
});