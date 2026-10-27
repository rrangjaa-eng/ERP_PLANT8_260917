import { formatKrw } from "@/lib/format-number";

// 06.1-09(EVID-10 · E28 · PA-1TO1 · PA-STEP1): 카드 대사 계획 — DB 없는 순수 함수.
// 왜 순수인가: 가져오기 트랜잭션 안에서 부르므로 전역 풀을 읽으면 안 된다(06-03 tx 규칙). 잠금 · 재확인은 호출자가 한다.
// 1단계 = 같은 카드사 · 같은 승인번호 · 같은 사용일(카드는 달라도 된다 — E28 재발급) · 카드 명세 안 붙음 · 합계 음수 아님.
// 2단계 = 같은 카드 · 같은 사용일 · 같은 합계 · 증빙 없음. 두 단계 모두 일대일 — 겹치면 짝 없음(3단계 사람이 고른다).

export type ReconcileLine = {
  recordId: string;
  corpCardId: string | null;
  approvalNo: string | null;
  usedOn: string;
  totalKrw: number;
  needsCheck: string | null;
};

export type ReconcileCandidate = {
  id: string;
  version: number;
  corpCardId: string;
  // 후보 카드의 카드사가 이 파일의 카드사와 같은가(별칭 정규화는 호출자 — cards.ts issuerText).
  sameIssuer: boolean;
  approvalNo: string | null;
  usedOn: string;
  totalKrw: number;
  // 05 전표 파일 · 산 기록 붙임 · 원 구매 요청 증빙 중 하나라도 있으면 true(2단계 제외).
  hasEvidence: boolean;
  // 카드 서식 기록이 이미 붙었나(P1-5 · N-6 — 1단계 제외).
  cardStatementAttached: boolean;
};

export type ReconcileMatch = { recordId: string; usageId: string; step: 1 | 2; version: number };
export type ReconcilePlan = { matches: ReconcileMatch[]; unmatched: string[] };

function eligible(line: ReconcileLine): line is ReconcileLine & { corpCardId: string } {
  return line.corpCardId !== null && line.totalKrw >= 0 && line.needsCheck === null;
}

function stepOneHit(line: ReconcileLine, candidate: ReconcileCandidate): boolean {
  return (
    line.approvalNo !== null &&
    candidate.sameIssuer &&
    candidate.approvalNo === line.approvalNo &&
    candidate.usedOn === line.usedOn &&
    !candidate.cardStatementAttached &&
    candidate.totalKrw >= 0
  );
}

function stepTwoHit(line: ReconcileLine, candidate: ReconcileCandidate): boolean {
  return (
    candidate.corpCardId === line.corpCardId &&
    candidate.usedOn === line.usedOn &&
    candidate.totalKrw === line.totalKrw &&
    !candidate.hasEvidence &&
    (candidate.approvalNo === null || candidate.approvalNo === line.approvalNo)
  );
}

// 키 하나로 묶어 "둘 이상이면 아무도 안 됨"을 센다 — 일대일의 뼈대.
function countBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1);
  return counts;
}

export function planReconcile(lines: readonly ReconcileLine[], candidates: readonly ReconcileCandidate[]): ReconcilePlan {
  const targets = lines.filter(eligible);
  const matches: ReconcileMatch[] = [];
  const matchedLines = new Set<string>();

  // 1단계: 줄마다 맞는 후보가 정확히 하나이고, 그 후보를 맞히는 줄도 이 줄 하나일 때만.
  const stepOne = new Map(targets.map((line) => [line.recordId, candidates.filter((candidate) => stepOneHit(line, candidate))]));
  const stepOneTouched = new Set<string>();
  const stepOneClaims = new Map<string, number>();
  for (const hits of stepOne.values()) {
    for (const hit of hits) {
      stepOneTouched.add(hit.id);
      stepOneClaims.set(hit.id, (stepOneClaims.get(hit.id) ?? 0) + 1);
    }
  }
  for (const line of targets) {
    const hits = stepOne.get(line.recordId) ?? [];
    const only = hits.length === 1 ? hits[0] : undefined;
    if (only && stepOneClaims.get(only.id) === 1) {
      matches.push({ recordId: line.recordId, usageId: only.id, step: 1, version: only.version });
      matchedLines.add(line.recordId);
    }
  }

  // 2단계: 1단계가 건드린 후보는 뺀다. 같은 파일에 같은 카드 · 날짜 · 합계 줄이 둘 이상이면 그 묶음 전부 제외.
  const rest = targets.filter((line) => !matchedLines.has(line.recordId) && (stepOne.get(line.recordId) ?? []).length === 0);
  const sameKey = (line: ReconcileLine) => `${line.corpCardId}|${line.usedOn}|${line.totalKrw}`;
  const fileGroups = countBy(targets, sameKey);
  const pool = candidates.filter((candidate) => !stepOneTouched.has(candidate.id));
  const stepTwo = new Map(
    rest.filter((line) => fileGroups.get(sameKey(line)) === 1).map((line) => [line.recordId, pool.filter((candidate) => stepTwoHit(line, candidate))]),
  );
  const stepTwoClaims = countBy([...stepTwo.values()].flat(), (candidate) => candidate.id);
  for (const line of rest) {
    const hits = stepTwo.get(line.recordId) ?? [];
    const only = hits.length === 1 ? hits[0] : undefined;
    if (only && stepTwoClaims.get(only.id) === 1) {
      matches.push({ recordId: line.recordId, usageId: only.id, step: 2, version: only.version });
      matchedLines.add(line.recordId);
    }
  }

  const unmatched = lines.filter((line) => !matchedLines.has(line.recordId)).map((line) => line.recordId);
  return { matches, unmatched };
}

export type CardRef = { id: string; last4: string };
export type FileWinsPatch = {
  approvalNo: string | null;
  total: { before: number; after: number } | null;
  card: { before: CardRef; after: CardRef } | null;
  usedOn: { before: string; after: string } | null;
};

// D-6111 · 07.1-04 D-7104: 파일이 카드 사용 합계 · 카드 · 사용일을 정한다. 번호는 그대로(호출자가 손대지 않는다).
// 사용일 · 저장된 승인번호는 선택 칸 — 사용일을 덮지 않는 작성자 갈래 호출부는 넘기지 않는다(DB-8). 승인번호가 이미 있으면 다른 값으로 바꾸지 않는다(PE2).
export function fileWinsPatch(
  stored: { totalKrw: number; corpCardId: string; cardLast4: string; usedOn?: string; approvalNo?: string | null },
  line: { totalKrw: number; corpCardId: string; cardLast4: string; approvalNo: string | null; usedOn?: string },
): FileWinsPatch {
  return {
    approvalNo: typeof stored.approvalNo === "string" ? null : line.approvalNo,
    total: stored.totalKrw === line.totalKrw ? null : { before: stored.totalKrw, after: line.totalKrw },
    card: stored.corpCardId === line.corpCardId ? null : { before: { id: stored.corpCardId, last4: stored.cardLast4 }, after: { id: line.corpCardId, last4: line.cardLast4 } },
    usedOn: stored.usedOn !== undefined && line.usedOn !== undefined && stored.usedOn !== line.usedOn ? { before: stored.usedOn, after: line.usedOn } : null,
  };
}

/** D-E1(2026-10-27 사용자 결정): 승인번호가 같아도 사용일이 이만큼보다 더 떨어지면 덮지 않는다 — 다시 쓰인 승인번호로 먼 카드 사용을 덮지 않게. */
export const USED_ON_GAP_MAX_DAYS = 31;

// 달력 일 수 — score.ts dayNumber와 같은 식(그 파일은 다른 플랜 몫이라 여기 둔다).
function dayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / 86_400_000;
}

/** 사용일 차가 한도를 넘으면 막힌 후보 · 서버 거부 글자, 아니면 null. */
export function usedOnGapReason(patch: FileWinsPatch): string | null {
  if (!patch.usedOn) return null;
  const gap = Math.abs(dayNumber(patch.usedOn.after) - dayNumber(patch.usedOn.before));
  return gap > USED_ON_GAP_MAX_DAYS ? `날짜 다름 · ${gap}일` : null;
}

export type OverwriteBlockKind = "holder" | "fixed" | "completed" | "cap";

const BLOCK_WORD: Record<OverwriteBlockKind, string> = {
  holder: "보유자 다름",
  fixed: "연결 고정",
  completed: "완료 프로젝트",
  cap: "실행가 초과",
};

// 바뀐 값 한 조각. 보유자 다름은 카드 쪽 사유라 카드 조각을 앞세운다. 사용일 조각은 맨 뒤(날짜만 바뀐 막힘이 빈 사유로 떨어지지 않게 — E-P2-17).
function changePiece(patch: FileWinsPatch, kind: OverwriteBlockKind): string | null {
  const card = patch.card ? `카드 ${patch.card.before.last4} → ${patch.card.after.last4}` : null;
  const total = patch.total ? `합계 ${formatKrw(patch.total.before)} → ${formatKrw(patch.total.after)}` : null;
  const usedOn = patch.usedOn ? `사용일 ${patch.usedOn.before.slice(5)} → ${patch.usedOn.after.slice(5)}` : null;
  if (kind === "holder") return card ?? total ?? usedOn;
  return total ?? card ?? usedOn;
}

// 카드 R3 · P2-C4: 덮기가 막힌 줄의 한 줄 사유. 덮을 값이 없으면(승인번호만) 막을 것도 없다.
export function overwriteBlockReason(patch: FileWinsPatch, kind: OverwriteBlockKind): string | null {
  const piece = changePiece(patch, kind);
  return piece === null ? null : `${piece} · ${BLOCK_WORD[kind]}`;
}

// ── 3단계 사람 고르기 후보(PA-RELAX · DB-9 · N-6 · N-7 · 카드 R3 · P2-C4) ─────────────────────────────
// 완화 후보 = (같은 승인번호 — 사용일 무관, 카드사가 다르면 막힌 행) 또는 (같은 사용일 ∧ 같은 합계 — 카드 무관). 막힘 판정은 1단계와 같은
// 「카드 명세 붙음」(영수증 · 05 전표 파일은 막지 않는다) → 다른 카드사 → 덮기 막힘(호출자가 06 cardUsageOverwriteBlocks로 구한 종류) 차례.

export type RelaxedLine = { corpCardId: string; cardLast4: string; approvalNo: string | null; usedOn: string; totalKrw: number };
export type RelaxedCandidateInput = {
  id: string;
  number: string | null;
  corpCardId: string;
  cardLast4: string;
  sameIssuer: boolean;
  approvalNo: string | null;
  usedOn: string;
  totalKrw: number;
  cardStatementAttached: boolean;
  overwriteBlock: OverwriteBlockKind | null;
};
export type RelaxedCandidate = { id: string; patch: FileWinsPatch; blockedReason: string | null };

export function isRelaxedHit(line: Pick<RelaxedLine, "approvalNo" | "usedOn" | "totalKrw">, candidate: Pick<RelaxedCandidateInput, "approvalNo" | "usedOn" | "totalKrw">): boolean {
  if (line.approvalNo !== null && candidate.approvalNo === line.approvalNo) return true;
  return candidate.usedOn === line.usedOn && candidate.totalKrw === line.totalKrw;
}

function relaxedBlock(candidate: RelaxedCandidateInput, patch: FileWinsPatch): string | null {
  if (candidate.cardStatementAttached) return `증빙 있음 · ${candidate.number ?? "—"}`;
  if (!candidate.sameIssuer) return `카드 다름 · ${candidate.cardLast4}`;
  const gap = usedOnGapReason(patch);
  if (gap) return gap;
  return candidate.overwriteBlock ? overwriteBlockReason(patch, candidate.overwriteBlock) : null;
}

/** 줄 하나의 완화 후보 — 고를 수 있는 행이 앞, 막힌 행이 맨 뒤(각 묶음 안은 들어온 차례 그대로). */
export function relaxedCandidatesOf(line: RelaxedLine, candidates: readonly RelaxedCandidateInput[]): RelaxedCandidate[] {
  const items = candidates
    .filter((candidate) => isRelaxedHit(line, candidate))
    .map((candidate) => {
      const patch = fileWinsPatch(
        { totalKrw: candidate.totalKrw, corpCardId: candidate.corpCardId, cardLast4: candidate.cardLast4, usedOn: candidate.usedOn, approvalNo: candidate.approvalNo },
        { totalKrw: line.totalKrw, corpCardId: line.corpCardId, cardLast4: line.cardLast4, approvalNo: line.approvalNo, usedOn: line.usedOn },
      );
      return { id: candidate.id, patch, blockedReason: relaxedBlock(candidate, patch) };
    });
  return [...items.filter((item) => item.blockedReason === null), ...items.filter((item) => item.blockedReason !== null)];
}
