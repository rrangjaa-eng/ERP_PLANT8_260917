import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { Viewer } from "@/domain/viewer";
import { listProjectMembersAction } from "@/app/(app)/projects/actions";
import { buildViewScopeWorld, insertLiveMember } from "./fixtures/view-scope";

// 06.2-12(검토 반영 R1: eng I8): `risk:` 태그 대신 이 음성 테스트로 읽기 한 길을 못 박는다 — 판정은 06.2-05 도메인(Opus 실행 · 검토)이 이미 하고, 이 액션은 그 결과를 내릴 뿐이다.
// 세션만 가짜로 둔다(purchase-requests.test.ts 꼴).
const session = vi.hoisted(() => ({ viewer: null as Viewer | null }));
vi.mock("@/lib/viewer", () => ({
  getSession: () => Promise.resolve(session.viewer ? { viewer: session.viewer, user: { id: session.viewer.id } } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

describe("listProjectMembersAction — 읽기 액션 범위(eng I8)", () => {
  it("범위 밖 viewer(담당 팀 밖 · 참여자 아님)는 일반 문구만 받고 data가 없다 · 없는 id도 같은 문구", async () => {
    const w = await buildViewScopeWorld();
    session.viewer = w.people.팀PM;
    const outside = await listProjectMembersAction({ projectId: w.projects.P3.id });
    expect(outside?.serverError).toBe("처리 실패 · 다시 시도");
    expect(outside?.data).toBeUndefined();
    const missing = await listProjectMembersAction({ projectId: randomUUID() });
    expect(missing?.serverError).toBe("처리 실패 · 다시 시도");
    expect(missing?.data).toBeUndefined();
  });

  it("같은 viewer를 참여자로 붙이면 pm · rows가 온다(양성 대조)", async () => {
    const w = await buildViewScopeWorld();
    await insertLiveMember(w.projects.P3.id, w.people.팀PM.id, w.people.대표.id);
    session.viewer = w.people.팀PM;
    const inside = await listProjectMembersAction({ projectId: w.projects.P3.id });
    expect(inside?.serverError).toBeUndefined();
    expect(inside?.data?.pm).toMatchObject({ userId: w.people.X.id });
    expect(inside?.data?.rows.map((row) => row.userId)).toEqual(expect.arrayContaining([w.people.참여자.id, w.people.팀PM.id]));
    expect(inside?.data?.canEdit).toBe(false);
  });
});
