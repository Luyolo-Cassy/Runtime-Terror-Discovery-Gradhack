import React, { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Camera, X } from "lucide-react-native";

import { Colors, Radius, Spacing } from "@/constants/theme";

type CapturedAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
};

type SlipCameraProps = {
  visible: boolean;
  onClose: () => void;
  onCapture: (asset: CapturedAsset) => void | Promise<void>;
};

/**
 * Web-only camera capture modal.
 *
 * `expo-image-picker`'s launchCameraAsync has no native camera to hand off
 * to on desktop web and silently degrades to a file picker, so this uses
 * the browser's getUserMedia API directly to give the "Camera" button a
 * real shutter on a laptop too.
 *
 * Renders nothing on native (iOS/Android) — ImagePicker's own camera path
 * already works there.
 */
export function SlipCamera({ visible, onClose, onCapture }: SlipCameraProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web" || !visible) return;

    let cancelled = false;

    async function start() {
      setError(null);
      setReady(false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch (err) {
        setError((err as Error).message || "Could not access the camera.");
      }
    }

    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [visible]);

  if (Platform.OS !== "web") return null;
  if (!visible) return null;

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const uri = URL.createObjectURL(blob);
        onCapture({ uri, fileName: `slip-${Date.now()}.jpg`, mimeType: "image/jpeg" });
        handleClose();
      },
      "image/jpeg",
      0.85,
    );
  }

  function handleClose() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onClose();
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.frame}>
          <Pressable style={styles.closeBtn} onPress={handleClose} accessibilityLabel="Close camera">
            <X size={20} color={Colors.foreground} />
          </Pressable>

          {error ? (
            <View style={styles.center}>
              <Text style={styles.errorText}>{error}</Text>
              <Text style={styles.hint}>
                Check your browser's camera permission, or use "Upload" instead.
              </Text>
            </View>
          ) : (
            // Plain DOM <video>; react-native-web passes unrecognized host
            // elements straight through, which is how we get a live camera
            // feed without a native camera module.
            // @ts-ignore
            <video
              ref={videoRef}
              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: Radius.lg }}
              muted
              playsInline
            />
          )}

          <Pressable
            style={[styles.shutter, !ready && styles.shutterDisabled]}
            onPress={capture}
            disabled={!ready}
            accessibilityLabel="Capture photo"
          >
            <Camera size={22} color={Colors.primaryFg} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  frame: {
    width: "100%",
    maxWidth: 480,
    aspectRatio: 3 / 4,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    overflow: "hidden",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    zIndex: 2,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 999,
    padding: Spacing.xs,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  errorText: {
    color: "#fff",
    fontWeight: "600",
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  hint: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    textAlign: "center",
  },
  shutter: {
    position: "absolute",
    bottom: Spacing.md,
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  shutterDisabled: {
    opacity: 0.5,
  },
});
