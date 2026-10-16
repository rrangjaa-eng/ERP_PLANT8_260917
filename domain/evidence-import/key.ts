import type { EvidenceFormatKey, KeyedLine, ParsedLine } from "@/domain/evidence-import/types";

// 06.1-02: 중복 열쇠(dedupe key)와 같은 파일 안 완전 상쇄 쌍. 열쇠는 파일 안 값만으로 정한다(시각 · 무작위 없음) —
// 같은 파일을 다시 올리면 같은 열쇠가 나온다(EVID-06). 접두어는 서식 키(B-F17).

function baseKeyOf(format: EvidenceFormatKey, keyKind: "card" | "approval", line: ParsedLine): string {
  if (keyKind === "approval") return `${format}|${line.approvalNo ?? ""}`;
  const last4 = line.cardLast4 ?? "";
  // 취소 줄이 원거래와 승인번호를 같이 쓴다 — 날짜 · 부호 있는 합계까지 넣어야 취소가 원거래로 뭉개지지 않는다(Pitfall 1).
  if (line.approvalNo !== null) return `${format}|${last4}|${line.approvalNo}|${line.issuedOn}|${line.totalKrw}`;
  const usedAt = line.usedAt === null ? line.issuedOn : `${line.issuedOn} ${line.usedAt}`;
  return `${format}|${last4}|${usedAt}|${line.merchant ?? ""}|${line.totalKrw}`;
}

// 카드 서식만 같은 파일 안 같은 열쇠에 등장 순서 꼬리표 `#2` · `#3`. `#n`은 파일을 넘는 정체가 아니므로 꼬리표 앞 열쇠
// `baseKey`와 이 파일의 같은 baseKey 줄 수 `sameKeyCount`를 함께 싣는다 — 앞 파일과 겹친 무리의 판정은 06.1-04(GH-P1).
// 승인번호 서식(홈택스)은 파일 안 겹침이 서식 규칙의 줄 오류라 여기 오지 않는다 — sameKeyCount는 늘 1.
export function dedupeKeys(format: EvidenceFormatKey, keyKind: "card" | "approval", lines: readonly ParsedLine[]): KeyedLine[] {
  const bases = lines.map((line) => baseKeyOf(format, keyKind, line));
  const counts = new Map<string, number>();
  for (const base of bases) counts.set(base, (counts.get(base) ?? 0) + 1);
  const seen = new Map<string, number>();
  return lines.map((line, at) => {
    const baseKey = bases[at] ?? "";
    const nth = (seen.get(baseKey) ?? 0) + 1;
    seen.set(baseKey, nth);
    const dedupeKey = keyKind === "card" && nth > 1 ? `${baseKey}#${nth}` : baseKey;
    return { ...line, dedupeKey, baseKey, sameKeyCount: counts.get(baseKey) ?? 1 };
  });
}

// 같은 카드 · 같은 승인번호 · 합이 0인 원거래 + 취소 두 줄(완전 상쇄 쌍)을 뺀다(E38 — 옛 markOffsetPairs 기본 제외).
// 부분 취소(값이 다른 음수 줄)는 남긴다. 이미 짝지은 줄은 다시 쓰지 않는다.
export function splitOffsetPairs<T extends ParsedLine>(lines: readonly T[]): { lines: T[]; offsetPairs: number } {
  const groups = new Map<string, number[]>();
  lines.forEach((line, at) => {
    if (line.approvalNo === null) return;
    const group = `${line.cardLast4 ?? ""}|${line.approvalNo}`;
    groups.set(group, [...(groups.get(group) ?? []), at]);
  });
  const removed = new Set<number>();
  let offsetPairs = 0;
  for (const ats of groups.values()) {
    if (ats.length < 2) continue;
    for (const cancel of ats) {
      const amount = lines[cancel]?.totalKrw ?? 0;
      if (amount >= 0 || removed.has(cancel)) continue;
      const original = ats.find((at) => !removed.has(at) && (lines[at]?.totalKrw ?? 0) === -amount);
      if (original === undefined) continue;
      removed.add(original);
      removed.add(cancel);
      offsetPairs++;
    }
  }
  return { lines: lines.filter((_, at) => !removed.has(at)), offsetPairs };
}
