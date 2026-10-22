// 독촉 사다리 종류 넷(결재 차례 · 종료 후 지출결의 없음 · 증빙 없음 재촉 · 선결제 독촉)이 같이 쓰는 후보 만들기(N10 · C-P2-2).
// 한 tick에 가장 높은 회차 한 행만 만들고(앞 회차는 이미 보냈거나 지난 것 — dedup 키가 같은 회차를 막는다),
// 사다리가 끝난(3회차 기한) 지 14일 넘은 건은 만들지 않는다(첫 배포 백로그 상한). 2회차부터 본인 + 팀장, 대표에게는 올리지 않는다.
import { log } from "@/lib/log";
import type { HolidayLookup } from "@/domain/holidays/business-day";
import { loadHolidayLookup } from "@/domain/holidays/calendar";
import { LUNAR_TABLE_FIRST_YEAR, LUNAR_TABLE_LAST_YEAR } from "@/domain/holidays/lunar-table";
import type { NotificationCandidate } from "@/domain/notify/condition-kinds";
import { ladderFinishedBefore, ladderRounds } from "@/domain/notify/ladder";
import { NOTIFY_EVENT_LOOKBACK_DAYS } from "@/domain/notify/limits";

// 종류 쿼리의 날짜 창 길이 — 첫 기한이 이보다 오래된 건은 사다리(3회차 + 백로그 14일)가 이미 끝나 후보가 될 수 없다(공휴일 연휴 여유 포함).
export const LADDER_SCAN_DAYS = 45;

const NO_DATES: ReadonlySet<string> = new Set();

// 올해 앞뒤 한 해를 음력 표 범위로 잘라 읽는다(표 밖 해는 주말만 뺀다 — pay-schedule-load와 같은 선례).
export async function loadLadderLookup(today: string): Promise<HolidayLookup> {
  const year = Number(today.slice(0, 4));
  const years: number[] = [];
  for (let y = Math.max(year - 1, LUNAR_TABLE_FIRST_YEAR); y <= Math.min(year + 1, LUNAR_TABLE_LAST_YEAR); y += 1) years.push(y);
  const loaded = years.length > 0 ? await loadHolidayLookup(years) : null;
  return (y) => (y < LUNAR_TABLE_FIRST_YEAR || y > LUNAR_TABLE_LAST_YEAR || !loaded || !years.includes(y) ? NO_DATES : loaded(y));
}

// 달력일 이동(YYYY-MM-DD) — 산술은 UTC 자정 Date로만(domain/holidays/business-day.ts와 같은 관례).
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type LadderInput = {
  entity: string;
  entityId: string;
  // 첫 기한(달력 날짜) — 비영업일이면 다음 영업일부터 센다.
  firstDue: string;
  today: string;
  lookup: HolidayLookup;
  // 1회차부터 받는 사람(본인).
  recipients: readonly string[];
  // 2회차부터 더하는 사람(팀장) — 본인과 겹치면 한 번만.
  escalation: readonly string[];
  // 1회차 문장 — 2회차부터 끝에 `· {N}회차`가 붙는다.
  message: string;
};

export function ladderCandidates(input: LadderInput): NotificationCandidate[] {
  if (ladderFinishedBefore(input.firstDue, shiftDate(input.today, -NOTIFY_EVENT_LOOKBACK_DAYS), input.lookup)) return [];
  const rounds = ladderRounds(input.firstDue, input.today, input.lookup);
  const round = rounds[rounds.length - 1];
  if (round === undefined) return [];
  const recipients = round >= 2 ? [...new Set([...input.recipients, ...input.escalation])] : [...new Set(input.recipients)];
  const text = round >= 2 ? `${input.message} · ${round}회차` : input.message;
  return recipients.map((recipientId) => ({
    entity: input.entity,
    entityId: input.entityId,
    recipientId,
    round,
    referenceDate: input.firstDue,
    message: text,
  }));
}

// 종류 쿼리가 limit + 1행을 돌려주면 평가량 상한에 걸린 것 — 상한까지만 쓰고 경고를 남긴다(조용한 유실 아님, C-P2-13).
export function capRows<Item>(kind: string, rows: readonly Item[], max: number): Item[] {
  if (rows.length <= max) return [...rows];
  log.warn("notify.condition_capped", { kind, max });
  return rows.slice(0, max);
}
