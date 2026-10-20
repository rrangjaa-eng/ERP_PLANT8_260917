import type { FormatRule } from "@/domain/evidence-import/types";

// 06.1-04: 카드 줄의 카드 · 같은 승인번호 다른 금액 · 같은 내용 줄 무리 판정(순수 함수 — DB를 읽지 않는다).
// 등록(registerEvidenceFile)과 카드 마스터 저장 뒤 다시 잇기(card-relink.ts)가 같은 함수를 쓴다.
// 사유 글자는 UI-SPEC Copywriting 「`확인 필요` 사유」 행 그대로.

export const SAME_CONTENT_CHECK = "같은 내용 줄 · 앞 파일과 건수 확인";
export const SAME_APPROVAL_OTHER_AMOUNT_CHECK = "같은 승인번호 다른 금액 · 원거래 확인";
// /review P2-1(사용자 결정 2026-10-17 「지금 막기」): 앞 파일 대조로 한쪽만 등록된 상쇄 쌍을 맞출 때 원거래 줄에 세운다 — 취소된 거래가
// 팀 공개로 남아 지출결의 증빙으로 붙지 않게(확인 필요 줄은 팀원 범위에서 빠진다 — repositories/evidence-records.ts scopeWhere).
export const CANCEL_REGISTERED_CHECK = "취소 줄 등록됨 · 원거래 확인";

export type CardCandidate = { id: string; issuer: string; numberLast4: string; active: boolean };

// 발급사는 자유 입력 칸이다 — 공백을 지우고 대문자로 맞춰 별칭(신한 · 비씨 · BC · 롯데)이 들어 있는지만 본다.
export function issuerText(text: string): string {
  return text.replaceAll(/\s/g, "").toUpperCase();
}

// 카드는 사람이 고르지 않고 파일이 정한다(CONTEXT 「이미 확정」 8번). 끝 4자리가 같고 발급사에 서식 별칭이 든 후보가 하나면 그 카드,
// 둘 이상이면 그중 활성 하나(B-F15 — 재발급), 그 밖은 카드 미등록. 끝 4자리를 못 읽은 줄(E1)도 미등록이다. 보관 카드는 후보에 오지 않는다.
export function resolveCardForLine(
  line: { cardLast4: string | null },
  format: Pick<FormatRule, "issuerAliases">,
  candidates: readonly CardCandidate[],
): string | null {
  if (line.cardLast4 === null) return null;
  const aliases = format.issuerAliases.map(issuerText);
  const matched = candidates.filter((card) => card.numberLast4 === line.cardLast4 && aliases.some((alias) => issuerText(card.issuer).includes(alias)));
  if (matched.length === 1) return matched[0]?.id ?? null;
  const active = matched.filter((card) => card.active);
  return matched.length > 1 && active.length === 1 ? (active[0]?.id ?? null) : null;
}

type ApprovalLine = { cardLast4: string | null; approvalNo: string | null; totalKrw: number; needsCheck: string | null };
type EarlierRecord = { cardLast4: string | null; approvalNo: string | null; totalKrw: number };

// A-10: 카드사 재출력 · 금액 정정으로 같은 끝 4자리 · 같은 승인번호 · 같은 부호에 합계만 다른 앞 기록이 있으면 열쇠(합계 포함)가
// 달라 따로 등록된다 — 건너뛰지 않고 확인 필요를 세운다. 부호가 다르면 부분 취소라 세우지 않는다. 06.1-02 사유가 먼저다.
export function flagSameApprovalOtherAmount<T extends ApprovalLine>(lines: readonly T[], earlier: readonly EarlierRecord[]): T[] {
  return lines.map((one) => {
    if (one.needsCheck !== null || one.approvalNo === null || one.cardLast4 === null) return one;
    const hit = earlier.some(
      (record) =>
        record.cardLast4 === one.cardLast4 &&
        record.approvalNo === one.approvalNo &&
        Math.sign(record.totalKrw) === Math.sign(one.totalKrw) &&
        record.totalKrw !== one.totalKrw,
    );
    return hit ? { ...one, needsCheck: SAME_APPROVAL_OTHER_AMOUNT_CHECK } : one;
  });
}

type GroupLine = { dedupeKey: string; baseKey: string; needsCheck: string | null };

// GH-P1: 카드 줄의 `#n`은 한 파일 안에서만 줄을 가른다 — 겹치는 두 내보내기 [A,B] · [B,C]의 C가 B의 열쇠 `…#2`와 같아 조용히
// 빠지지 않게, 같은 baseKey 무리 중 하나라도 이미 등록이고 무리가 이 파일에서 2줄 이상이거나 기존 `{baseKey}#2`가 있으면 그 무리를
// 건너뛰지 않는다. 이미 있는 열쇠의 줄은 `{열쇠}@{파일 sha256 앞 16자}`로, 무리 줄 전부에 (사유가 아직 없으면) 확인 필요를 세운다 —
// 사람이 중복은 보관하고 진짜는 확인 필요를 푼다(옛 260907 check-duplicates와 같은 결: 짐작 열쇠는 제외하지 않고 사람이 가른다).
export function planAmbiguousGroups<T extends GroupLine>(lines: readonly T[], existingKeys: ReadonlySet<string>, shaPrefix: string): T[] {
  const groups = new Map<string, T[]>();
  for (const one of lines) groups.set(one.baseKey, [...(groups.get(one.baseKey) ?? []), one]);
  const ambiguous = new Set<string>();
  for (const [baseKey, members] of groups) {
    const touchesEarlier = members.some((one) => existingKeys.has(one.dedupeKey));
    if (touchesEarlier && (members.length >= 2 || existingKeys.has(`${baseKey}#2`))) ambiguous.add(baseKey);
  }
  return lines.map((one) =>
    ambiguous.has(one.baseKey)
      ? {
          ...one,
          dedupeKey: existingKeys.has(one.dedupeKey) ? `${one.dedupeKey}@${shaPrefix}` : one.dedupeKey,
          needsCheck: one.needsCheck ?? SAME_CONTENT_CHECK,
        }
      : one,
  );
}
