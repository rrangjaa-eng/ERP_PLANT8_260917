import { randomUUID, randomInt } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { evidenceRecords } from "@/db/schema";
import { createCorpCard } from "@/domain/corp-cards";
import { getEvidenceRecord, listEvidenceRecords } from "@/domain/evidence-records";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { addDays } from "@/lib/kst-date";
import { insertOrgUnit } from "@/repositories/org-units";
import { insertTeam, setTeamArchived } from "@/repositories/teams";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";
import {
  createIntakeViewer,
  createPmInTeam,
  insertLiveLinkFixture,
  registerFixtureFile,
  setRecordArchivedFixture,
  setRecordTypeFixture,
  setRecordVisibilityFixture,
} from "./fixtures/evidence";
import { resetDatabase, skipDbReset } from "./setup";

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
