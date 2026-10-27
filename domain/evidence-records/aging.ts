// 07.1-01(D-7102 · U-3): 증빙 경과일과 임자 없는 증빙 독촉(07 D-721)의 공용 판정 — 목록 「며칠째」 경고 색과 독촉 건수가 같은 경계를 쓴다.
// 순수 모듈 — db · 저장소 · 도메인 index · 알림 종류를 import하지 않는다(독촉 종류와 목록이 둘 다 이 모듈을 읽는다).
import type { EvidenceRecordWord } from "@/domain/evidence-records/status";
import { addDays, kstDateOf, kstDayStart } from "@/lib/kst-date";

const MS_PER_DAY = 86_400_000;

// 독촉 종류 기본값 — 목록의 경고 일수 기본도 같다.
export const ORPHAN_EVIDENCE_RULE = {
  defaults: { enabled: false, days: 7, emailEnabled: true },
  daysRange: { min: 1, max: 60 },
} as const;

// 등록 KST 날짜와 오늘의 날짜 차. 오늘 등록 = 0.
export function evidenceAgeDays(createdAt: Date, today: string): number {
  const created = new Date(`${kstDateOf(createdAt)}T00:00:00Z`).getTime();
  const now = new Date(`${today}T00:00:00Z`).getTime();
  return Math.round((now - created) / MS_PER_DAY);
}

// 등록 KST 날짜가 오늘 − days 이하인 것의 상한(미포함) — `createdAt < 이 값` ⇔ `evidenceAgeDays >= days`.
export function orphanCreatedBefore(today: string, days: number): Date {
  return kstDayStart(addDays(today, -days + 1));
}

// 경고 색: 규칙이 켜져 있고 줄이 공개(팀 · 본부) 상태이며 경과일이 규칙 일수 이상일 때만.
export function isAgeWarn(rule: { enabled: boolean; days: number }, word: EvidenceRecordWord, ageDays: number | null): boolean {
  if (!rule.enabled || ageDays === null) return false;
  if (word !== "팀 공개" && word !== "본부 공개") return false;
  return ageDays >= rule.days;
}
