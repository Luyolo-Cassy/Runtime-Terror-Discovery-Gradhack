import React, { useRef, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Camera, RefreshCw, X } from "lucide-react-native";

import { ActionButton } from "@/components/ui";
import { Colors, Radius, Spacing } from "@/constants/theme";
import type { ImageAsset } from "@/data/api";

/**
 * Full-screen camera with a live preview and a shutter button.
 *
 * Why this exists rather than just calling ImagePicker.launchCameraAsync:
 * on desktop web that call has no native camera to hand off to, so it silently
 * degrades to a file picker. expo-camera's CameraView renders through
 * getUserMedia on web, which means the same component gives a real webcam
 * preview on a laptop and the normal camera on a phone.
 *
 * Web caveat: getUserMedia only works on https:// or localhost. Over http on a
 * LAN IP the browser blocks it outright — that's a browser rule, not a bug here.
 */
export function SlipCamera({
  visible,
  onClose,
  onCapture,
}: {
  visible: boolean;
  onClose: () => void;
  onCapture: (asset: ImageAsset) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  async function capture() {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,          // Vertex AI rejects very large payloads
        skipProcessing: true,  // faster shutter; we don't need EXIF rotation
      });
      if (!photo?.uri) {
        setError("The camera returned an empty frame. Try again.");
        return;
      }
      onCapture({
        uri: photo.uri,
        fileName: `slip-${Date.now()}.jpg`,
        mimeType: "image/jpeg",
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // `permission` is null only while the hook is still resolving.
  const checking = !permission;
  const denied = permission && !permission.granted;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={styles.root}>
        {checking ? (
          <Centered text="Checking camera permission…" onClose={onClose} />
        ) : denied ? (
          <Centered
            text={
              permission.canAskAgain
                ? "HealthyFood needs the camera to read your till slip."
                : "Camera access is blocked. Enable it in your browser or system settings, then reopen this screen."
            }
            onClose={onClose}
            action={
              permission.canAskAgain
                ? { label: "Allow camera", onPress: requestPermission }
                : undefined
            }
          />
        ) : (
          <>
            <CameraView ref={cameraRef} style={styles.preview} facing={facing} />

            {/* Framing guide — a slip photographed edge-to-edge OCRs far better
                than one taken at arm's length. */}
            <View style={styles.guide} pointerEvents="none">
              <View style={styles.guideBox} />
              <Text style={styles.guideText}>Fill the frame with your till slip</Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close camera"
              onPress={onClose}
              style={styles.close}
              hitSlop={10}
            >
              <X size={22} color="#FFFFFF" />
            </Pressable>

            {Platform.OS !== "web" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Switch camera"
                onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
                style={styles.flip}
                hitSlop={10}
              >
                <RefreshCw size={20} color="#FFFFFF" />
              </Pressable>
            ) : null}

            <View style={styles.controls}>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Take photo"
                accessibilityState={{ busy }}
                onPress={capture}
                disabled={busy}
                style={({ pressed }) => [
                  styles.shutter,
                  { opacity: busy ? 0.5 : pressed ? 0.8 : 1 },
                ]}
              >
                <View style={styles.shutterInner}>
                  <Camera size={26} color={Colors.foreground} />
                </View>
              </Pressable>
              <Text style={styles.hint}>
                {busy ? "Capturing…" : "Tap to capture and classify"}
              </Text>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

function Centered({
  text, onClose, action,
}: {
  text: string;
  onClose: () => void;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.centered}>
      <Camera size={32} color={Colors.muted} />
      <Text style={styles.centeredText}>{text}</Text>
      {action ? <ActionButton label={action.label} onPress={action.onPress} /> : null}
      <ActionButton label="Close" variant="outline" onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  preview: { flex: 1 },

  guide: {
    position: "absolute", top: 0, right: 0, bottom: 0, left: 0,
    alignItems: "center", justifyContent: "center",
  },
  guideBox: {
    width: "78%", height: "52%", borderRadius: Radius.lg,
    borderWidth: 2, borderColor: "rgba(255,255,255,0.65)", borderStyle: "dashed",
  },
  guideText: {
    color: "rgba(255,255,255,0.85)", fontSize: 12,
    fontWeight: "600", marginTop: Spacing.md,
  },

  close: {
    position: "absolute", top: 48, left: Spacing.xl,
    height: 40, width: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center",
  },
  flip: {
    position: "absolute", top: 48, right: Spacing.xl,
    height: 40, width: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center",
  },

  controls: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingBottom: 48, alignItems: "center", gap: Spacing.md,
  },
  shutter: {
    height: 76, width: 76, borderRadius: 38,
    borderWidth: 4, borderColor: "rgba(255,255,255,0.9)",
    alignItems: "center", justifyContent: "center",
  },
  shutterInner: {
    height: 60, width: 60, borderRadius: 30,
    backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center",
  },
  hint: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "600" },
  error: {
    color: "#FFFFFF", fontSize: 12, textAlign: "center",
    backgroundColor: Colors.destructive, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 6, marginHorizontal: Spacing.xl,
  },

  centered: {
    flex: 1, alignItems: "center", justifyContent: "center",
    gap: Spacing.lg, padding: Spacing.xxl, backgroundColor: Colors.background,
  },
  centeredText: {
    fontSize: 14, color: Colors.foreground,
    textAlign: "center", lineHeight: 20, maxWidth: 300,
  },
});