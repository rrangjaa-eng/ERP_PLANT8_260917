import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createCorpCard, updateCorpCardOwner } from "@/domain/corp-cards";
import { createOrgUnit, createTeam } from "@/domain/org";
import { archive } from "@/domain/archive";

// 재검증(2026-09-21): ROADMAP Phase 3 성공 기준 5는 법인카드를 관리 화면에서
// 「등록·수정·비활성화」하라고 규정하는데 「수정」 진입점이 없었다 —
// updateCorpCardOwnerAction은 정의·registry 등록까지 돼 있고 호출자가 0이었다.
//
// 화면을 붙이기 전에 도메인이 먼저 막아야 한다. 거래처에서 같은 교훈을 얻었다:
// 목록이 보관된 행의 「수정」 링크를 감추는 것만으로는 부족하고,
// ?editId=<보관된 id>를 직접 열면 화면이 수정 모드로 뜨고 저장까지 됐다
// (DOM 감사 실측 → domain/vendors의 ArchivedVendorError).

async function makeTestUser(): Promise<string> {
  const id = `owner-edit-user-${randomUUID()}`;
  await db
    .insert(users)
    .values({ id, name: "카드 소지자", email: `${randomUUID()}@test.local`, roleId: DEFAULT_ROLE_ID });
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

describe("법인카드 소유자 수정 — 보관 차단 (성공 기준 5 「수정」)", () => {
  it("보관된 카드의 소유자는 바꿀 수 없다 — 판정은 화면이 아니라 도메인에서", async () => {
    const holderUserId = await makeTestUser();
    const teamId = await makeTestTeam();
    const dto = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `카드사-${randomUUID()}`,
      numberLast4: uniqueLast4(),
      label: "보관될 카드",
      holderUserId,
    });

    await archive(SYSTEM_VIEWER, "corp_card", dto.id);

    await expect(updateCorpCardOwner(SYSTEM_VIEWER, dto.id, { teamId })).rejects.toThrow();
  });

  it("없는 카드의 소유자 변경도 같은 이유로 거부된다", async () => {
    const teamId = await makeTestTeam();
    await expect(updateCorpCardOwner(SYSTEM_VIEWER, randomUUID(), { teamId })).rejects.toThrow();
  });

  it("보관되지 않은 카드는 그대로 바뀐다(회귀 방어)", async () => {
    const holderUserId = await makeTestUser();
    const teamId = await makeTestTeam();
    const dto = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `카드사-${randomUUID()}`,
      numberLast4: uniqueLast4(),
      label: "정상 카드",
      holderUserId,
    });

    await expect(updateCorpCardOwner(SYSTEM_VIEWER, dto.id, { teamId })).resolves.toBeUndefined();
  });
});
