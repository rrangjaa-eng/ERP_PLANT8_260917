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
