# HealthyFood — Expo app

React Native via Expo SDK 57, `expo-router` file-based routing, TypeScript.
See the root `README.md` for backend architecture and the API contract.

## Run

```bash
npm install
cp .env.example .env     # set EXPO_PUBLIC_API_BASE
npx expo start
```

Then press `i` (iOS simulator), `a` (Android emulator), `w` (web), or scan the
QR code with Expo Go on a physical device.

Run the API and the app together:

```bash
npm run dev:all
```

### Pointing the app at the backend

`EXPO_PUBLIC_*` vars are **inlined at bundle time**, so changing `.env` needs a
full Expo restart, not just a reload.

| Where the app runs | What to set |
|---|---|
| iOS simulator | `http://localhost:8000` |
| Android emulator | `http://localhost:8000` — rewritten to `10.0.2.2` automatically in `src/data/api.ts` |
| Physical device (Expo Go) | your laptop's LAN IP, e.g. `http://192.168.1.42:8000` |
| Cloud Run | the deployed https URL |

A physical device cannot reach `localhost` — that's the phone itself. If the app
shows the **Demo** badge when you expected **Live**, that's almost always this.

## Live vs demo mode

- **`EXPO_PUBLIC_API_BASE` set** → every screen reads from the FastAPI backend
  (BigQuery + Gemini on Vertex AI). Header badge reads **Live**.
- **Empty** → the app falls back to the sample data in `src/data/mockData.ts` and
  stays fully usable. Badge reads **Demo**.

The fallback also catches a *failed* live call: instead of a blank screen you get
sample data plus a warning strip explaining what went wrong. That's for hackathon
weekend, when the backend gets redeployed mid-demo.

Pull down on any screen to re-hydrate from the API.

## Structure

```
src/
  app/                      # expo-router: file path = route
    _layout.tsx             # root stack; AppProvider lives here
    profile.tsx             # pushed screen (not a tab)
    (tabs)/
      _layout.tsx           # the six-tab bar
      index.tsx             # Home
      pantry.tsx  recipes.tsx  receipts.tsx  shopping.tsx  rewards.tsx
  components/
    ui.tsx                  # Screen shell, Card, SectionLabel, Chip, buttons
    vitality-ring.tsx       # the multi-colour ring (react-native-svg)
    markdown.tsx            # renders the recipe body
  constants/theme.ts        # colours, spacing, radii, shadows
  data/
    api.ts                  # the only file that knows a URL
    store.tsx               # reducer + async actions
    mockData.ts             # TS interfaces = the API contract, + demo values
```

Screens call `actions.x()` from `useApp()`. Nothing outside `data/api.ts` makes
a network call.

## Native modules

`expo-image-picker` (camera + library), `react-native-svg` (the ring) and
`lucide-react-native` (icons) are native dependencies. They work in Expo Go, but
after changing `app.json` plugins or adding another native module, run:

```bash
npx expo install --fix     # aligns versions to the SDK
npx expo prebuild --clean  # only if you've moved to a dev build
```

Camera and photo-library permission strings are declared in `app.json` for both
platforms — iOS will reject the build without them.

## Adding a screen

1. Create `src/app/(tabs)/thing.tsx` with a default-exported component.
2. Add a matching `<Tabs.Screen name="thing" …>` in `(tabs)/_layout.tsx`.
   Without it the route still works but gets a default tab entry.
3. For a non-tab screen, put it directly in `src/app/` and add a `Stack.Screen`
   to the root `_layout.tsx`.

## Verified

`npx tsc --noEmit` passes clean, and `npx expo export --platform web` bundles
2512 modules with all 15 routes rendering.
