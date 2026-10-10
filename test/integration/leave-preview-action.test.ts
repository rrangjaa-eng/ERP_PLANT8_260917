import { describe, expect, it, vi } from "vitest";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { setUserArchived } from "@/repositories/users";
import { submitLeave } from "@/domain/leave";
import { seoulToday } from "@/lib/dates";
import { makePerson, NOW_2026 } from "./approvals-fixtures";

// 04.1-06 코드 검토 L3: 결재선이 막혀도(대표 없음) 신청 창 미리보기는 잔고 행을 버리지 않고, 막힌 이유를 결재선
// 자리에 준다 — 이유를 제출해야 처음 보는 일이 없게.
const session = vi.hoisted(() => ({ viewer: null as Viewer | null }));
vi.mock("@/lib/viewer", () => ({
  getSession: () =>
    Promise.resolve(session.viewer ? { viewer: session.viewer, user: { id: session.viewer.id } } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { previewLeaveAction } = await import("@/app/(app)/leave/actions");

describe("previewLeaveAction — 결재선 막힘", () => {
  it("담당과 대표가 모두 보관돼 결재선이 막히면 잔고 행은 그대로이고 route 대신 막힌 이유를 준다", async () => {
    const drafter = await makePerson("미리보기기안", DEFAULT_ROLE_ID, "기획1팀");
    const lead = await makePerson("미리보기팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    const ceo = await makePerson("미리보기대표", CEO_ROLE_ID, null);
    await setUserArchived(SYSTEM_VIEWER, lead.id, true);
    await setUserArchived(SYSTEM_VIEWER, ceo.id, true);
    session.viewer = drafter;

    const result = await previewLeaveAction({ kind: "full_day", startDate: "", endDate: "", half: "", note: "" });

    expect(result?.serverError).toBeUndefined();
    expect(result?.data?.balance?.[0]?.text).toMatch(/^연차 남음 [\d.]+일 · 결재 중 0일$/);
    expect(result?.data?.route).toBeNull();
    expect(result?.data?.routeBlocked).toBe("대표 없음 · 관리자에게 대표 계급 확인 요청");
  });
});

const input = (fields: { kind: string; startDate: string; endDate?: string; half?: string }) => ({
  endDate: fields.startDate,
  half: "",
  note: "",
  ...fields,
});

describe("previewLeaveAction — 휴일 제외 일수(06.3)", () => {
  it("종일 2026-09-23~28은 offDays 4(추석 사흘 + 일요일) · 09-21~23은 0 · 반차는 null", async () => {
    session.viewer = await makePerson("휴일미리보기", DEFAULT_ROLE_ID, "기획1팀");
    const chuseok = await previewLeaveAction(input({ kind: "full_day", startDate: "2026-09-23", endDate: "2026-09-28" }));
    const plain = await previewLeaveAction(input({ kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-23" }));
    const half = await previewLeaveAction(input({ kind: "half_day", startDate: "2026-09-22", half: "am" }));
    expect(chuseok?.data?.offDays).toBe(4);
    expect(plain?.data?.offDays).toBe(0);
    expect(half?.data?.offDays).toBeNull();
  });
});

describe("previewLeaveAction — 막힘 줄(06.3 확정 K-D1)", () => {
  async function blockedOf(fields: Parameters<typeof input>[0]) {
    session.viewer = await makePerson("막힘줄미리보기", DEFAULT_ROLE_ID, "기획1팀");
    return (await previewLeaveAction(input(fields)))?.data?.blockedReason;
  }

  it("추석 당일 반차는 시작일 칸 `휴일 · 다른 날 고르기`", async () => {
    expect(await blockedOf({ kind: "half_day", startDate: "2026-09-25", half: "am" })).toEqual({ field: "startDate", message: "휴일 · 다른 날 고르기" });
  });

  it("종일 2026-09-24~27은 `휴일만 고른 기간 · 평일 넣기`", async () => {
    expect(await blockedOf({ kind: "full_day", startDate: "2026-09-24", endDate: "2026-09-27" })).toEqual({
      field: "startDate",
      message: "휴일만 고른 기간 · 평일 넣기",
    });
  });

  it("종일 2026-12-30~2027-01-04는 종료일 칸 회계연도 오류", async () => {
    expect(await blockedOf({ kind: "full_day", startDate: "2026-12-30", endDate: "2027-01-04" })).toEqual({
      field: "endDate",
      message: "기간이 회계연도를 넘음 · 12-31과 01-01로 나눠 신청",
    });
  });

  it("빈 칸 오류(시작일 비어 있음)는 싣지 않는다 — 폼 blockedOf 몫", async () => {
    expect(await blockedOf({ kind: "full_day", startDate: "", endDate: "" })).toBeNull();
  });

  it("종일 2026-09-21~23은 null", async () => {
    expect(await blockedOf({ kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-23" })).toBeNull();
  });
});

describe("previewLeaveAction — 겹침 줄(06.3 D-6313)", () => {
  const FULL_21_23 = { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-23", half: "" };

  async function liveWorld() {
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    return drafter;
  }

  it("살아 있는 종일 09-21~23이 있으면 반차 09-22 오전은 시작일 칸 겹침 줄 · 09-28은 null · 날짜 없음은 null · 추석 반차는 휴일 줄이 먼저", async () => {
    const drafter = await liveWorld();
    await submitLeave(drafter, FULL_21_23, { now: NOW_2026 });
    session.viewer = drafter;
    const blockedOf = async (fields: Parameters<typeof input>[0]) => (await previewLeaveAction(input(fields)))?.data?.blockedReason;

    expect(await blockedOf({ kind: "half_day", startDate: "2026-09-22", half: "am" })).toEqual({
      field: "startDate",
      message: "9월 22일 종일 신청과 겹침 · 날짜 바꾸기",
    });
    expect(await blockedOf({ kind: "half_day", startDate: "2026-09-28", half: "am" })).toBeNull();
    expect(await blockedOf({ kind: "half_day", startDate: "", half: "am" })).toBeNull();
    expect(await blockedOf({ kind: "half_day", startDate: "2026-09-25", half: "am" })).toEqual({ field: "startDate", message: "휴일 · 다른 날 고르기" });
  });

  it("V4: 다른 기안자(김민수)의 살아 있는 09-22만 있으면 박서연 미리보기 09-22는 null(남의 신청은 보이지 않는다)", async () => {
    const drafter = await liveWorld();
    const other = await makePerson("김민수", DEFAULT_ROLE_ID, "기획1팀");
    await submitLeave(other, { kind: "full_day", startDate: "2026-09-22", endDate: "2026-09-22", half: "" }, { now: NOW_2026 });
    session.viewer = drafter;
    const result = await previewLeaveAction(input({ kind: "full_day", startDate: "2026-09-22" }));
    expect(result?.data?.blockedReason).toBeNull();
  });

  // 다음 해(시계 기준) 1월 4~10일의 첫 화요일 T · T+1(수) · T+2(목) — 올해 날짜면 날짜 있는 계산과 날짜 전 계산이 우연히 같은 해 · 같은 숫자라
  // 날짜 있는 결과에서 글자만 거르는 잘못된 구현도 통과한다. 다음 해는 늘 다른 회계연도라 그 구현을 붉게 만든다.
  function nextYearDates() {
    const year = Number(seoulToday().slice(0, 4)) + 1;
    const at = (day: number) => `${year}-01-${String(day).padStart(2, "0")}`;
    const tuesday = 4 + ((2 - new Date(Date.UTC(year, 0, 4)).getUTCDay() + 7) % 7);
    return { t: at(tuesday), t1: at(tuesday + 1), t2: at(tuesday + 2), blocked: `1월 ${tuesday}일 종일 신청과 겹침 · 날짜 바꾸기` };
  }

  it("D-6318: 겹침으로 막힌 미리보기의 잔고 행은 휴일 막힘 · 날짜 없음과 같은 날짜 전 꼴이고, 막히지 않은 날은 이번 신청을 보인다", async () => {
    const dates = nextYearDates();
    const drafter = await liveWorld();
    await submitLeave(drafter, { kind: "full_day", startDate: dates.t, endDate: dates.t1, half: "" }, { now: NOW_2026 });
    session.viewer = drafter;
    const previewOf = async (fields: Parameters<typeof input>[0]) => (await previewLeaveAction(input(fields)))?.data;
    const textsOf = (data: Awaited<ReturnType<typeof previewOf>>) => data?.balance?.map((line) => line.text);

    const overlap = await previewOf({ kind: "half_day", startDate: dates.t, half: "am" });
    const holiday = await previewOf({ kind: "half_day", startDate: "2026-09-25", half: "am" });
    const noDate = await previewOf({ kind: "half_day", startDate: "", half: "am" });
    const free = await previewOf({ kind: "half_day", startDate: dates.t2, half: "am" });

    expect(overlap?.blockedReason).toEqual({ field: "startDate", message: dates.blocked });
    expect(textsOf(overlap)).toEqual(textsOf(noDate));
    expect(textsOf(holiday)).toEqual(textsOf(noDate));
    expect(textsOf(overlap)).toHaveLength(1);
    expect(textsOf(overlap)?.[0]).toMatch(/^연차 남음 [\d.]+일(?: · 월차 남음 [\d.]+일)? · 결재 중 [\d.]+일$/);
    expect(free?.blockedReason).toBeNull();
    expect(textsOf(free)?.[0]).toMatch(/ · 이번 신청 0\.5일$/);
  });

  it("D-6318: 재택 겹침은 막힘 줄만 있고 잔고 행이 없다", async () => {
    const dates = nextYearDates();
    const drafter = await liveWorld();
    await submitLeave(drafter, { kind: "full_day", startDate: dates.t, endDate: dates.t1, half: "" }, { now: NOW_2026 });
    session.viewer = drafter;
    const data = (await previewLeaveAction(input({ kind: "remote", startDate: dates.t })))?.data;
    expect(data?.blockedReason).toEqual({ field: "startDate", message: dates.blocked });
    expect(data?.balance).toBeNull();
  });
});
