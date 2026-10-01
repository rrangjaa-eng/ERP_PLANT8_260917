import { certLinkExpiresAt } from "@/domain/certs/link-window";
import { FORMAT_ERROR as DATE_FORMAT_ERROR, isCalendarDate } from "@/domain/projects/period";

// 04.3-10 Task 1 ⑧ — I′2 「QR 생성 신청」 옆 패널의 순수 판정(UI-SPEC I′2 · 「개정 (2026-10-01 결정 확정)」 T6 — UD-4 a ·
// DR-5). React · DB · 설정을 import하지 않는다. 화면은 이 함수들만 불러 막힘 이유 · 계산 줄 · 응답 갈래를 정한다.

export type BlockReason = { text: string; tone: "block" };

// 문의 전화 없음 두 문장은 04.3-04 I2 문장 그대로(I′3 「QR 생성」 막힘도 같은 문장 — DR-12).
export function contactMissingText(canOpenSettings: boolean): string {
  return canOpenSettings ? "수령자 문의 전화 없음 · 설정 확인증 탭에서 채움" : "수령자 문의 전화 없음 · 등록은 경영관리";
}

// 막힘 한 번에 하나, 이 순서: 문의 전화 없음 → 빈 칸 → 지난 날짜(오늘 KST 이전 — 서버 requestQr도 같은 판정).
export function requestBlockReason(input: {
  contactMissing: boolean;
  canOpenSettings: boolean;
  name: string;
  wonOn: string;
  today: string;
}): BlockReason | null {
  if (input.contactMissing) return { text: contactMissingText(input.canOpenSettings), tone: "block" };
  const empty = [...(input.name.trim() === "" ? ["행사 이름"] : []), ...(input.wonOn === "" ? ["당첨일"] : [])];
  const [first] = empty;
  if (first) {
    const fields = empty.length > 1 ? `${empty.join(" · ")} ${empty.length}칸` : first;
    return { text: `${fields} 비어 있음 · ${first} 적기`, tone: "block" };
  }
  if (isCalendarDate(input.wonOn) && input.wonOn < input.today) return { text: "지난 날짜 · 당첨일 확인", tone: "block" };
  return null;
}

const KST_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function kstMonthDayTime(date: Date): string {
  const parts = KST_PARTS.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

// 칸 아래 계산 줄 — 당첨일이 유효할 때만(빈 칸 · 형식 틀림 · 지난 날짜면 없다). 마감은 N15 a와 같은 함수.
export function linkWindowLine(input: { wonOn: string; today: string; now: Date; expireHours: number }): string | null {
  if (!isCalendarDate(input.wonOn) || input.wonOn < input.today) return null;
  const closes = certLinkExpiresAt(input.wonOn, input.now, input.expireHours);
  return `열림 ${input.wonOn.slice(5)} 00:00 · 마감 ${kstMonthDayTime(closes)}`;
}

export type RequestFieldErrors = { name?: string; wonOn?: string };

export type RequestOutcome =
  | { kind: "ok"; eventId: string }
  | { kind: "contactMissing" }
  | { kind: "invalid"; fieldErrors: RequestFieldErrors }
  | { kind: "failed" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// 액션 응답(또는 호출이 던졌을 때 "unreachable")을 네 갈래로. 결과를 알 수 없는 것은 전부 failed — 같은 요청 키로
// 다시 누른다(행사 둘 안 생김).
export function requestOutcome(response: unknown): RequestOutcome {
  if (!isRecord(response) || response.serverError !== undefined || response.validationErrors !== undefined) {
    return { kind: "failed" };
  }
  const data = response.data;
  if (!isRecord(data)) return { kind: "failed" };
  if (data.kind === "ok" && typeof data.eventId === "string") return { kind: "ok", eventId: data.eventId };
  if (data.kind === "contactMissing") return { kind: "contactMissing" };
  if (data.kind === "invalid" && isRecord(data.fieldErrors)) {
    return { kind: "invalid", fieldErrors: data.fieldErrors };
  }
  return { kind: "failed" };
}

// 서버 칸 오류(화면 막힘이 먼저 거르므로 드물다 — 다른 탭에서 날짜가 바뀐 경우)를 칸 아래 한 줄로.
export function requestFieldErrorText(fieldErrors: RequestFieldErrors): { name?: string; wonOn?: string } {
  const text: { name?: string; wonOn?: string } = {};
  if (fieldErrors.name === "required") text.name = "행사 이름 비어 있음 · 행사 이름 적기";
  else if (fieldErrors.name === "tooLong") text.name = "80자 넘음 · 80자 안으로 줄이기";
  if (fieldErrors.wonOn === "required") text.wonOn = "당첨일 비어 있음 · 당첨일 적기";
  else if (fieldErrors.wonOn === "past") text.wonOn = "지난 날짜 · 당첨일 확인";
  else if (fieldErrors.wonOn === "format") text.wonOn = DATE_FORMAT_ERROR;
  return text;
}

// UI-SPEC 문장(`신청했는지 확인하지 못했습니다 · 다시 눌러 주세요`)은 내부 오류 명사형 규칙(DECISIONS 2026-09-26 · 사용자 결정 A
// 2026-09-29 — test/unit/error-copy-noun-style)과 부딪혀 옛 I2 선례(`만들기 결과 모름 · 다시 누르기`)의 꼴로 쓴다(/design-review 확인 요청).
export const REQUEST_UNKNOWN_TEXT = "신청 결과 모름 · 다시 누르기";
