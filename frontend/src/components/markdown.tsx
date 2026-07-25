import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Colors, Spacing } from "@/constants/theme";

/**
 * Tiny markdown renderer for the recipe body.
 *
 * The model is prompted to return a fixed subset (h1/h2, bold, bullets,
 * numbered steps), so pulling in a full markdown package would ship a lot of
 * parser for syntax we never generate. This walks the lines instead.
 */
export function Markdown({ text }: { text?: string }) {
  if (!text) return null;

  const blocks: React.ReactNode[] = [];
  let listItems: { key: string; marker: string; content: string }[] = [];
  let ordered = false;

  const flush = () => {
    if (!listItems.length) return;
    blocks.push(
      <View key={`list-${blocks.length}`} style={styles.list}>
        {listItems.map((item) => (
          <View key={item.key} style={styles.listRow}>
            <Text style={[styles.marker, ordered && styles.markerOrdered]}>{item.marker}</Text>
            <Text style={styles.listText}>{inline(item.content)}</Text>
          </View>
        ))}
      </View>,
    );
    listItems = [];
  };

  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) { flush(); return; }

    if (line.startsWith("## ")) {
      flush();
      blocks.push(<Text key={i} style={styles.h3}>{line.slice(3).toUpperCase()}</Text>);
      return;
    }
    if (line.startsWith("# ")) {
      flush();
      blocks.push(<Text key={i} style={styles.h2}>{line.slice(2)}</Text>);
      return;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (ordered) flush();
      ordered = false;
      listItems.push({ key: `i${i}`, marker: "•", content: line.slice(2) });
      return;
    }

    const numbered = /^(\d+)\.\s+(.*)$/.exec(line);
    if (numbered) {
      if (!ordered && listItems.length) flush();
      ordered = true;
      listItems.push({ key: `i${i}`, marker: `${numbered[1]}.`, content: numbered[2] });
      return;
    }

    flush();
    blocks.push(<Text key={i} style={styles.p}>{inline(line)}</Text>);
  });

  flush();
  return <View style={styles.root}>{blocks}</View>;
}

/** Resolve **bold** runs inside a line. */
function inline(text: string): React.ReactNode {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**")
        ? <Text key={i} style={styles.bold}>{part.slice(2, -2)}</Text>
        : <Text key={i}>{part}</Text>,
    );
}

const styles = StyleSheet.create({
  root: { marginTop: Spacing.md, gap: 6 },
  h2: { fontSize: 16, fontWeight: "800", color: Colors.foreground, marginTop: Spacing.sm },
  h3: {
    fontSize: 11, fontWeight: "800", letterSpacing: 1,
    color: Colors.muted, marginTop: Spacing.md,
  },
  p: { fontSize: 13, color: Colors.muted, lineHeight: 20 },
  bold: { fontWeight: "700", color: Colors.foreground },
  list: { gap: 5, marginTop: 2 },
  listRow: { flexDirection: "row", gap: Spacing.sm, paddingRight: Spacing.sm },
  marker: { fontSize: 13, color: Colors.primary, fontWeight: "700", width: 18 },
  markerOrdered: { width: 20 },
  listText: { flex: 1, fontSize: 13, color: Colors.foreground, lineHeight: 20 },
});
