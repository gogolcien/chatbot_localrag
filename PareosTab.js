import { useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, Modal, FlatList, Alert } from "react-native";
import { createRound, setMatchResult, replaceRoundMatches, clearRoundResults } from "../lib/repo";
import { generatePairings, computeStats } from "../lib/swiss";
import { colors, spacing, radius } from "./../lib/theme";
import { Button, Badge } from "./ui";
import ManualPairingEditor from "./ManualPairingEditor";
import { exportPdf, pdfBaseStyles, escapeHtml, formatTimeNow } from "../lib/pdf";

export default function PareosTab({ tournament, reload }) {
  const [activeRoundIdx, setActiveRoundIdx] = useState(tournament.rounds.length - 1);
  const [manualEditing, setManualEditing] = useState(false);
  const rounds = tournament.rounds;
  const round = rounds[activeRoundIdx] ?? rounds[rounds.length - 1];
  const isLastRound = round && rounds.length && round.id === rounds[rounds.length - 1].id;
  const hasResults = round && round.matches.some((m) => m.playerBId != null && m.result);
  const finished = tournament.status === "finished";
  const editable = !finished;

  const stats = useMemo(() => computeStats(tournament), [tournament]);
  const playerById = (id) => tournament.players.find((p) => p.id === id);

  const roundPending = round && round.matches.some((m) => m.playerBId != null && !m.result);

  async function handleGenerateRound() {
    const pairs = generatePairings(tournament);
    await createRound(tournament.id, rounds.length + 1, pairs);
    await reload();
    setActiveRoundIdx(rounds.length); // apunta a la nueva última ronda
  }

  async function handleSetResult(matchId, result) {
    await setMatchResult(matchId, result);
    reload();
  }

  async function handleSaveManual(pairs) {
    await replaceRoundMatches(
      round.id,
      pairs.map((p) => ({ slotIndex: p.slotIndex, playerAId: p.aId, playerBId: p.bId }))
    );
    setManualEditing(false);
    reload();
  }

  async function handleRoundPdf() {
    if (!round) return;
    const activeCount = tournament.players.filter((p) => p.enabled).length;
    const rowsHtml = round.matches
      .map((m) => {
        const a = playerById(m.playerAId);
        const b = m.playerBId ? playerById(m.playerBId) : null;
        const ptsA = stats.points[m.playerAId] ?? 0;
        const ptsB = b ? stats.points[m.playerBId] ?? 0 : "";
        const nameB = b ? escapeHtml(b.name) : "— (bye)";
        return `
          <tr>
            <td style="width:44px;font-weight:700;">${m.tableNum}</td>
            <td style="width:34%;">${escapeHtml(a?.name || "?")}</td>
            <td style="width:40px;text-align:center;font-weight:700;">${ptsA}</td>
            <td style="width:34px;text-align:center;color:#999;font-size:10px;font-weight:700;">VS</td>
            <td style="width:34%;">${nameB}</td>
            <td style="width:40px;text-align:center;font-weight:700;">${ptsB}</td>
          </tr>`;
      })
      .join("");

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          ${pdfBaseStyles()}
        </head>
        <body>
          <h1>${escapeHtml(tournament.name)} — Ronda ${round.roundNumber}</h1>
          <div class="meta">
            <span>Fecha: ${escapeHtml(tournament.date)}</span>
            <span>Hora: ${formatTimeNow()}</span>
            <span>Jugadores inscritos: ${tournament.players.length}</span>
            <span>Jugadores activos: ${activeCount}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Mesa</th>
                <th>Jugador A</th>
                <th style="text-align:center;">Pts</th>
                <th></th>
                <th>Jugador B</th>
                <th style="text-align:center;">Pts</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `;

    try {
      await exportPdf(html, `${tournament.name} - Ronda: ${round.roundNumber}`);
    } catch (e) {
      Alert.alert("No se pudo generar el PDF", "Intenta de nuevo.");
    }
  }

  function handleClearResults() {
    Alert.alert(
      "Limpiar resultados",
      `¿Borrar todos los resultados capturados de la Ronda ${round.roundNumber}? Las mesas se mantienen igual.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Limpiar",
          style: "destructive",
          onPress: async () => {
            await clearRoundResults(round.id);
            reload();
          },
        },
      ]
    );
  }

  if (!rounds.length) {
    return (
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={styles.empty}>Todavía no se ha pareado ninguna ronda.</Text>
        <Button
          title="Generar ronda 1"
          onPress={handleGenerateRound}
          disabled={tournament.players.filter((p) => p.enabled).length < 2}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {finished ? (
        <View style={styles.finishedBanner}>
          <Text style={styles.finishedText}>Torneo finalizado — ya no se pueden capturar resultados.</Text>
        </View>
      ) : null}

      {!manualEditing ? (
        <View style={styles.actionsRow}>
          {isLastRound && !hasResults && !finished ? (
            <Button title="Pareos manuales" variant="ghost" small onPress={() => setManualEditing(true)} />
          ) : null}
          {hasResults && editable ? (
            <Button title="Limpiar resultados" variant="danger" small onPress={handleClearResults} />
          ) : null}
          {isLastRound && !finished ? (
            <Button
              title={roundPending ? "Captura los resultados para continuar" : "Generar siguiente ronda"}
              onPress={handleGenerateRound}
              disabled={roundPending}
              small
            />
          ) : null}
        </View>
      ) : null}

      {!manualEditing ? (
        <View style={styles.roundSelectorRow}>
          <RoundSelector
            rounds={rounds}
            activeRoundIdx={activeRoundIdx}
            onSelect={(idx) => setActiveRoundIdx(idx)}
          />
          <Button title="Ronda PDF" variant="ghost" small onPress={handleRoundPdf} />
        </View>
      ) : null}

      {manualEditing ? (
        <ManualPairingEditor
          round={round}
          playerById={playerById}
          onSave={handleSaveManual}
          onCancel={() => setManualEditing(false)}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm }}>
          {!isLastRound && editable ? (
            <Text style={styles.editHint}>
              Estás viendo una ronda anterior. Puedes corregir resultados aquí, pero los pareos y puntos de rondas
              posteriores no se recalculan solos.
            </Text>
          ) : null}

          {round.matches.some((m) => m.playerBId == null) && editable ? (
            <Text style={styles.hint}>Toca el badge AUTOWIN/AUTOLOSE para alternar entre los dos.</Text>
          ) : null}

          {round.matches.map((m) => {
            const a = playerById(m.playerAId);
            const b = m.playerBId ? playerById(m.playerBId) : null;
            return (
              <View key={m.id} style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={styles.tableBadge}>
                    <Text style={styles.tableBadgeText}>{m.tableNum}</Text>
                  </View>
                  <View style={styles.cardContent}>
                    {!b ? (
                      <View style={[styles.matchRow, { alignItems: "center" }]}>
                        <PlayerBox name={a?.name || "?"} pts={stats.points[m.playerAId]} op={stats.opPercent[m.playerAId]} tone="win" />
                        {editable ? (
                          <Pressable
                            onPress={() => handleSetResult(m.id, m.result === "bye_loss" ? "bye_win" : "bye_loss")}
                            hitSlop={6}
                          >
                            <Badge text={m.result === "bye_loss" ? "AUTOLOSE" : "AUTOWIN"} tone={m.result === "bye_loss" ? "red" : "gold"} />
                          </Pressable>
                        ) : (
                          <Badge text={m.result === "bye_loss" ? "AUTOLOSE" : "AUTOWIN"} tone={m.result === "bye_loss" ? "red" : "gold"} />
                        )}
                      </View>
                    ) : (
                      <View style={styles.matchRow}>
                        <View style={styles.playerColumn}>
                          <PlayerBox
                            name={a?.name || "?"}
                            pts={stats.points[m.playerAId]}
                            op={stats.opPercent[m.playerAId]}
                            tone={m.result === "a_win" ? "win" : m.result === "double_loss" ? "loss" : m.result === "draw" ? "draw" : null}
                            onPress={editable ? () => handleSetResult(m.id, "a_win") : null}
                          />
                          {editable ? (
                            <ResultBtn label="Empate" active={m.result === "draw"} onPress={() => handleSetResult(m.id, "draw")} tone="gold" />
                          ) : null}
                        </View>
                        <Text style={styles.vs}>VS</Text>
                        <View style={styles.playerColumn}>
                          <PlayerBox
                            name={b?.name || "?"}
                            pts={stats.points[m.playerBId]}
                            op={stats.opPercent[m.playerBId]}
                            tone={m.result === "b_win" ? "win" : m.result === "double_loss" ? "loss" : m.result === "draw" ? "draw" : null}
                            onPress={editable ? () => handleSetResult(m.id, "b_win") : null}
                          />
                          {editable ? (
                            <ResultBtn label="Ambos pierden" active={m.result === "double_loss"} onPress={() => handleSetResult(m.id, "double_loss")} tone="danger" />
                          ) : null}
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function RoundSelector({ rounds, activeRoundIdx, onSelect }) {
  const [open, setOpen] = useState(false);
  const round = rounds[activeRoundIdx];

  return (
    <>
      <Pressable style={styles.roundSelector} onPress={() => setOpen(true)} hitSlop={4}>
        <Text style={styles.roundSelectorText}>Ronda {round.roundNumber}</Text>
        <Text style={styles.roundSelectorCaret}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.modalBox}>
            <Text style={styles.addLabel}>Elegir ronda</Text>
            <FlatList
              data={rounds}
              keyExtractor={(r) => r.id}
              renderItem={({ item, index }) => (
                <Pressable
                  style={[styles.roundOptionRow, index === activeRoundIdx && styles.roundOptionRowActive]}
                  onPress={() => {
                    onSelect(index);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.roundOptionText, index === activeRoundIdx && styles.roundOptionTextActive]}>
                    Ronda {item.roundNumber}
                  </Text>
                  {index === rounds.length - 1 ? <Text style={styles.roundOptionMeta}>Actual</Text> : null}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function PlayerBox({ name, pts, op, tone, onPress }) {
  const toneStyle =
    tone === "win"
      ? { backgroundColor: "#5cb85c22", borderColor: "#5cb85c55" }
      : tone === "loss"
      ? { backgroundColor: "#c1594f22", borderColor: "#c1594f55" }
      : tone === "draw"
      ? { backgroundColor: "#d4a53722", borderColor: "#d4a53755" }
      : { borderColor: colors.line };
  const content = (
    <View style={styles.playerRow}>
      <Text style={styles.playerName}>{name}</Text>
      <View style={styles.ptsBox}>
        <Text style={styles.ptsBoxText}>{pts ?? 0}</Text>
      </View>
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.playerBox, toneStyle, pressed && { opacity: 0.7 }]}>
        {content}
      </Pressable>
    );
  }
  return <View style={[styles.playerBox, toneStyle]}>{content}</View>;
}

function ResultBtn({ label, active, onPress, tone }) {
  const bg = active ? (tone === "gold" ? colors.gold : tone === "danger" ? colors.red : colors.teal) : "transparent";
  const fg = active ? (tone === "gold" ? colors.goldInk : "#fff") : colors.inkDim;
  return (
    <Pressable onPress={onPress} style={[styles.resultBtn, { backgroundColor: bg, borderColor: active ? bg : colors.line }]}>
      <Text style={[styles.resultBtnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  finishedBanner: { margin: spacing.lg, marginBottom: 0, backgroundColor: "#9aa3b222", borderColor: colors.line, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
  finishedText: { color: colors.inkDim, fontSize: 12.5, fontWeight: "600", textAlign: "center" },
  editHint: { color: colors.gold, fontSize: 11, textAlign: "center", marginBottom: 4 },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: 8 },
  roundSelectorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  roundSelector: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
  },
  roundSelectorText: { color: colors.gold, fontSize: 13, fontWeight: "700" },
  roundSelectorCaret: { color: colors.gold, fontSize: 11 },
  card: { backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, alignSelf: "stretch" },
  cardRow: { flexDirection: "row", alignItems: "stretch", gap: 10 },
  cardContent: { flex: 1 },
  tableBadge: {
    backgroundColor: colors.panel2,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.sm,
    minWidth: 28,
    paddingVertical: 3,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tableBadgeText: { color: colors.gold, fontSize: 12.5, fontWeight: "700" },
  hint: { color: colors.inkDim, fontSize: 10, marginBottom: 6, textAlign: "center" },
  matchRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: 10 },
  playerColumn: { alignItems: "center", gap: 6 },
  playerBox: { borderWidth: 1, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 10, alignItems: "center" },
  playerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  playerName: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  ptsBox: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
    borderRadius: radius.sm,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  ptsBoxText: { color: colors.gold, fontSize: 13, fontWeight: "700" },
  vs: { color: colors.inkDim, fontSize: 11, fontWeight: "700", marginTop: 14 },
  resultBtn: { borderWidth: 1, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 10 },
  resultBtnText: { fontSize: 11, fontWeight: "600" },
  empty: { color: colors.inkDim, fontSize: 13, textAlign: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "#000000aa", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalBox: { width: "100%", maxHeight: "70%", backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg },
  addLabel: { color: colors.inkDim, fontSize: 11.5, marginBottom: 8 },
  roundOptionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  roundOptionRowActive: {},
  roundOptionText: { color: colors.ink, fontSize: 13.5, fontWeight: "500" },
  roundOptionTextActive: { color: colors.gold, fontWeight: "700" },
  roundOptionMeta: { color: colors.inkDim, fontSize: 11 },
});