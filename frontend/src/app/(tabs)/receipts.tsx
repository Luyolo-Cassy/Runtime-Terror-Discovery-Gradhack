import React, { useState } from "react";
import { Alert, Image, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Camera, Check, CheckCircle2, Link2, ScanLine, Store, Upload, XCircle } from "lucide-react-native";

import { ActionButton, Card, EmptyState, Screen, SectionLabel } from "@/components/ui";
import { Colors, Radius, Spacing, alpha } from "@/constants/theme";
import { useApp } from "@/data/store";
import type { Receipt } from "@/data/mockData";

export default function ReceiptsScreen() {
  const { state, actions } = useApp();
  const [preview, setPreview] = useState<string | null>(null);

  const partner = state.receipts.filter((r) => r.partner);
  const scanned = state.receipts.filter((r) => !r.partner);
  const scanning = Boolean(state.busy.scan);

  /**
   * One handler for both routes in. `launchCameraAsync` needs an explicit
   * permission prompt; the library picker on modern iOS/Android does not, but
   * asking anyway keeps the failure mode a clear message rather than a silent
   * no-op.
   */
  async function pick(source: "camera" | "library") {
    try {
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(
            "Camera access needed",
            "HealthyFood needs the camera to read your till slip. You can enable it in Settings.",
          );
          return;
        }
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        quality: 0.7,          // Vertex AI rejects very large payloads
        allowsEditing: false,
      };

      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      setPreview(asset.uri);
      await actions.scanSlip({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
      });
    } catch (err) {
      actions.toast(`Could not open the ${source}: ${(err as Error).message}`);
    }
  }

  return (
    <Screen title="Receipts" subtitle="Partner baskets fill your pantry automatically">
      <View style={styles.scanBox}>
        {preview ? (
          <Image source={{ uri: preview }} style={styles.preview} accessibilityLabel="The slip you just captured" />
        ) : (
          <View style={styles.scanIcon}>
            <Camera size={26} color={Colors.primaryFg} />
          </View>
        )}

        <Text style={styles.scanTitle}>{scanning ? "Reading your slip…" : "Scan an outside slip"}</Text>
        <Text style={styles.scanBody}>
          Shopped somewhere that isn't a partner? Snap the till slip — we read the
          item names off it, check each one against the HealthyFood catalogue, and
          add the healthy ones to your pantry.
        </Text>

        <View style={styles.scanButtons}>
          <ActionButton
            label="Camera"
            icon={<Camera size={16} color={Colors.primaryFg} />}
            onPress={() => pick("camera")}
            busy={scanning}
            style={styles.flex}
          />
          <ActionButton
            label="Upload"
            variant="outline"
            icon={<Upload size={16} color={Colors.foreground} />}
            onPress={() => pick("library")}
            disabled={scanning}
            style={styles.flex}
          />
        </View>

        {state.mode === "demo" ? (
          <Text style={styles.demoNote}>
            Demo mode: set EXPO_PUBLIC_API_BASE to read a real slip with Gemini.
          </Text>
        ) : null}
      </View>

      <SectionLabel>Partner baskets · shared with your consent</SectionLabel>
      <Text style={styles.hint}>
        {state.profile.linkedPartners.join(" & ")} already send us the basket ID from
        your till slip, so these don't need scanning at all.
      </Text>

      {partner.map((r) => (
        <ReceiptCard key={r.id} receipt={r} busy={Boolean(state.busy[`receipt-${r.id}`])} />
      ))}
      {partner.length === 0 && !state.loading ? (
        <EmptyState
          icon={<ScanLine size={24} color={Colors.muted} />}
          title="No partner baskets yet"
          hint="Link Checkers or Woolworths on your profile to pull your slips in automatically."
        />
      ) : null}

      {scanned.length > 0 ? (
        <>
          <SectionLabel>Scanned slips · outside partners</SectionLabel>
          {scanned.map((r) => (
            <ReceiptCard key={r.id} receipt={r} busy={Boolean(state.busy[`receipt-${r.id}`])} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function ReceiptCard({ receipt, busy }: { receipt: Receipt; busy: boolean }) {
  const { actions } = useApp();
  const healthy = receipt.items.filter((i) => i.classification === "healthy").length;
  const ratio = receipt.healthyRatio
    ?? (receipt.items.length ? Math.round((healthy / receipt.items.length) * 100) : 0);

  return (
    <Card>
      <View style={styles.receiptHead}>
        <View style={styles.flex}>
          <View style={styles.inlineRow}>
            <Store size={14} color={Colors.primary} />
            <Text style={styles.storeName} numberOfLines={1}>{receipt.store}</Text>
          </View>
          <View style={[styles.inlineRow, { marginTop: 3, flexWrap: "wrap" }]}>
            <Text style={styles.meta}>{receipt.date}</Text>
            <View
              style={[
                styles.tag,
                receipt.partner ? { backgroundColor: alpha(Colors.primary, 0.15) } : null,
              ]}
            >
              {receipt.partner ? <Link2 size={9} color={Colors.primary} /> : null}
              <Text style={[styles.tagText, receipt.partner ? { color: Colors.primary } : null]}>
                {receipt.partner ? "partner" : "scanned"}
              </Text>
            </View>
            {receipt.total != null ? (
              <Text style={styles.meta}>R{receipt.total.toFixed(2)}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.ratio}>
          <Text style={styles.meta}>Healthy</Text>
          <Text style={styles.ratioValue}>{ratio}%</Text>
        </View>
      </View>

      <View style={styles.lines}>
        {receipt.items.map((it, idx) => {
          const good = it.classification === "healthy";
          return (
            <View key={`${it.name}-${idx}`} style={styles.line}>
              <View style={[styles.inlineRow, styles.flex]}>
                {good
                  ? <CheckCircle2 size={15} color={Colors.vitality} />
                  : <XCircle size={15} color={Colors.destructive} />}
                <Text style={styles.lineName} numberOfLines={1}>{it.name}</Text>
              </View>
              <Text style={styles.meta}>R{it.price.toFixed(2)}</Text>
            </View>
          );
        })}
      </View>

      <ActionButton
        label={receipt.imported
          ? "Added to pantry"
          : `Add ${healthy} HealthyFood item${healthy === 1 ? "" : "s"} to pantry`}
        icon={receipt.imported ? <Check size={15} color={Colors.muted} /> : undefined}
        variant={receipt.imported ? "muted" : "primary"}
        onPress={() => actions.importReceipt(receipt.id)}
        disabled={receipt.imported}
        busy={busy}
        style={{ marginTop: Spacing.md }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  hint: { fontSize: 12, color: Colors.muted, lineHeight: 17 },

  scanBox: {
    borderWidth: 2, borderStyle: "dashed", borderColor: alpha(Colors.primary, 0.4),
    backgroundColor: alpha(Colors.primary, 0.05), borderRadius: Radius.xl,
    padding: Spacing.xxl, alignItems: "center",
  },
  scanIcon: {
    height: 56, width: 56, borderRadius: Radius.lg, backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  preview: { height: 96, width: 96, borderRadius: Radius.lg },
  scanTitle: { fontSize: 15, fontWeight: "700", color: Colors.foreground, marginTop: Spacing.md },
  scanBody: {
    fontSize: 12, color: Colors.muted, textAlign: "center",
    marginTop: 4, lineHeight: 17, maxWidth: 280,
  },
  scanButtons: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.lg, alignSelf: "stretch" },
  demoNote: { fontSize: 11, color: Colors.muted, marginTop: Spacing.md, textAlign: "center" },

  receiptHead: { flexDirection: "row", justifyContent: "space-between", gap: Spacing.sm },
  storeName: { fontSize: 14, fontWeight: "700", color: Colors.foreground, flexShrink: 1 },
  meta: { fontSize: 11, color: Colors.muted },
  ratio: { alignItems: "flex-end" },
  ratioValue: { fontSize: 18, fontWeight: "800", color: Colors.vitality },

  lines: { marginTop: Spacing.md },
  line: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    gap: Spacing.sm, paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border,
  },
  lineName: { fontSize: 13, color: Colors.foreground, flexShrink: 1 },

  tag: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: Colors.surface2, borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  tagText: { fontSize: 9, fontWeight: "700", color: Colors.muted },
});
