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
  ArchivedCardOwnerError,
  ForbiddenError,
  DuplicateCorpCardError,
} from "@/domain/corp-cards";
import { createOrgUnit, createTeam } from "@/domain/org";
import { archive, restore } from "@/domain/archive";
import { listCorpCards as repoListCorpCards } from "@/repositories/corp-cards";
import { queryActionLog } from "@/repositories/action-log";
import { isCheckViolation } from "@/lib/pg-errors";

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
    await createCorpCard(SYSTEM_VIEWER, { issuer, numberLast4, label: "1호", kind: "personal", holderUserId });
    await expect(
      createCorpCard(SYSTEM_VIEWER, { issuer, numberLast4, label: "2호", kind: "personal", holderUserId }),
    ).rejects.toThrow();
  });

  // defect 1 구체적 수정: 예전에는 이 경로가 drizzle의 DrizzleQueryError.message를
  // 그대로 던져 "Failed query: insert into ... params: ..., <내부 user id>, ..."가
  // 화면까지 샜다(회귀 재현). 이제 특정 unique 제약 위반을 UserFacingError
  // 하위 클래스로 바꿔치기해 운영자가 읽을 수 있는 문장만 나간다.
  it("중복 등록 시 원시 SQL이 아니라 DuplicateCorpCardError와 사람이 읽는 문장을 던진다", async () => {
    const holderUserId = await makeTestUser();
    const issuer = `카드사-${randomUUID()}`;
    const numberLast4 = uniqueLast4();
    await createCorpCard(SYSTEM_VIEWER, { issuer, numberLast4, label: "1호", kind: "personal", holderUserId });

    await expect(
      createCorpCard(SYSTEM_VIEWER, { issuer, numberLast4, label: "2호", kind: "personal", holderUserId }),
    ).rejects.toThrow(DuplicateCorpCardError);

    try {
      await createCorpCard(SYSTEM_VIEWER, { issuer, numberLast4, label: "3호", kind: "personal", holderUserId });
      throw new Error("test setup 오류: 실패해야 할 등록이 성공했다");
    } catch (e) {
      expect(e).toBeInstanceOf(DuplicateCorpCardError);
      const message = (e as Error).message;
      expect(message).toBe("이미 등록된 카드 · 발급사와 뒤 4자리 확인");
      expect(message).not.toContain("insert into");
      expect(message).not.toContain("params:");
      expect(message).not.toContain(holderUserId);
    }
  });

  it("소지자만 지정하면 등록에 성공한다", async () => {
    const holderUserId = await makeTestUser();
    const dto = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `카드사-${randomUUID()}`,
      numberLast4: uniqueLast4(),
      label: "개인카드",
      kind: "personal",
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
      kind: "team",
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
        kind: "personal",
        holderUserId,
        teamId,
      }),
    ).rejects.toBeInstanceOf(InvalidCardOwnerError);
  });

  // 06-30: 「둘 다 없음」은 이제 공용으로 정당하다 — 거부되는 것은 고른 종류(개인)에 맞는 칸이 빈 누락 입력이다.
  it("종류 개인인데 소지자 없음이면 거부된다 — 누락 입력이 공용으로 떨어지지 않는다", async () => {
    await expect(
      createCorpCard(SYSTEM_VIEWER, {
        issuer: `카드사-${randomUUID()}`,
        numberLast4: uniqueLast4(),
        label: "없음",
        kind: "personal",
      }),
    ).rejects.toBeInstanceOf(InvalidCardOwnerError);
  });

  // 06-30(Q5 · C8): 공용 카드 — 소지자 · 팀이 없는 카드. 종류는 사람이 고른 값이다.
  it("종류 공용이면 소지자 · 팀 없이 등록되고 kind = shared다", async () => {
    const dto = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `카드사-${randomUUID()}`,
      numberLast4: uniqueLast4(),
      label: "공용카드",
      kind: "shared",
    });
    expect(dto.kind).toBe("shared");
    expect(dto.holderUserId).toBeNull();
    expect(dto.teamId).toBeNull();
  });

  it("위조 입력(종류 공용 + 소지자 · 팀)은 도메인이 먼저 거부한다", async () => {
    const holderUserId = await makeTestUser();
    const teamId = await makeTestTeam();
    await expect(
      createCorpCard(SYSTEM_VIEWER, {
        issuer: `카드사-${randomUUID()}`,
        numberLast4: uniqueLast4(),
        label: "위조공용",
        kind: "shared",
        holderUserId,
        teamId,
      }),
    ).rejects.toBeInstanceOf(InvalidCardOwnerError);
  });

  // 06-30 검토 P3-3 — 빈 문자열 소유 칸은 「없음」이다. 판정과 저장이 같은 값을 봐야 DB CHECK(23514)가 500으로 새지 않는다.
  it("종류 공용 + 빈 문자열 소지자 · 팀은 null로 정규화돼 등록된다(500 아님)", async () => {
    const dto = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `카드사-${randomUUID()}`,
      numberLast4: uniqueLast4(),
      label: "공용빈칸",
      kind: "shared",
      holderUserId: "",
      teamId: "",
    });
    expect(dto.kind).toBe("shared");
    expect(dto.holderUserId).toBeNull();
    expect(dto.teamId).toBeNull();
  });

  it("종류 개인 + 빈 문자열 팀은 소지자만 저장되고 팀은 null이다", async () => {
    const holderUserId = await makeTestUser();
    const dto = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `카드사-${randomUUID()}`,
      numberLast4: uniqueLast4(),
      label: "개인빈팀",
      kind: "personal",
      holderUserId,
      teamId: "",
    });
    expect(dto.holderUserId).toBe(holderUserId);
    expect(dto.teamId).toBeNull();
  });

  it("소유자 변경 → 공용 + 빈 문자열 칸도 null로 정규화돼 저장된다", async () => {
    const holderUserId = await makeTestUser();
    const dto = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `카드사-${randomUUID()}`,
      numberLast4: uniqueLast4(),
      label: "변경빈칸",
      kind: "personal",
      holderUserId,
    });
    await updateCorpCardOwner(SYSTEM_VIEWER, dto.id, { kind: "shared", holderUserId: "", teamId: "" });
    const updated = (await listCorpCards(SYSTEM_VIEWER)).find((c) => c.id === dto.id);
    expect(updated?.kind).toBe("shared");
    expect(updated?.holderUserId).toBeNull();
    expect(updated?.teamId).toBeNull();
  });

  it("소유자 변경 개인 → 공용: 소지자가 비고 kind = shared, document_update 한 줄 · document_create 없음", async () => {
    const holderUserId = await makeTestUser();
    const dto = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `카드사-${randomUUID()}`,
      numberLast4: uniqueLast4(),
      label: "개인→공용",
      kind: "personal",
      holderUserId,
    });

    const createRowsBefore = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_create" });
    await updateCorpCardOwner(SYSTEM_VIEWER, dto.id, { kind: "shared" });
    const createRowsAfter = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_create" });
    const updateRows = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_update" });

    const updated = (await listCorpCards(SYSTEM_VIEWER)).find((c) => c.id === dto.id);
    expect(updated?.kind).toBe("shared");
    expect(updated?.holderUserId).toBeNull();
    expect(updated?.teamId).toBeNull();
    expect(createRowsAfter.length).toBe(createRowsBefore.length);
    expect(updateRows.filter((row) => row.entityId === dto.id)).toHaveLength(1);
  });

  it("소유자 변경 공용 → 팀: 팀이 채워지고 kind = team", async () => {
    const teamId = await makeTestTeam();
    const dto = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `카드사-${randomUUID()}`,
      numberLast4: uniqueLast4(),
      label: "공용→팀",
      kind: "shared",
    });

    await updateCorpCardOwner(SYSTEM_VIEWER, dto.id, { kind: "team", teamId });

    const updated = (await listCorpCards(SYSTEM_VIEWER)).find((c) => c.id === dto.id);
    expect(updated?.kind).toBe("team");
    expect(updated?.teamId).toBe(teamId);
    expect(updated?.holderUserId).toBeNull();
  });

  it("소유자 변경 공용 → 보관된 사람은 ArchivedCardOwnerError다(기존 보관 검사 그대로)", async () => {
    const retiring = await makeTestUser();
    const dto = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `카드사-${randomUUID()}`,
      numberLast4: uniqueLast4(),
      label: "공용→퇴사자",
      kind: "shared",
    });
    await archive(SYSTEM_VIEWER, "user", retiring);

    await expect(
      updateCorpCardOwner(SYSTEM_VIEWER, dto.id, { kind: "personal", holderUserId: retiring }),
    ).rejects.toBeInstanceOf(ArchivedCardOwnerError);
    const unchanged = (await listCorpCards(SYSTEM_VIEWER)).find((c) => c.id === dto.id);
    expect(unchanged?.kind).toBe("shared");
  });

  // E-15 · R-6: 도메인 표와 06-27 DB CHECK가 같은 세 조합이다 — 도메인을 거치지 않은 행도 DB가 한 번 더 거부한다.
  // drizzle 0.45는 pg 오류를 .cause에 감싼다(E-42) — isCheckViolation이 오류와 .cause를 함께 본다.
  it.each([
    ["소지자 · 팀 둘 다 붙은 행", "personal", true, true],
    ["kind shared + 소지자 행", "shared", true, false],
  ] as const)("도메인을 거치지 않은 %s은 23514 corp_cards_owner_kind_check로 거부된다", async (_name, kind, withHolder, withTeam) => {
    const holderUserId = withHolder ? await makeTestUser() : null;
    const teamId = withTeam ? await makeTestTeam() : null;
    const error = await db
      .insert(corpCards)
      .values({ issuer: `카드사-${randomUUID()}`, numberLast4: uniqueLast4(), label: "DB직접", kind, holderUserId, teamId })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(isCheckViolation(error, "corp_cards_owner_kind_check")).toBe(true);
  });

  it("소유자 변경이 반대 칸을 비운다 — 소지자와 팀이 동시에 채워진 행이 생기지 않는다", async () => {
    const holderUserId = await makeTestUser();
    const teamId = await makeTestTeam();
    const dto = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `카드사-${randomUUID()}`,
      numberLast4: uniqueLast4(),
      label: "변경대상",
      kind: "personal",
      holderUserId,
    });

    await updateCorpCardOwner(SYSTEM_VIEWER, dto.id, { kind: "team", teamId });

    const list = await listCorpCards(SYSTEM_VIEWER);
    const updated = list.find((c) => c.id === dto.id);
    expect(updated?.teamId).toBe(teamId);
    expect(updated?.holderUserId).toBeNull();
    // kind도 같이 옮겨가야 한다 — 화면이 kind로 개인/팀을 갈라 그리므로
    // 여기가 'personal'로 남으면 종류 "개인" · 소유 "—"로 표시된다.
    expect(updated?.kind).toBe("team");
  });

  // 결함 3: updateCorpCardOwner도 vendors의 updateVendor와 같은 결함(document_create
  // 재사용)이 있었다 — 소유자 변경은 수정이지 생성이 아니다.
  it("소유자 변경은 document_update로 기록되고 document_create를 남기지 않는다(결함 3)", async () => {
    const holderUserId = await makeTestUser();
    const teamId = await makeTestTeam();
    const dto = await createCorpCard(SYSTEM_VIEWER, {
      issuer: `카드사-${randomUUID()}`,
      numberLast4: uniqueLast4(),
      label: "결함3대상",
      kind: "personal",
      holderUserId,
    });

    const createRowsBefore = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_create" });

    await updateCorpCardOwner(SYSTEM_VIEWER, dto.id, { kind: "team", teamId });

    const createRowsAfter = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_create" });
    const updateRows = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_update" });

    expect(createRowsAfter.length).toBe(createRowsBefore.length);
    expect(updateRows.some((row) => row.entityId === dto.id)).toBe(true);
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
      kind: "personal",
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
      kind: "personal",
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
        kind: "personal",
        holderUserId: await makeTestUser(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
