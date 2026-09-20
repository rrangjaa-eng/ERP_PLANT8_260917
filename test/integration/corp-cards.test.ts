import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { users, corpCards } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import {
  listCorpCards,
  createCorpCard,
  updateCorpCardOwner,
  setCorpCardActive,
  InvalidCardOwnerError,
  ForbiddenError,
} from "@/domain/corp-cards";
import { createOrgUnit, createTeam } from "@/domain/org";
import { archive, restore } from "@/domain/archive";
import { listCorpCards as repoListCorpCards } from "@/repositories/corp-cards";

async function makeTestUser(): Promise<string> {
  const id = `card-user-${randomUUID()}`;
  await db.insert(users).values({ id, name: "카드 소지자", email: `${randomUUID()}@test.local`, roleId: DEFAULT_ROLE_ID });
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

describe("corp-cards (MAST-03, 실제 Postgres)", () => {
  it("같은 발급사·같은 뒤 4자리로 두 번 등록하면 두 번째가 거부된다(복합 UNIQUE)", async () => {
    const holderUserId = await makeTestUser();
    const issuer = `카드사-${randomUUID()}`;
    const numberLast4 = uniqueLast4();
    await createCorpCard(SYSTEM_VIEWER, { issuer, numberLast4, label: "1호", holderUserId });
    await expect(
      createCorpCard(SYSTEM_VIEWER, { issuer, numberLast4, label: "2호", holderUserId }),
    ).rejects.toThrow();
  });

  it("소지자만 지정하면 등록에 성공한다", async () => {
    const holderUserId = await makeTestUser();
    const dto = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `카드사-${randomUUID()}`,
      numberLast4: uniqueLast4(),
      label: "개인카드",
      holderUserId,
    });
    expect(dto.kind).toBe("personal");
    expect(dto.holderUserId).toBe(holderUserId);
    expect(dto.teamId).toBeNull();
  });

  it("팀만 지정하면 등록에 성공한다", async () => {
    const teamId = await makeTestTeam();
    const dto = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `카드사-${randomUUID()}`,
      numberLast4: uniqueLast4(),
      label: "팀카드",
      teamId,
    });
    expect(dto.kind).toBe("team");
    expect(dto.teamId).toBe(teamId);
    expect(dto.holderUserId).toBeNull();
  });

  it("소지자와 팀을 동시에 지정하면 거부된다", async () => {
    const holderUserId = await makeTestUser();
    const teamId = await makeTestTeam();
    await expect(
      createCorpCard(SYSTEM_VIEWER, {
        issuer: `카드사-${randomUUID()}`,
        numberLast4: uniqueLast4(),
        label: "둘다",
        holderUserId,
        teamId,
      }),
    ).rejects.toBeInstanceOf(InvalidCardOwnerError);
  });

  it("소지자도 팀도 지정하지 않으면 거부된다", async () => {
    await expect(
      createCorpCard(SYSTEM_VIEWER, {
        issuer: `카드사-${randomUUID()}`,
        numberLast4: uniqueLast4(),
        label: "없음",
      }),
    ).rejects.toBeInstanceOf(InvalidCardOwnerError);
  });

  it("소유자 변경이 반대 칸을 비운다 — 소지자와 팀이 동시에 채워진 행이 생기지 않는다", async () => {
    const holderUserId = await makeTestUser();
    const teamId = await makeTestTeam();
    const dto = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `카드사-${randomUUID()}`,
      numberLast4: uniqueLast4(),
      label: "변경대상",
      holderUserId,
    });

    await updateCorpCardOwner(SYSTEM_VIEWER, dto.id, { teamId });

    const list = await listCorpCards(SYSTEM_VIEWER);
    const updated = list.find((c) => c.id === dto.id);
    expect(updated?.teamId).toBe(teamId);
    expect(updated?.holderUserId).toBeNull();
  });

  it("전체 카드 번호 컬럼이 존재하지 않는다", () => {
    expect("cardNumber" in corpCards).toBe(false);
    expect("fullNumber" in corpCards).toBe(false);
  });

  it("비활성 카드가 기본 목록에서 빠지고 포함 옵션에서 보인다", async () => {
    const holderUserId = await makeTestUser();
    const dto = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `카드사-${randomUUID()}`,
      numberLast4: uniqueLast4(),
      label: "비활성대상",
      holderUserId,
    });
    await setCorpCardActive(SYSTEM_VIEWER, dto.id, false);

    const withoutInactive = await listCorpCards(SYSTEM_VIEWER);
    expect(withoutInactive.some((c) => c.id === dto.id)).toBe(false);

    const withInactive = await listCorpCards(SYSTEM_VIEWER, { includeInactive: true });
    expect(withInactive.some((c) => c.id === dto.id)).toBe(true);
  });

  it("보관 후 보관 제외 서술자 조회에서 빠지고 복원하면 다시 보인다", async () => {
    const holderUserId = await makeTestUser();
    const dto = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `카드사-${randomUUID()}`,
      numberLast4: uniqueLast4(),
      label: "보관대상",
      holderUserId,
    });
    await archive(SYSTEM_VIEWER, "corp_card", dto.id);

    const excluded = await repoListCorpCards(SYSTEM_VIEWER, {
      scope: { rows: "all", includeArchived: false },
      includeInactive: true,
    });
    expect(excluded.some((c) => c.id === dto.id)).toBe(false);

    const included = await repoListCorpCards(SYSTEM_VIEWER, {
      scope: { rows: "all", includeArchived: true },
      includeInactive: true,
    });
    expect(included.some((c) => c.id === dto.id)).toBe(true);

    await restore(SYSTEM_VIEWER, "corp_card", dto.id);
    const restored = await listCorpCards(SYSTEM_VIEWER);
    expect(restored.some((c) => c.id === dto.id)).toBe(true);
  });

  it("법인카드 메뉴 쓰기 권한이 없는 계급은 카드를 등록할 수 없다", async () => {
    const pmViewer = { id: "card-pm-tester", roleId: DEFAULT_ROLE_ID };
    await expect(
      createCorpCard(pmViewer, {
        issuer: `카드사-${randomUUID()}`,
        numberLast4: uniqueLast4(),
        label: "거부",
        holderUserId: await makeTestUser(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
