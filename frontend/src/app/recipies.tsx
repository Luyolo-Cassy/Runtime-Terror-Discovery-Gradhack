import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { generateRecipe } from '../services/api'; 

export default function RecipesScreen() {
  const router = useRouter();
  const [recipeText, setRecipeText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // This runs automatically exactly once when the screen opens
  useEffect(() => {
    fetchNewRecipe();
  }, []);

  const fetchNewRecipe = async () => {
    setIsLoading(true);
    setRecipeText(null);
    try {
      const result = await generateRecipe();
      // Assuming your backend returns { "recipe": "Markdown text here..." }
      setRecipeText(result.recipe);
    } catch (error) {
      Alert.alert("Error", "Could not generate a recipe. Do you have ingredients in your pantry?");
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

      {/* The main content area */}
      <View style={styles.contentContainer}>
        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color="#4CB963" />
            <Text style={styles.loadingText}>Writing your custom recipe...</Text>
          </View>
        ) : (
          <ScrollView style={styles.recipeScroll} showsVerticalScrollIndicator={false}>
            {/* For a hackathon, standard Text works. Later you can add a Markdown library! */}
            <Text style={styles.recipeText}>{recipeText}</Text>
          </ScrollView>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={fetchNewRecipe}
          disabled={isLoading}
        >
          <Text style={styles.primaryButtonText}>🎲 Generate Another</Text>
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
    paddingTop: 60,
  },
  header: {
    paddingHorizontal: 24,
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#2F4858',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  contentContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 5,
  },
  loadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#4CB963',
    fontWeight: '600',
  },
  recipeScroll: {
    flex: 1,
  },
  recipeText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  footer: {
    padding: 24,
    backgroundColor: '#FFFFFF',
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