import { Tabs } from "expo-router";
import { Boxes, ChefHat, Gift, House, ScanLine, ShoppingCart } from "lucide-react-native";

import { Colors } from "@/constants/theme";

/**
 * Six tabs, matching the web prototype's bottom nav.
 *
 * Using expo-router's JS `Tabs` rather than NativeTabs: NativeTabs is still
 * unstable and wants a PNG asset per tab, whereas lucide gives us the same icon
 * set the web app used and scales to six entries without new assets.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.muted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Home", tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="pantry"
        options={{ title: "Pantry", tabBarIcon: ({ color, size }) => <Boxes color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="recipes"
        options={{ title: "Recipes", tabBarIcon: ({ color, size }) => <ChefHat color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="receipts"
        options={{ title: "Slips", tabBarIcon: ({ color, size }) => <ScanLine color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="shopping"
        options={{ title: "Shop", tabBarIcon: ({ color, size }) => <ShoppingCart color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="rewards"
        options={{ title: "Rewards", tabBarIcon: ({ color, size }) => <Gift color={color} size={size} /> }}
      />
    </Tabs>
  );
}
