import { kstDateOf } from "@/lib/kst-date";

// 04.1(CEO-11): 04.1 코드의 「오늘」·회계연도·문서 번호 연도·스냅숏 기준일의
// 유일한 출처 — 서울 날짜 `YYYY-MM-DD`. Cloud Run은 TZ가 없어 UTC라
// `toISOString()` 앞 10자나 `getFullYear()`로 만들면 한국 시간 0~9시에 하루
// (연말이면 한 해)가 틀린다. 계산은 lib/kst-date.ts(Phase 4)와 같은 Intl 방식이다.
export function seoulToday(now: Date = new Date()): string {
  return kstDateOf(now);
}
