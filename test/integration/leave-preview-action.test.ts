import { describe, expect, it, vi } from "vitest";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { setUserArchived } from "@/repositories/users";
import { makePerson } from "./approvals-fixtures";

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
