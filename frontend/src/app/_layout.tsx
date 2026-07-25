import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import { AppProvider } from "@/data/store";

/**
 * Root layout.
 *
 * AppProvider sits above the navigator so state survives tab switches and the
 * push to /profile — hydration happens once on mount, not on every screen.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="profile"
            options={{
              headerShown: true,
              title: "Profile",
              headerTintColor: Colors.foreground,
              headerStyle: { backgroundColor: Colors.background },
              presentation: "card",
            }}
          />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}
