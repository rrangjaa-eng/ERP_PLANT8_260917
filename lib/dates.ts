import { kstDateOf } from "@/lib/kst-date";

// 04.1(CEO-11): 04.1 코드의 「오늘」·회계연도·문서 번호 연도·스냅숏 기준일의
// 유일한 출처 — 서울 날짜 `YYYY-MM-DD`. Cloud Run은 TZ가 없어 UTC라
// `toISOString()` 앞 10자나 `getFullYear()`로 만들면 한국 시간 0~9시에 하루
// (연말이면 한 해)가 틀린다. 계산은 lib/kst-date.ts(Phase 4)와 같은 Intl 방식이다.
export function seoulToday(now: Date = new Date()): string {
  return kstDateOf(now);
}

// 04.1-03(A-03): 서울 날짜 `YYYY-MM-DD` → 그 날짜의 UTC 자정 `Date`. 이력형 설정
// asOf의 유일한 변환이다 — getSettingValue가 asOf를 `toISOString().slice(0, 10)`으로
// 날짜로 되돌리므로 같은 날짜가 돌아온다. 로컬 자정(`new Date(y, m, d)`)은
// TZ=Asia/Seoul 개발기에서 전날이 된다.
export function seoulDateToUtcDate(date: string): Date {
  const result = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== date) {
    throw new Error(`날짜 형식이 아닙니다: ${date}`);
  }
  return result;
}
