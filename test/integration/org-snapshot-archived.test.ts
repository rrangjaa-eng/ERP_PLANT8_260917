import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { registerPerson } from "@/domain/people";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { listOrgSnapshot } from "@/repositories/org-snapshot";
import { setOrgUnitArchived } from "@/repositories/org-units";
import { setTeamArchived } from "@/repositories/teams";

// Codex P2(PR #90 스레드 r4137164396): 설정 화면은 보관된 부서를 「부서 없음 · 이 단계는 빈 자리로 건너뜀」으로
// 경고하는데, 결재선 해석용 스냅숏은 보관된 팀 · 본부 id를 그대로 실어 그 단계가 계속 그 사람들에게 갔다.
// 스냅숏도 살아 있는 조직만 싣는다 — 보관된 팀이면 팀 · 본부가 null, 보관된 본부면 본부가 null.
async function member(): Promise<{ userId: string; teamId: string; orgUnitId: string }> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `팀-${randomUUID()}` });
  const { userId } = await registerPerson(SYSTEM_VIEWER, { name: "스냅숏대상", email: `${randomUUID()}@test.local`, roleId: DEFAULT_ROLE_ID });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId: team.id, effectiveFrom: "2026-01-01" });
  return { userId, teamId: team.id, orgUnitId: orgUnit.id };
}

async function rowOf(userId: string) {
  return (await listOrgSnapshot(SYSTEM_VIEWER, "2026-09-24")).find((row) => row.id === userId);
}

describe("결재선 스냅숏 — 보관된 조직", () => {
  it("살아 있는 팀 · 본부는 그대로 싣는다", async () => {
    const m = await member();
    expect(await rowOf(m.userId)).toMatchObject({ teamId: m.teamId, orgUnitId: m.orgUnitId });
  });

  it("본부가 보관되면 그 사람의 본부는 null이다(팀은 그대로)", async () => {
    const m = await member();
    await setOrgUnitArchived(SYSTEM_VIEWER, m.orgUnitId, true);
    expect(await rowOf(m.userId)).toMatchObject({ teamId: m.teamId, orgUnitId: null });
  });

  it("팀이 보관되면 그 사람의 팀 · 본부는 null이다", async () => {
    const m = await member();
    await setTeamArchived(SYSTEM_VIEWER, m.teamId, true);
    expect(await rowOf(m.userId)).toMatchObject({ teamId: null, orgUnitId: null });
  });
});
