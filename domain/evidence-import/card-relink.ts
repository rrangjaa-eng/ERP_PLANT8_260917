import { resolveCardForLine } from "@/domain/evidence-import/cards";
import { EVIDENCE_FORMATS } from "@/domain/evidence-import/registry";
import type { Viewer } from "@/domain/viewer";
import { findCardsByLast4, findCorpCardById } from "@/repositories/corp-cards";
import { findUnknownCardRecordsByLast4, linkRecordsToCard } from "@/repositories/evidence-records";

// 06.1-04 Round 2 G11: 카드 마스터 저장의 부수 효과 — 짝 판정은 등록과 같은 함수, 대사는 06.1-09 길.
// 카드를 만들거나 · 활성을 바꾸거나 · 보관함에서 되살린 뒤 그 끝 4자리의 「카드 미등록」 기록을 등록 때와 같은 resolveCardForLine으로
// 다시 판정해 잇는다 — 카드 미등록 줄이 막다른 길이 되지 않게. 권한 판정은 하지 않는다(부르는 쪽이 카드 관리 쓰기 · 보관함 쓰기
// 판정을 지난 뒤다). 행동 로그도 새로 남기지 않는다(원인은 카드 쪽 document_create · restore가 남긴다).
export async function relinkUnknownCardRecords(viewer: Viewer, cardId: string): Promise<{ linked: number }> {
  const card = await findCorpCardById(viewer, cardId);
  if (!card) return { linked: 0 };
  const records = await findUnknownCardRecordsByLast4(viewer, card.numberLast4);
  if (records.length === 0) return { linked: 0 };
  const candidates = await findCardsByLast4(viewer, [card.numberLast4]);

  const recordIdsByCard = new Map<string, string[]>();
  for (const record of records) {
    const format = EVIDENCE_FORMATS.find((rule) => rule.key === record.format);
    const target = format ? resolveCardForLine({ cardLast4: card.numberLast4 }, format, candidates) : null;
    if (target !== null) recordIdsByCard.set(target, [...(recordIdsByCard.get(target) ?? []), record.id]);
  }
  let linked = 0;
  for (const [target, recordIds] of recordIdsByCard) linked += await linkRecordsToCard(viewer, target, recordIds);
  return { linked };
}
