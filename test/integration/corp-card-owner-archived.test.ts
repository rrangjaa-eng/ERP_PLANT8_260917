import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createCorpCard, updateCorpCardOwner } from "@/domain/corp-cards";
import { createOrgUnit, createTeam } from "@/domain/org";
import { archive } from "@/domain/archive";

// /cso T-03-55: 법인카드 소유자 변경이 새 소유자의 보관 여부를 보지 않는다.
// FK(corp_cards_holder_user_id_users_id_fk · corp_cards_team_id_teams_id_fk)는
// 존재하지 않는 id만 막고 보관된 id는 통과시킨다 — T-03-30(계급 변경이
// 보관된 계급을 통과)과 구조가 정확히 같다.
//
// 공격이 아니라 일상 실수다: 화면의 소지자·팀 <select>가 listPeople/listTeams를
// archivedAt 필터 없이 쓰므로, 보관함 보기 권한이 있는 시드 sysadmin에게는
// 퇴사자·해체된 팀이 활성 항목과 구분 없이 보인다. 그 값을 Phase 4·6의
// 비용 귀속이 읽는다.
//
// 같은 코드베이스에 선례가 있다 — registerPerson은 role.archivedAt과
// team.archivedAt을 둘 다 검사한다(domain/people/index.ts:145,155).

async function makeTestUser(): Promise<string> {
  const id = `archived-owner-${randomUUID()}`;
  await db
    .insert(users)
    .values({ id, name: "소지자", email: `${randomUUID()}@test.local`, roleId: DEFAULT_ROLE_ID });
  return id;
}

async function makeTestTeam(): Promise<string> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `팀-${randomUUID()}` });
  return team.id;
}

function uniqueLast4(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

describe("법인카드 소유자는 보관되지 않은 사람·팀이어야 한다 (T-03-55)", () => {
  it("보관된 사람을 새 소지자로 지정할 수 없다", async () => {
    const holderUserId = await makeTestUser();
    const retiring = await makeTestUser();
    const dto = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `카드사-${randomUUID()}`,
      numberLast4: uniqueLast4(),
      label: "소지자 교체 대상",
      holderUserId,
    });

    await archive(SYSTEM_VIEWER, "user", retiring);

    await expect(
      updateCorpCardOwner(SYSTEM_VIEWER, dto.id, { holderUserId: retiring }),
    ).rejects.toThrow();
  });

  it("보관된 팀을 새 소유 팀으로 지정할 수 없다", async () => {
    const holderUserId = await makeTestUser();
    const disbanding = await makeTestTeam();
    const dto = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `카드사-${randomUUID()}`,
      numberLast4: uniqueLast4(),
      label: "팀 교체 대상",
      holderUserId,
    });

    await archive(SYSTEM_VIEWER, "team", disbanding);

    await expect(updateCorpCardOwner(SYSTEM_VIEWER, dto.id, { teamId: disbanding })).rejects.toThrow();
  });

  it("등록 경로에도 같은 검사가 있다 — 보관된 사람으로 새 카드를 만들 수 없다", async () => {
    const retiring = await makeTestUser();
    await archive(SYSTEM_VIEWER, "user", retiring);

    await expect(
      createCorpCard(SYSTEM_VIEWER, {
        issuer: `카드사-${randomUUID()}`,
        numberLast4: uniqueLast4(),
        label: "보관된 소지자",
        holderUserId: retiring,
      }),
    ).rejects.toThrow();
  });

  it("보관되지 않은 사람·팀은 그대로 지정된다 (회귀 방어)", async () => {
    const holderUserId = await makeTestUser();
    const teamId = await makeTestTeam();
    const dto = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `카드사-${randomUUID()}`,
      numberLast4: uniqueLast4(),
      label: "정상 교체",
      holderUserId,
    });

    await expect(updateCorpCardOwner(SYSTEM_VIEWER, dto.id, { teamId })).resolves.toBeUndefined();
  });
});
