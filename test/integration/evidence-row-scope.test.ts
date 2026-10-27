import { randomUUID, randomInt } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { evidenceRecords, teamMemberships, users } from "@/db/schema";
import { attachEvidenceAsAuthor } from "@/domain/evidence-records/attach";
import { countEvidencePool, listEvidencePool } from "@/domain/evidence-records/pool";
import { PAYMENT_METHOD_EVIDENCE_PAIRS } from "@/domain/settings/keys";
import { createCorpCard } from "@/domain/corp-cards";
import { getEvidenceRecord, listEvidenceRecords } from "@/domain/evidence-records";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { addDays } from "@/lib/kst-date";
import { insertOrgUnit, setOrgUnitArchived } from "@/repositories/org-units";
import { upsertSimpleValue } from "@/repositories/settings";
import { insertMembership } from "@/repositories/team-memberships";
import { insertTeam, setTeamArchived } from "@/repositories/teams";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";
import { setupExpenseProject } from "./fixtures/expenses";
import {
  createDraftExpenseFixture,
  createIntakeViewer,
  createPmInTeam,
  insertLiveLinkFixture,
  insertRecordFixture,
  registerFixtureFile,
  setRecordArchivedFixture,
  setRecordTypeFixture,
  setRecordVisibilityFixture,
} from "./fixtures/evidence";
import { resetDatabase, skipDbReset } from "./setup";
import { evidenceScopeFor } from "@/domain/permissions/scope-for";
import { can } from "@/domain/permissions/can";
import { createAccount } from "@/domain/auth/accounts";
import { insertRole } from "@/repositories/roles";
import { upsertPermission } from "@/repositories/permissions";
import { findUserById } from "@/repositories/users";

// 06.1-05 Task 2 — 증빙 행 범위 실측(EVID-07 · RP-5). 단언 대상 viewer는 시드 계급 role-pm(오늘 · 미래 발령)과 등록 계급뿐이다 —
// 시스템 관리자 자격으로 재지 않는다(실제 사용자와 같은 자격으로 낮춰서). SYSTEM_VIEWER는 아래 준비(fixture) 줄에만 쓴다.
// 기록 일곱: 미공개 · 팀 A 공개 · 본부(팀 A·B의 본부) 공개 · 팀 A 공개 + 살아 있는 붙임 · 보관 + 팀 A 공개 · 경영관리만 종류(G15) + 팀 A 공개 ·
// 보관된 팀 Z(다른 본부) 공개.

type Matrix = {
  batchId: string;
  ids: { privateRow: string; teamA: string; division: string; attached: string; archived: string; privateType: string; teamZ: string };
  viewers: { pmA: Viewer; pmB: Viewer; pmOther: Viewer; pmNone: Viewer; pmZ: Viewer; pmFuture: Viewer; intake: Viewer };
};

let matrix: Matrix;

// 행렬은 beforeAll에서 한 번 만든다(파일 처음에 한 번 비우고 시드 — 06.2-08 매트릭스 꼴). 테스트는 읽기만 한다.
skipDbReset();

beforeAll(async () => {
  await resetDatabase();
  const stamp = randomUUID().slice(0, 8);
  const division = await insertOrgUnit(SYSTEM_VIEWER, { name: `증빙범위본부-${stamp}` });
  const otherDivision = await insertOrgUnit(SYSTEM_VIEWER, { name: `증빙범위다른본부-${stamp}` });
  const teamA = await insertTeam(SYSTEM_VIEWER, { orgUnitId: division.id, name: `증빙범위A-${stamp}` });
  const teamB = await insertTeam(SYSTEM_VIEWER, { orgUnitId: division.id, name: `증빙범위B-${stamp}` });
  const teamC = await insertTeam(SYSTEM_VIEWER, { orgUnitId: otherDivision.id, name: `증빙범위C-${stamp}` });
  const teamZ = await insertTeam(SYSTEM_VIEWER, { orgUnitId: otherDivision.id, name: `증빙범위Z-${stamp}` });

  const viewers = {
    pmA: await createPmInTeam(teamA.id),
    pmB: await createPmInTeam(teamB.id),
    pmOther: await createPmInTeam(teamC.id),
    pmNone: await createPmInTeam(null),
    pmZ: await createPmInTeam(teamZ.id),
    pmFuture: await createPmInTeam(teamA.id, addDays(seoulToday(), 1)),
    intake: await createIntakeViewer(),
  };
  await setTeamArchived(SYSTEM_VIEWER, teamZ.id, true);

  // 카드를 등록해 둔다 — 카드 미등록 줄은 이 행렬의 갈래가 아니다.
  const last4 = String(randomInt(1000, 10_000));
  await createCorpCard(SYSTEM_VIEWER, { issuer: "롯데카드", numberLast4: last4, label: `롯데 ${last4}`, kind: "shared" });
  const lines = Array.from({ length: 7 }, (_, index) => ({ 카드번호: `999900001111${last4}`, 승인번호: `${last4}${String(index).padStart(4, "0")}` }));
  const result = await registerFixtureFile(viewers.intake, lotteFixture(lines), `범위-${stamp}.xls`);
  // 준비는 표에서 바로 읽는다(재려는 목록 함수에 기대지 않는다).
  const created = await db.select({ id: evidenceRecords.id }).from(evidenceRecords).where(eq(evidenceRecords.batchId, result.batchId)).orderBy(asc(evidenceRecords.approvalNo));
  const [privateRow, teamARow, divisionRow, attached, archived, privateType, teamZRow] = created.map((row) => row.id);
  if (!teamZRow) throw new Error("기록 일곱이 서지 않았다");

  await setRecordVisibilityFixture(teamARow!, { visibility: "team", teamId: teamA.id });
  await setRecordVisibilityFixture(divisionRow!, { visibility: "division", orgUnitId: division.id });
  await setRecordVisibilityFixture(attached!, { visibility: "team", teamId: teamA.id });
  await insertLiveLinkFixture(attached!, viewers.intake.id);
  await setRecordVisibilityFixture(archived!, { visibility: "team", teamId: teamA.id });
  await setRecordArchivedFixture(archived!, viewers.intake.id);
  await setRecordVisibilityFixture(privateType!, { visibility: "team", teamId: teamA.id });
  await setRecordTypeFixture(privateType!, "personal_card_receipt");
  await setRecordVisibilityFixture(teamZRow, { visibility: "team", teamId: teamZ.id });

  matrix = {
    batchId: result.batchId,
    ids: { privateRow: privateRow!, teamA: teamARow!, division: divisionRow!, attached: attached!, archived: archived!, privateType: privateType!, teamZ: teamZRow },
    viewers,
  };
});

async function idsFor(viewer: Viewer, query: Parameters<typeof listEvidenceRecords>[1]): Promise<string[]> {
  const list = await listEvidenceRecords(viewer, query);
  return list.rows.map((row) => row.id ?? "").sort();
}

describe("증빙 행 범위 — 실제 계급(role-pm · 등록 계급)으로 (06.1-05 Task 2 · EVID-07)", () => {
  it("팀 A PM은 팀 A 공개 · 본부 공개 2건만 받는다 — 미공개 · 붙음 · 보관 · 경영관리만 종류 · 다른 팀 줄은 0(RP-15 ⑴)", async () => {
    const { ids, viewers } = matrix;
    expect(await idsFor(viewers.pmA, { state: "all" })).toEqual([ids.teamA, ids.division].sort());
  });

  it("같은 본부 팀 B PM은 본부 공개 1건만 · 다른 본부 PM · 발령 없는 PM · 보관된 팀 Z PM · 미래 발령만 있는 PM은 0건", async () => {
    const { ids, viewers } = matrix;
    expect(await idsFor(viewers.pmB, { state: "all" })).toEqual([ids.division]);
    expect(await idsFor(viewers.pmOther, { state: "all" })).toEqual([]);
    expect(await idsFor(viewers.pmNone, { state: "all" })).toEqual([]);
    expect(await idsFor(viewers.pmZ, { state: "all" })).toEqual([]);
    expect(await idsFor(viewers.pmFuture, { state: "all" })).toEqual([]);
  });

  it("PM은 보관됨 보기도 0건이고, 공개 줄에 대한 제안 · 묶음 정보를 받지 않는다", async () => {
    const { viewers } = matrix;
    expect(await idsFor(viewers.pmA, { state: "archived" })).toEqual([]);
    const list = await listEvidenceRecords(viewers.pmA, { state: "all", batch: matrix.batchId });
    expect(list.proposals).toEqual([]);
    expect(list.batch).toBeNull();
  });

  it("등록 계급은 범위 전체 — 그 묶음의 `전체` 6건 · `보관됨` 1건", async () => {
    const { ids, viewers, batchId } = matrix;
    const all = await idsFor(viewers.intake, { state: "all", batch: batchId });
    expect(all).toEqual([ids.privateRow, ids.teamA, ids.division, ids.attached, ids.privateType, ids.teamZ].sort());
    expect(await idsFor(viewers.intake, { state: "archived", batch: batchId })).toEqual([ids.archived]);
  });

  it("단건도 같은 범위 — 범위 밖 · 붙음 · 보관 · 경영관리만 종류는 PM에게 null, 팀 A 공개 줄은 팀 A PM에게 보인다(대조)", async () => {
    const { ids, viewers } = matrix;
    expect((await getEvidenceRecord(viewers.pmA, ids.teamA))?.id).toBe(ids.teamA);
    expect(await getEvidenceRecord(viewers.pmB, ids.teamA)).toBeNull();
    expect(await getEvidenceRecord(viewers.pmA, ids.attached)).toBeNull();
    expect(await getEvidenceRecord(viewers.pmA, ids.archived)).toBeNull();
    expect(await getEvidenceRecord(viewers.pmA, ids.privateType)).toBeNull();
    expect(await getEvidenceRecord(viewers.pmZ, ids.teamZ)).toBeNull();
  });
});

// 07-15(R18 · T-07-15-03): 증빙 범위는 메뉴 판정(`evidence` 보기)이 먼저다 — 보기 없는 등록 쓰기만으로는 none.
// 「보기 없는 등록 쓰기」 상태는 setPermissionCell로 만들 수 없어(딸린 칸) repository upsertPermission으로 직접 만든다.
describe("증빙 범위 = 메뉴 판정(07-15 R18)", () => {
  async function roleWith(cells: readonly { menu: string; action: "view" | "write" }[]): Promise<Viewer> {
    const roleId = `role-r18-${randomUUID().slice(0, 8)}`;
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: `R18 ${roleId.slice(-8)}` });
    for (const { menu, action } of cells) await upsertPermission(SYSTEM_VIEWER, { roleId, menu, action, allowed: true });
    const { userId } = await createAccount(SYSTEM_VIEWER, { email: `r18-${randomUUID()}@example.test`, name: "R18", roleId });
    return { id: userId, roleId };
  }

  it("등록 쓰기만 → none · 둘 다 → all · 보기만 → published, 메뉴 판정(evidence 보기)과 같다", async () => {
    const intakeOnly = await roleWith([{ menu: "evidence.intake", action: "write" }]);
    const both = await roleWith([
      { menu: "evidence.intake", action: "write" },
      { menu: "evidence", action: "view" },
    ]);
    const viewOnly = await roleWith([{ menu: "evidence", action: "view" }]);

    expect(await evidenceScopeFor(intakeOnly)).toEqual({ rows: "none" });
    expect(await can(intakeOnly, "evidence", "view")).toBe(false);
    expect(await evidenceScopeFor(both)).toEqual({ rows: "all" });
    expect(await can(both, "evidence", "view")).toBe(true);
    expect((await evidenceScopeFor(viewOnly)).rows).toBe("published");
    expect(await can(viewOnly, "evidence", "view")).toBe(true);
  });
});

// 07.1-07(D-7127): 사람의 본부 칸 — 비어도 되는 칸이고 새 사람은 비어 있다(쓰기 길은 07.1-14).
describe("사람의 본부 칸(07.1-07 D-7127)", () => {
  it("새 사람의 divisionId는 null이고 저장소 읽기가 그 칸을 싣는다", async () => {
    const { userId } = await createAccount(SYSTEM_VIEWER, { email: `division-${randomUUID()}@example.test`, name: "본부칸" });
    expect(await findUserById(SYSTEM_VIEWER, userId)).toHaveProperty("divisionId", null);
  });
});

// 07.1-07(D-7122 · C-1 · E-P1-07): 팀 없이 본부에만 속한 사람(role-pm — 증빙 보기 · 등록 쓰기 없음)은 사람의 본부 칸으로 그 본부 공개 증빙을
// 증빙 고르기(작성자 풀 · 풀 건수)에서 본다. 증빙 목록 화면은 등록 쓰기가 있어야 열려 이 사람의 표면이 아니다 — 목록 함수는 같은 범위 SQL의 증명으로만 잰다.
// 칸 쓰기 길은 07.1-14라 픽스처가 users.division_id를 직접 넣는다. 증빙 줄은 정상 공개 줄만(합계 0 이상 · 확인 필요 아님 · 안 붙음 · 문서와 같은 종류).
describe("팀 없는 본부 사람의 증빙 범위(07.1-07 D-7122)", () => {
  type Person = { viewer: Viewer; draftId: string };
  let divisionB: string;
  let divisionB2: string;
  let teamTA: string;
  let rec: { b: string; b2: string; a: string; teamA: string; privateRow: string };
  let people: { main: Person; archived: Person; assigned: Person };

  // 작성 중 지출결의 하나를 기안한 PM을, 오늘 발령 팀이 없고 본부 칸이 divisionId인 사람으로 만든다.
  async function teamlessAuthor(divisionId: string): Promise<Person> {
    const fx = await setupExpenseProject();
    const draftId = await createDraftExpenseFixture(fx);
    await db.delete(teamMemberships).where(eq(teamMemberships.userId, fx.pm.id));
    await db.update(users).set({ divisionId }).where(eq(users.id, fx.pm.id));
    return { viewer: fx.pm, draftId };
  }

  async function publishedRecord(target: Parameters<typeof setRecordVisibilityFixture>[1]): Promise<string> {
    const id = await insertRecordFixture(matrix.viewers.intake);
    await setRecordVisibilityFixture(id, target);
    return id;
  }

  async function poolIds(person: Person): Promise<string[]> {
    const pool = await listEvidencePool(person.viewer, { owner: { kind: "expense", id: person.draftId } });
    return pool.items.map((item) => item.id ?? "").sort();
  }

  async function selectableCount(person: Person): Promise<number> {
    const pool = await listEvidencePool(person.viewer, { owner: { kind: "expense", id: person.draftId } });
    return pool.items.filter((item) => item.selectable).length;
  }

  beforeAll(async () => {
    await upsertSimpleValue(SYSTEM_VIEWER, PAYMENT_METHOD_EVIDENCE_PAIRS.key, [], null);
    const stamp = randomUUID().slice(0, 8);
    divisionB = (await insertOrgUnit(SYSTEM_VIEWER, { name: `팀없는본부B-${stamp}` })).id;
    divisionB2 = (await insertOrgUnit(SYSTEM_VIEWER, { name: `팀없는본부B2-${stamp}` })).id;
    const divisionA = (await insertOrgUnit(SYSTEM_VIEWER, { name: `팀없는본부A-${stamp}` })).id;
    teamTA = (await insertTeam(SYSTEM_VIEWER, { orgUnitId: divisionA, name: `팀없는본부TA-${stamp}` })).id;
    rec = {
      b: await publishedRecord({ visibility: "division", orgUnitId: divisionB }),
      b2: await publishedRecord({ visibility: "division", orgUnitId: divisionB2 }),
      a: await publishedRecord({ visibility: "division", orgUnitId: divisionA }),
      teamA: await publishedRecord({ visibility: "team", teamId: teamTA }),
      privateRow: await insertRecordFixture(matrix.viewers.intake),
    };
    people = { main: await teamlessAuthor(divisionB), archived: await teamlessAuthor(divisionB2), assigned: await teamlessAuthor(divisionB) };
  });

  it("증빙 고르기 풀에 자기 본부 공개 줄만 있고 풀 건수가 고를 수 있는 그 줄 수다 — 다른 본부 · 팀 공개 · 남의 미공개는 없다", async () => {
    const { main } = people;
    expect(await poolIds(main)).toEqual([rec.b]);
    expect(await selectableCount(main)).toBe(1);
    expect(await countEvidencePool(main.viewer, { kind: "expense", id: main.draftId })).toBe(1);
  });

  it("목록 함수(범위 SQL 증명)도 자기 본부 공개 줄만 돌려준다", async () => {
    expect(await idsFor(people.main.viewer, { state: "all" })).toEqual([rec.b]);
  });

  it("본부 칸의 본부를 보관하면 그 본부 공개 줄이 풀 · 풀 건수 · 목록에서 사라진다", async () => {
    const { archived } = people;
    expect(await poolIds(archived)).toEqual([rec.b2]);
    expect(await idsFor(archived.viewer, { state: "all" })).toEqual([rec.b2]);
    await setOrgUnitArchived(SYSTEM_VIEWER, divisionB2, true);
    expect(await poolIds(archived)).toEqual([]);
    expect(await countEvidencePool(archived.viewer, { kind: "expense", id: archived.draftId })).toBe(0);
    expect(await idsFor(archived.viewer, { state: "all" })).toEqual([]);
  });

  it("오늘 팀(다른 본부)을 발령하면 본부 칸을 보지 않고 팀 · 팀의 본부 공개를 본다(팀 우선)", async () => {
    const { assigned } = people;
    expect(await poolIds(assigned)).toEqual([rec.b]);
    await insertMembership(SYSTEM_VIEWER, { userId: assigned.viewer.id, teamId: teamTA, effectiveFrom: seoulToday() });
    expect(await poolIds(assigned)).toEqual([rec.a, rec.teamA].sort());
    expect(await countEvidencePool(assigned.viewer, { kind: "expense", id: assigned.draftId })).toBe(2);
    expect(await idsFor(assigned.viewer, { state: "all" })).toEqual([rec.a, rec.teamA].sort());
  });

  // PR #303 검토 P2-1: 넓어진 범위가 작성자 붙이기(attachEvidenceAsAuthor → preReadRecords → listEvidenceRecordsByIds)에도 쓰인다.
  it("작성자 붙이기 — 자기 본부 공개 증빙은 붙고 다른 본부 공개 증빙은 없는 증빙 거부다", async () => {
    const author = await teamlessAuthor(divisionB);
    const own = await publishedRecord({ visibility: "division", orgUnitId: divisionB });
    const owner = { kind: "expense" as const, id: author.draftId };
    const refused = await attachEvidenceAsAuthor(author.viewer, { evidenceIds: [rec.a], owner }).then(
      () => "붙었다",
      (error: unknown) => (error instanceof Error ? error.message : "알 수 없는 거부"),
    );
    expect(refused).toBe("없는 증빙 · 새로 고침");
    expect(await attachEvidenceAsAuthor(author.viewer, { evidenceIds: [own], owner })).toEqual({ attached: 1 });
  });
});
