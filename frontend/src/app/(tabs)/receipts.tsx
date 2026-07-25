import React, { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";

import { SlipCamera } from "@/components/slip-camera";
import {
  Camera, Check, CheckCircle2, HelpCircle, Link2, ScanLine, Sparkles, Store,
  Upload, X, XCircle,
} from "lucide-react-native";

import { ActionButton, Card, EmptyState, Screen, SectionLabel } from "@/components/ui";
import { Colors, Radius, Spacing, alpha } from "@/constants/theme";
import { useApp } from "@/data/store";
import type { Receipt } from "@/data/mockData";

export default function ReceiptsScreen() {
  const { state, actions } = useApp();
  const [preview, setPreview] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const partner = state.receipts.filter((r) => r.partner);
  const scanned = state.receipts.filter((r) => !r.partner);
  const scanning = Boolean(state.busy.scan);

  /** Shared tail for both capture routes: preview it, then send it to be read. */
  async function submit(asset: { uri: string; fileName?: string | null; mimeType?: string | null }) {
    setPreview(asset.uri);
    await actions.scanSlip({
      uri: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
    });
  }

  /**
   * Upload route — the photo library / file picker.
   *
   * The camera route deliberately does NOT go through ImagePicker: on desktop
   * web `launchCameraAsync` has no native camera to hand off to and silently
   * degrades to this same file picker. SlipCamera uses getUserMedia instead, so
   * the shutter works on a laptop too.
   */
  async function pickFromLibrary() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,          // Vertex AI rejects very large payloads
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.length) return;
      await submit(result.assets[0]);
    } catch (err) {
      Alert.alert("Could not open your photos", (err as Error).message);
    }
  }

  return (
    <Screen title="Receipts" subtitle="Partner baskets fill your pantry automatically">
      <SlipCamera
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={submit}
      />

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
            onPress={() => setCameraOpen(true)}
            busy={scanning}
            style={styles.flex}
          />
          <ActionButton
            label="Upload"
            variant="outline"
            icon={<Upload size={16} color={Colors.foreground} />}
            onPress={pickFromLibrary}
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

      <ScanResults />

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

/**
 * What the engine actually read off the photo.
 *
 * Worth showing rather than hiding behind a toast: it makes the split of
 * responsibility visible. Gemini supplies `input_name` (what it saw), and the
 * HealthyFood catalogue supplies `matched_item`, `category` and the healthy
 * verdict. When a line has no catalogue match we say so instead of guessing —
 * an unmatched item is not counted as healthy and does not enter the pantry.
 */
function ScanResults() {
  const { state, actions } = useApp();
  const scan = state.lastScan;
  if (!scan || !scan.classified.length) return null;

  const exempt = scan.exempt_count ?? scan.classified.filter((c) => c.status === "exempt").length;
  const unhealthy = scan.unhealthy_count ?? scan.classified.filter((c) => c.status === "unhealthy").length;
  const offline = scan.catalogue_available === false;

  return (
    <Card style={{ borderColor: alpha(Colors.primary, 0.4) }}>
      <View style={styles.receiptHead}>
        <View style={styles.flex}>
          <View style={styles.inlineRow}>
            <Sparkles size={15} color={Colors.primary} />
            <Text style={styles.storeName}>What we read off your slip</Text>
          </View>
          <Text style={styles.scanSummary}>
            {scan.total_count} item{scan.total_count === 1 ? "" : "s"} detected ·{" "}
            {scan.healthy_count} healthy · {unhealthy} unhealthy · {exempt} exempt
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss scan results"
          onPress={actions.clearScan}
          hitSlop={8}
          style={styles.dismiss}
        >
          <X size={15} color={Colors.muted} />
        </Pressable>
      </View>

      {/* When the catalogue is unreachable we say so loudly rather than
          letting a screen full of "exempt" look like a classification result. */}
      {offline ? (
        <View style={styles.offlineBanner}>
          <HelpCircle size={14} color={Colors.warning} />
          <Text style={styles.offlineText}>
            The HealthyFood catalogue couldn't be reached, so nothing was verified.
            Items are listed as read, not judged.
          </Text>
        </View>
      ) : null}

      <View style={styles.lines}>
        {scan.classified.map((c, idx) => {
          const tint = c.status === "healthy"
            ? Colors.vitality
            : c.status === "unhealthy" ? Colors.destructive : Colors.muted;

          // Exempt items show what Gemini read; verified ones show the
          // catalogue product they matched, which is the more useful name.
          const primary = c.matched_item ?? c.input_name;
          const detail = c.status === "exempt"
            ? (c.reason === "catalogue_offline"
                ? `read as "${c.input_name}" · not verified`
                : `read as "${c.input_name}" · not in the catalogue`)
            : [c.input_name !== c.matched_item ? `read as "${c.input_name}"` : null,
               c.category, c.retailer].filter(Boolean).join(" · ");

          return (
            <View key={`${c.input_name}-${idx}`} style={styles.scanLine}>
              {c.status === "healthy"
                ? <CheckCircle2 size={15} color={Colors.vitality} />
                : c.status === "unhealthy"
                  ? <XCircle size={15} color={Colors.destructive} />
                  : <HelpCircle size={15} color={Colors.muted} />}

              <View style={styles.flex}>
                <Text style={styles.lineName} numberOfLines={1}>{primary}</Text>
                <Text style={styles.scanMeta} numberOfLines={1}>{detail}</Text>
              </View>

              <View style={[styles.verdict, { backgroundColor: alpha(tint, 0.15) }]}>
                <Text style={[styles.verdictText, { color: tint }]}>{c.status}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <Text style={styles.scanFootnote}>
        {scan.saved_to_pantry
          ? `${scan.saved_to_pantry} healthy item(s) added to your pantry. `
          : ""}
        Only items the catalogue verifies as HealthyFood are stored — anything we
        can't confirm is marked exempt rather than guessed at.
      </Text>
    </Card>
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

  scanSummary: { fontSize: 12, color: Colors.muted, marginTop: 3, lineHeight: 17 },
  offlineBanner: {
    flexDirection: "row", gap: 6, alignItems: "flex-start", marginTop: Spacing.md,
    backgroundColor: alpha(Colors.warning, 0.12), borderRadius: Radius.sm,
    padding: Spacing.md,
  },
  offlineText: { flex: 1, fontSize: 11, color: Colors.muted, lineHeight: 16 },
  dismiss: { height: 28, width: 28, alignItems: "center", justifyContent: "center" },
  scanLine: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border,
  },
  scanMeta: { fontSize: 10, color: Colors.muted, marginTop: 2 },
  verdict: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  verdictText: { fontSize: 10, fontWeight: "700" },
  scanFootnote: { fontSize: 11, color: Colors.muted, marginTop: Spacing.md, lineHeight: 16 },

  tag: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: Colors.surface2, borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  tagText: { fontSize: 9, fontWeight: "700", color: Colors.muted },
});