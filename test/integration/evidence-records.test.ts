import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, evidenceRecords, orgUnits, teams } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { createCorpCard, type CardOwnerKind } from "@/domain/corp-cards";
import { EVIDENCE_IMPORT_MAX_ROWS } from "@/domain/evidence-import/limits";
import {
  archiveEvidenceRecord,
  countTodoEvidence,
  getEvidenceBatch,
  getEvidenceRecord,
  listEvidenceRecords,
  listEvidenceRecordsByIds,
  publishEvidenceRecords,
  restoreEvidenceRecord,
  type EvidencePublishGroup,
  type EvidenceRecordList,
} from "@/domain/evidence-records";
import { ForbiddenError } from "@/domain/permissions/can";
import { SaveRejectedError } from "@/domain/quotes/lines";
import { EVIDENCE_VISIBILITY_DIVISION_ORG_UNIT } from "@/domain/settings/keys";
import { getSettingValue, setSettingValue } from "@/domain/settings/registry";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { withTransaction } from "@/lib/db-transaction";
import { MAX_ACTION_PAYLOAD_BYTES } from "@/lib/actions/payload-size";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { seoulToday } from "@/lib/dates";
import * as evidenceRecordsRepo from "@/repositories/evidence-records";
import { upsertVisibility } from "@/repositories/permissions";
import { insertMembership } from "@/repositories/team-memberships";
import { insertOrgUnit } from "@/repositories/org-units";
import { insertTeam, setTeamArchived } from "@/repositories/teams";
import { bcFixture, hometaxTaxInvoiceFixture, lotteFixture, type FixtureRow } from "@/test/fixtures/evidence-import/build";
import {
  createIntakeViewer,
  insertLiveLinkFixture,
  registerFixtureFile,
  setRecordArchivedFixture,
  setRecordTypeFixture,
  setRecordVisibilityFixture,
} from "./fixtures/evidence";

// 06.1-05: 증빙 기록 목록 · 제안 · 공개 범위 저장(실제 Postgres). 픽스처 카드 번호는 06.1-02 생성기 꼴 `999900001111{끝 4자리}`,
// 롯데 한 줄 = 204,100원 · 부가세 18,554원(공급가 185,546원) · 매입일 2026-04-30.

async function teamIdByName(name: string): Promise<string> {
  const [row] = await db.select({ id: teams.id }).from(teams).where(eq(teams.name, name));
  if (!row) throw new Error(`팀 없음: ${name}`);
  return row.id;
}

async function orgUnitIdByName(name: string): Promise<string> {
  const [row] = await db.select({ id: orgUnits.id }).from(orgUnits).where(eq(orgUnits.name, name));
  if (!row) throw new Error(`본부 없음: ${name}`);
  return row.id;
}

async function addLotteCard(last4: string, owner: { kind: CardOwnerKind; teamId?: string; holderUserId?: string }): Promise<string> {
  const card = await createCorpCard(SYSTEM_VIEWER, { issuer: "롯데카드", numberLast4: last4, label: `롯데 ${last4}`, ...owner });
  return card.id;
}

function lotteLines(last4: string, approvals: readonly string[], patch: Partial<Record<string, string>> = {}): FixtureRow[] {
  return approvals.map((approval) => ({ 카드번호: `999900001111${last4}`, 승인번호: approval, ...patch }));
}

async function personViewer(roleId: string): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `evidence-${randomUUID()}@example.test`, name: "증빙 테스트", roleId });
  return { id: userId, roleId };
}

async function storedRows(ids: readonly string[]) {
  return db.select().from(evidenceRecords).where(inArray(evidenceRecords.id, [...ids]));
}

// 제안을 그대로 묶음 꼴 요청으로 — 화면이 보내는 꼴(공개 값 · 팀마다 한 묶음).
function groupsOf(list: EvidenceRecordList): EvidencePublishGroup[] {
  const groups = new Map<string, EvidencePublishGroup>();
  for (const proposal of list.proposals) {
    const key = `${proposal.visibility}:${proposal.teamId ?? ""}`;
    const group = groups.get(key) ?? { visibility: proposal.visibility, ...(proposal.teamId ? { teamId: proposal.teamId } : {}), items: [] };
    group.items.push([proposal.id, proposal.version]);
    groups.set(key, group);
  }
  return [...groups.values()];
}

async function rejection(promise: Promise<unknown>): Promise<SaveRejectedError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(SaveRejectedError);
  return error as SaveRejectedError;
}

describe("domain/evidence-records — 트레이서: 등록 → 제안 → 공개 범위 저장 (06.1-05 Task 1)", () => {
  it("시드가 증빙 본부 공개 대상을 기획본부로 둔다(C3)", async () => {
    expect(await getSettingValue(EVIDENCE_VISIBILITY_DIVISION_ORG_UNIT)).toBe(await orgUnitIdByName("기획본부"));
  });

  it("롯데 3줄 등록 뒤 목록 — 미공개 3줄 · 파일 금액 · 끝 4자리 카드 · 제안(팀 카드 → 그 팀, 공용 카드 → 설정 본부)", async () => {
    const intake = await createIntakeViewer();
    const team = await teamIdByName("기획1팀");
    await addLotteCard("5101", { kind: "team", teamId: team });
    await addLotteCard("5102", { kind: "shared" });
    await registerFixtureFile(intake, lotteFixture([...lotteLines("5101", ["51010001", "51010002"]), ...lotteLines("5102", ["51020001"])]), "롯데.xls");

    const list = await listEvidenceRecords(intake);

    expect(list.rows).toHaveLength(3);
    for (const row of list.rows) {
      expect(row).toMatchObject({ statusWord: "미공개", supplyKrw: 185_546, vatKrw: 18_554, totalKrw: 204_100, formatLabel: "롯데카드 매입내역" });
      expect(row.cardLabel).toMatch(/^롯데 510[12]$/);
    }
    expect(list.division).toEqual({ id: await orgUnitIdByName("기획본부"), name: "기획본부" });
    const byCard = new Map(list.rows.map((row) => [row.id, row.cardLabel]));
    expect(list.proposals).toHaveLength(3);
    for (const proposal of list.proposals) {
      const row = list.rows.find((one) => one.id === proposal.id);
      expect(proposal.version).toBe(row?.version);
      if (byCard.get(proposal.id) === "롯데 5101") expect(proposal).toMatchObject({ visibility: "team", teamId: team, label: "기획1팀 공개" });
      else expect(proposal).toEqual({ id: proposal.id, version: proposal.version, visibility: "division", label: "기획본부 공개" });
    }
  });

  it("소지자 카드 줄은 소지자의 오늘 발령 팀을, 발령이 없으면 설정 본부를 제안한다", async () => {
    const intake = await createIntakeViewer();
    const team = await teamIdByName("기획1팀");
    const holder = await personViewer("role-pm");
    const loner = await personViewer("role-pm");
    await insertMembership(SYSTEM_VIEWER, { userId: holder.id, teamId: team, effectiveFrom: seoulToday() });
    await addLotteCard("5201", { kind: "personal", holderUserId: holder.id });
    await addLotteCard("5202", { kind: "personal", holderUserId: loner.id });
    await registerFixtureFile(intake, lotteFixture([...lotteLines("5201", ["52010001"]), ...lotteLines("5202", ["52020001"])]), "롯데.xls");

    const list = await listEvidenceRecords(intake);
    const labelOf = (cardLabel: string) => list.proposals.find((proposal) => list.rows.find((row) => row.id === proposal.id)?.cardLabel === cardLabel);

    expect(labelOf("롯데 5201")).toMatchObject({ visibility: "team", teamId: team, label: "기획1팀 공개" });
    expect(labelOf("롯데 5202")).toMatchObject({ visibility: "division", label: "기획본부 공개" });
  });

  it("묶음 꼴 저장 — version + 1 · visibility_saved_at(미공개 저장도) · 본부 id = 설정 값 · 저장한 줄은 다시 제안되지 않는다(C1)", async () => {
    const intake = await createIntakeViewer();
    const team = await teamIdByName("기획1팀");
    await addLotteCard("5301", { kind: "team", teamId: team });
    await addLotteCard("5302", { kind: "shared" });
    await registerFixtureFile(intake, lotteFixture([...lotteLines("5301", ["53010001"]), ...lotteLines("5302", ["53020001", "53020002"])]), "롯데.xls");
    const before = await listEvidenceRecords(intake);
    const [kept, ...rest] = before.proposals.filter((proposal) => proposal.visibility === "division");
    if (!kept) throw new Error("본부 제안 없음");
    // 본부 제안 하나는 사람이 「미공개」로 바꿔 저장한 꼴.
    const groups = [...groupsOf({ ...before, proposals: before.proposals.filter((proposal) => proposal.id !== kept.id) }), { visibility: "private" as const, items: [[kept.id, kept.version] as const] }];

    const result = await publishEvidenceRecords(intake, { groups });

    expect(result.saved).toBe(3);
    expect(result.savedAt).toMatch(/^\d{2}:\d{2}$/);
    const stored = await storedRows(before.rows.map((row) => row.id ?? ""));
    const division = await getSettingValue(EVIDENCE_VISIBILITY_DIVISION_ORG_UNIT);
    for (const row of stored) {
      expect(row.version).toBe(2);
      expect(row.visibilitySavedAt).toBeInstanceOf(Date);
      if (row.id === kept.id) expect(row).toMatchObject({ visibility: "private", visibleTeamId: null, visibleOrgUnitId: null });
      else if (rest.some((one) => one.id === row.id)) expect(row).toMatchObject({ visibility: "division", visibleOrgUnitId: division, visibleTeamId: null });
      else expect(row).toMatchObject({ visibility: "team", visibleTeamId: team, visibleOrgUnitId: null });
    }
    expect((await listEvidenceRecords(intake)).proposals).toEqual([]);
    expect(await getEvidenceRecord(intake, kept.id)).toMatchObject({ statusWord: "미공개", statusDetail: null, visibilityLabel: "미공개" });
    const teamRow = stored.find((row) => row.visibility === "team");
    expect(await getEvidenceRecord(intake, teamRow?.id ?? "")).toMatchObject({ statusWord: "팀 공개", statusDetail: "기획1팀", visibilityLabel: "기획1팀 공개" });
    expect(await getEvidenceRecord(intake, rest[0]?.id ?? "")).toMatchObject({ statusWord: "본부 공개", visibilityLabel: "기획본부 공개" });
  });

  it("낡은 version 한 줄이 섞이면 저장 0줄 · 그 줄 오류 칸 하나(전부-아니면-전무)", async () => {
    const intake = await createIntakeViewer();
    await addLotteCard("5401", { kind: "shared" });
    await registerFixtureFile(intake, lotteFixture(lotteLines("5401", ["54010001", "54010002", "54010003"])), "롯데.xls");
    const list = await listEvidenceRecords(intake);
    const [stale] = list.proposals;
    if (!stale) throw new Error("제안 없음");
    await db.update(evidenceRecords).set({ version: sql`${evidenceRecords.version} + 1` }).where(eq(evidenceRecords.id, stale.id));

    const error = await rejection(publishEvidenceRecords(intake, { groups: groupsOf(list) }));

    expect(error.summary).toBe("오류 1칸 · 전부 거부");
    expect(error.formatErrors).toEqual([expect.objectContaining({ rowId: stale.id, field: "visibility" })]);
    const stored = await storedRows(list.rows.map((row) => row.id ?? ""));
    expect(stored.every((row) => row.visibility === "private" && row.visibilitySavedAt === null)).toBe(true);
  });

  it("증빙 등록 쓰기 권한이 없는 계급(기획 PM)은 저장할 수 없다", async () => {
    const intake = await createIntakeViewer();
    await addLotteCard("5501", { kind: "shared" });
    await registerFixtureFile(intake, lotteFixture(lotteLines("5501", ["55010001"])), "롯데.xls");
    const list = await listEvidenceRecords(intake);
    const pm = await personViewer("role-pm");

    await expect(publishEvidenceRecords(pm, { groups: groupsOf(list) })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await storedRows(list.rows.map((row) => row.id ?? "")))[0]?.visibilitySavedAt).toBeNull();
  });

  it("설정을 다른 본부로 바꾸면 그 뒤 저장만 새 본부 — 앞서 저장한 줄은 저장 당시 본부 이름이 2행에 남는다(DA-11)", async () => {
    const intake = await createIntakeViewer();
    await addLotteCard("5601", { kind: "shared" });
    await registerFixtureFile(intake, lotteFixture(lotteLines("5601", ["56010001", "56010002"])), "롯데.xls");
    const list = await listEvidenceRecords(intake);
    const [first, second] = list.proposals;
    if (!first || !second) throw new Error("제안 둘 없음");
    await publishEvidenceRecords(intake, { groups: [{ visibility: "division", items: [[first.id, first.version]] }] });
    const other = await insertOrgUnit(SYSTEM_VIEWER, { name: `새 본부 ${randomUUID().slice(0, 4)}` });
    await setSettingValue(SYSTEM_VIEWER, EVIDENCE_VISIBILITY_DIVISION_ORG_UNIT, other.id);

    const after = await listEvidenceRecords(intake);
    expect(after.proposals).toEqual([expect.objectContaining({ id: second.id, visibility: "division", label: `${other.name} 공개` })]);
    await publishEvidenceRecords(intake, { groups: [{ visibility: "division", items: [[second.id, second.version]] }] });

    const [oldRow, newRow] = [await getEvidenceRecord(intake, first.id), await getEvidenceRecord(intake, second.id)];
    expect(oldRow).toMatchObject({ statusWord: "본부 공개", statusDetail: "기획본부 공개" });
    expect(newRow).toMatchObject({ statusWord: "본부 공개", statusDetail: `${other.name} 공개` });
    const stored = await storedRows([first.id, second.id]);
    expect(stored.find((row) => row.id === first.id)?.visibleOrgUnitId).toBe(await orgUnitIdByName("기획본부"));
    expect(stored.find((row) => row.id === second.id)?.visibleOrgUnitId).toBe(other.id);
  });

  it("(RP-15 ⑴) 개인카드 전표(경영관리만) 종류 줄은 제안되지 않고 2행이 종류 이름 · 경영관리만이다", async () => {
    const intake = await createIntakeViewer();
    await addLotteCard("5701", { kind: "shared" });
    await registerFixtureFile(intake, lotteFixture(lotteLines("5701", ["57010001", "57010002"])), "롯데.xls");
    const [g15] = (await listEvidenceRecords(intake)).rows;
    await db.update(evidenceRecords).set({ evidenceType: "personal_card_receipt" }).where(eq(evidenceRecords.id, g15?.id ?? ""));

    const list = await listEvidenceRecords(intake);

    expect(list.proposals.map((proposal) => proposal.id)).not.toContain(g15?.id);
    expect(list.proposals).toHaveLength(1);
    expect(list.rows.find((row) => row.id === g15?.id)).toMatchObject({ statusWord: "미공개", statusDetail: "개인카드 전표 · 경영관리만" });
  });

  it(`(P2-B1) ${EVIDENCE_IMPORT_MAX_ROWS}줄 — 팀 공개 한 묶음으로 전부 저장 · 요청 본문 < 256KB · 갱신 문장 = ⌈줄 ÷ 500⌉`, async () => {
    const intake = await createIntakeViewer();
    const team = await teamIdByName("기획1팀");
    await addLotteCard("5801", { kind: "team", teamId: team });
    const approvals = Array.from({ length: EVIDENCE_IMPORT_MAX_ROWS }, (_, i) => String(58_000_000 + i));
    await registerFixtureFile(intake, lotteFixture(lotteLines("5801", approvals), { as: "xlsx" }), "롯데_3000.xlsx");
    const list = await listEvidenceRecords(intake);
    expect(list.proposals).toHaveLength(EVIDENCE_IMPORT_MAX_ROWS);
    const input = { groups: groupsOf(list) };
    expect(input.groups).toHaveLength(1);
    expect(Buffer.byteLength(JSON.stringify(input))).toBeLessThan(MAX_ACTION_PAYLOAD_BYTES);
    let statements = 0;

    const result = await publishEvidenceRecords(intake, input, {
      updateVisibilitiesIfVersionMatch: async (...args) => {
        statements++;
        return evidenceRecordsRepo.updateVisibilitiesIfVersionMatch(...args);
      },
    });

    expect(result.saved).toBe(EVIDENCE_IMPORT_MAX_ROWS);
    expect(statements).toBe(Math.ceil(EVIDENCE_IMPORT_MAX_ROWS / 500));
    expect((await listEvidenceRecords(intake)).proposals).toEqual([]);
  }, 240_000);

  it("같은 id가 두 묶음에 나오면 입력 거부 · 저장 0줄", async () => {
    const intake = await createIntakeViewer();
    await addLotteCard("5901", { kind: "shared" });
    await registerFixtureFile(intake, lotteFixture(lotteLines("5901", ["59010001"])), "롯데.xls");
    const [proposal] = (await listEvidenceRecords(intake)).proposals;
    if (!proposal) throw new Error("제안 없음");
    const item = [proposal.id, proposal.version] as const;

    await expect(
      publishEvidenceRecords(intake, { groups: [{ visibility: "division", items: [item] }, { visibility: "private", items: [item] }] }),
    ).rejects.toBeInstanceOf(UserFacingError);
    expect((await storedRows([proposal.id]))[0]?.visibilitySavedAt).toBeNull();
  });

  it("등록 묶음 — 결과 행 1행의 파일 이름 · 서식 이름(등록 권한자만)", async () => {
    const intake = await createIntakeViewer();
    const result = await registerFixtureFile(intake, lotteFixture(lotteLines("6101", ["61010001"])), "롯데_10월.xls");

    expect(await getEvidenceBatch(intake, result.batchId)).toEqual({ id: result.batchId, fileName: "롯데_10월.xls", formatLabel: "롯데카드 매입내역" });
    expect(await getEvidenceBatch(await personViewer("role-pm"), result.batchId)).toBeNull();
    expect(await getEvidenceBatch(intake, "not-a-uuid")).toBeNull();
  });

  it("시스템 관리자 계급은 증빙 전부를 본다(evidence.intake 쓰기 → 범위 all)", async () => {
    const intake = await createIntakeViewer();
    await registerFixtureFile(intake, lotteFixture(lotteLines("6001", ["60010001", "60010002"])), "롯데.xls");
    const admin = await personViewer("role-sysadmin");

    // 카드가 없는 끝 4자리라 두 줄 다 카드 미등록 — 기본 보기 `할 일`에 들지 않아 `전체`로 잰다(Task 2).
    expect((await listEvidenceRecords(admin, { state: "all" })).rows).toHaveLength(2);
  });
});

// ─── 06.1-05 Task 2: 필터 · 합계 · 서식 그룹 · 쪽 · 할 일 건수 ─────────────────────────────────────────────

async function idsByApproval(batchIds: readonly string[]): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: evidenceRecords.id, approvalNo: evidenceRecords.approvalNo })
    .from(evidenceRecords)
    .where(inArray(evidenceRecords.batchId, [...batchIds]));
  return new Map(rows.map((row) => [row.approvalNo ?? "", row.id]));
}

function idOf(ids: Map<string, string>, approval: string): string {
  const id = ids.get(approval);
  if (!id) throw new Error(`줄 없음: ${approval}`);
  return id;
}

async function stateIds(viewer: Viewer, query: Parameters<typeof listEvidenceRecords>[1]): Promise<string[]> {
  return (await listEvidenceRecords(viewer, query)).rows.map((row) => row.id ?? "").sort();
}

type StateRows = Record<"plain" | "needsCheck" | "negative" | "privateType" | "published" | "attached" | "archived" | "cardUnknown", string>;

// 상태 낱말마다 한 줄 — 미공개(제안 대상) · 확인 필요(해외 이용) · 음수 · 경영관리만 종류 · 팀 공개 · 붙음 · 보관 · 카드 미등록(끝 4자리 7102는 카드 없음).
async function seedStateRows(intake: Viewer): Promise<StateRows> {
  await addLotteCard("7101", { kind: "shared" });
  const known = (approval: string, patch: Partial<Record<string, string>> = {}): FixtureRow => ({ 카드번호: "9999000011117101", 승인번호: approval, ...patch });
  const { batchId } = await registerFixtureFile(
    intake,
    lotteFixture([
      known("71010001"),
      known("71010002", { 현지거래금액: "12.50" }),
      known("71010003", { 매입금액: "-50,000", 부가세: "-4,545" }),
      known("71010004"),
      known("71010005"),
      known("71010006"),
      known("71010007"),
      { 카드번호: "9999000011117102", 승인번호: "71020001" },
    ]),
    "상태.xls",
  );
  const ids = await idsByApproval([batchId]);
  const rows: StateRows = {
    plain: idOf(ids, "71010001"),
    needsCheck: idOf(ids, "71010002"),
    negative: idOf(ids, "71010003"),
    privateType: idOf(ids, "71010004"),
    published: idOf(ids, "71010005"),
    attached: idOf(ids, "71010006"),
    archived: idOf(ids, "71010007"),
    cardUnknown: idOf(ids, "71020001"),
  };
  await setRecordTypeFixture(rows.privateType, "personal_card_receipt");
  await setRecordVisibilityFixture(rows.published, { visibility: "team", teamId: await teamIdByName("기획1팀") });
  await insertLiveLinkFixture(rows.attached, intake.id);
  await setRecordArchivedFixture(rows.archived, intake.id);
  return rows;
}

describe("domain/evidence-records — 목록 필터 · 합계 · 그룹 · 쪽 (06.1-05 Task 2)", () => {
  it("기본 보기 = 할 일(미공개 ∪ 확인 필요) — 음수 · 경영관리만 종류 줄은 남고 공개 · 붙음 · 보관 · 카드 미등록 줄은 빠진다 · 할 일 건수도 같은 집합(DA-10)", async () => {
    const intake = await createIntakeViewer();
    const rows = await seedStateRows(intake);
    const todo = [rows.plain, rows.needsCheck, rows.negative, rows.privateType].sort();

    expect(await stateIds(intake, {})).toEqual(todo);
    expect(await stateIds(intake, { state: "todo" })).toEqual(todo);
    expect(await stateIds(intake, { state: "모르는 값" })).toEqual(todo);
    expect((await listEvidenceRecords(intake)).filters).toEqual({ state: "todo", type: "", period: "all", batch: null });
    expect(await countTodoEvidence(intake)).toBe(4);
    expect(await countTodoEvidence(await personViewer("role-pm"))).toBeNull();
  });

  it("상태 필터 — 미공개 · 공개 · 붙음 · 짝 없는 카드 줄(카드 줄 · 안 붙음 · 카드 등록됨) · 확인 필요 · 카드 미등록 · 보관됨 · 전체(보관 제외)", async () => {
    const intake = await createIntakeViewer();
    const rows = await seedStateRows(intake);

    expect(await stateIds(intake, { state: "private" })).toEqual([rows.plain, rows.negative, rows.privateType].sort());
    expect(await stateIds(intake, { state: "published" })).toEqual([rows.published]);
    expect(await stateIds(intake, { state: "attached" })).toEqual([rows.attached]);
    expect(await stateIds(intake, { state: "unmatched" })).toEqual([rows.plain, rows.needsCheck, rows.negative, rows.privateType, rows.published].sort());
    expect(await stateIds(intake, { state: "needs-check" })).toEqual([rows.needsCheck]);
    expect(await stateIds(intake, { state: "card-unknown" })).toEqual([rows.cardUnknown]);
    expect(await stateIds(intake, { state: "archived" })).toEqual([rows.archived]);
    expect(await stateIds(intake, { state: "all" })).toEqual(Object.values(rows).filter((id) => id !== rows.archived).sort());
  });

  it("(DA-9) 음수 줄은 미공개 + 2행 음수 · 공개 칸 읽기 · 제안 밖 / 확인 필요 · 카드 미등록 줄은 공개 칸 잠김 · 제안 밖", async () => {
    const intake = await createIntakeViewer();
    const rows = await seedStateRows(intake);

    const list = await listEvidenceRecords(intake, { state: "all" });

    const byId = new Map(list.rows.map((row) => [row.id, row]));
    expect(byId.get(rows.negative)).toMatchObject({ statusWord: "미공개", statusDetail: "음수 · 원거래 문서에 붙이기", visibilityCell: "readonly", totalKrw: -50_000 });
    expect(byId.get(rows.needsCheck)).toMatchObject({ statusWord: "확인 필요", statusDetail: "해외 이용 · 원화 금액 확인", visibilityCell: "locked" });
    expect(byId.get(rows.cardUnknown)).toMatchObject({ statusWord: "카드 미등록", visibilityCell: "locked" });
    expect(list.proposals.map((proposal) => proposal.id)).toEqual([rows.plain]);
  });

  it("(DA-5) 비씨 취소 표시 줄의 2행은 저장된 사유 그대로 · (DA-8) 당초 승인번호가 있는 세금계산서는 종류 글자 수정세금계산서 · 종류 필터는 코드값(세금계산서에 든다)", async () => {
    const intake = await createIntakeViewer();
    await createCorpCard(SYSTEM_VIEWER, { issuer: "비씨카드", numberLast4: "2942", label: "비씨 2942", kind: "shared" });
    const bc = await registerFixtureFile(intake, bcFixture([{ 승인번호: "64706309", 금액SIGN코드: "-", "거래금액(원화)": "5,500", 부가세: "500" }]), "비씨.xls");
    const hometax = await registerFixtureFile(
      intake,
      hometaxTaxInvoiceFixture([
        {},
        {
          승인번호: "20260620-10260620-71160002",
          합계금액: -110000,
          공급가액: -100000,
          세액: -10000,
          전자세금계산서분류: "수정세금계산서",
          비고: "당초승인번호(20260615-10260615-71160001)",
        },
      ]),
      "홈택스.xls",
    );
    const ids = await idsByApproval([bc.batchId, hometax.batchId]);
    const [cancel, original, amended] = [idOf(ids, "64706309"), idOf(ids, "20260615-10260615-71160001"), idOf(ids, "20260620-10260620-71160002")];

    const list = await listEvidenceRecords(intake, { state: "all" });

    const byId = new Map(list.rows.map((row) => [row.id, row]));
    expect(byId.get(cancel)).toMatchObject({ statusWord: "확인 필요", statusDetail: "취소 표시 줄 · 원거래 확인", visibilityCell: "locked" });
    expect(byId.get(amended)).toMatchObject({ evidenceType: "tax_invoice", typeLabel: "수정세금계산서" });
    expect(byId.get(original)).toMatchObject({ evidenceType: "tax_invoice", typeLabel: "세금계산서" });
    expect(await stateIds(intake, { state: "all", type: "tax_invoice" })).toEqual([original, amended].sort());
    expect(await stateIds(intake, { state: "all", type: "card_receipt" })).toEqual([cancel]);
    expect(await stateIds(intake, { state: "all", type: "모르는 종류" })).toHaveLength(3);
    expect((await listEvidenceRecords(intake, { state: "all", type: "모르는 종류" })).filters.type).toBe("");
  });

  it("기간 · 묶음 필터 — 한국 날짜 이번 달 · 지난달 · 전체, 묶음 id면 그 묶음만 · 묶음 표시는 원래 파일 이름", async () => {
    const intake = await createIntakeViewer();
    await addLotteCard("7201", { kind: "shared" });
    const today = seoulToday();
    const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
    const lastMonth = month === 1 ? `${year - 1}.12.15` : `${year}.${String(month - 1).padStart(2, "0")}.15`;
    const line = (approval: string, date: string): FixtureRow => ({ 카드번호: "9999000011117201", 승인번호: approval, 매입일자: date });
    const first = await registerFixtureFile(
      intake,
      lotteFixture([line("72010001", today.replaceAll("-", ".")), line("72010002", lastMonth), line("72010003", "2020.01.15")]),
      "롯데_1.xls",
    );
    const second = await registerFixtureFile(intake, lotteFixture([line("72010004", today.replaceAll("-", "."))]), "롯데_2.xls");
    const ids = await idsByApproval([first.batchId, second.batchId]);

    expect(await stateIds(intake, { state: "all", period: "this-month" })).toEqual([idOf(ids, "72010001"), idOf(ids, "72010004")].sort());
    expect(await stateIds(intake, { state: "all", period: "last-month" })).toEqual([idOf(ids, "72010002")]);
    expect(await stateIds(intake, { state: "all", period: "all" })).toHaveLength(4);
    expect(await stateIds(intake, { state: "all", batch: second.batchId })).toEqual([idOf(ids, "72010004")]);
    const batched = await listEvidenceRecords(intake, { state: "all", batch: first.batchId });
    expect(batched.rows).toHaveLength(3);
    expect(batched.batch).toEqual({ id: first.batchId, fileName: "롯데_1.xls" });
    expect(batched.filters).toEqual({ state: "all", type: "", period: "all", batch: first.batchId });
    expect((await listEvidenceRecords(intake, { state: "all", batch: "not-a-uuid" })).filters.batch).toBeNull();
  });

  it("합계 · 서식 그룹 · 50건 쪽 — 61건이면 1쪽 50줄이어도 합계는 61건 합, 그룹 건수는 필터 결과 기준 · 금액을 못 보면 건수만", async () => {
    const intake = await createIntakeViewer();
    await addLotteCard("7301", { kind: "shared" });
    await registerFixtureFile(intake, lotteFixture(lotteLines("7301", Array.from({ length: 60 }, (_, i) => String(73_010_000 + i)))), "롯데_60.xls");
    await registerFixtureFile(intake, hometaxTaxInvoiceFixture([{}]), "홈택스.xls");

    const first = await listEvidenceRecords(intake, { state: "all" });

    expect(first.rows).toHaveLength(50);
    expect(first.page).toEqual({ page: 1, pageCount: 2, pageSize: 50, total: 61 });
    expect(first.total).toEqual({ count: 61, amounts: { supplyKrw: 60 * 185_546 + 100_000, vatKrw: 60 * 18_554 + 10_000, totalKrw: 60 * 204_100 + 110_000 } });
    expect(first.groups).toEqual([
      { format: "card-lotte", label: "롯데카드 매입내역", count: 60 },
      { format: "hometax-tax-invoice", label: "홈택스 매입 세금계산서", count: 1 },
    ]);
    const second = await listEvidenceRecords(intake, { state: "all", page: "2" });
    expect(second.rows).toHaveLength(11);
    expect(second.page.page).toBe(2);
    expect((await listEvidenceRecords(intake, { state: "all", page: "99" })).page.page).toBe(2);
    const invoices = await listEvidenceRecords(intake, { state: "all", type: "tax_invoice" });
    expect(invoices.groups).toEqual([{ format: "hometax-tax-invoice", label: "홈택스 매입 세금계산서", count: 1 }]);
    expect(invoices.total).toEqual({ count: 1, amounts: { supplyKrw: 100_000, vatKrw: 10_000, totalKrw: 110_000 } });

    await upsertVisibility(SYSTEM_VIEWER, { roleId: intake.roleId ?? "", infoItem: "evidence.amount", visible: false });
    expect((await listEvidenceRecords(intake, { state: "all" })).total).toEqual({ count: 61, amounts: null });
  });

  it("hasAny — 범위에 줄이 하나도 없으면 거짓, 보관 줄만 있어도 참(등록한 적 있음)", async () => {
    const intake = await createIntakeViewer();
    expect((await listEvidenceRecords(intake)).hasAny).toBe(false);
    await addLotteCard("7401", { kind: "shared" });
    const { batchId } = await registerFixtureFile(intake, lotteFixture(lotteLines("7401", ["74010001"])), "롯데.xls");
    await setRecordArchivedFixture(idOf(await idsByApproval([batchId]), "74010001"), intake.id);

    const list = await listEvidenceRecords(intake);

    expect(list.rows).toEqual([]);
    expect(list.hasAny).toBe(true);
  });

  it("(O-6106) 저장한 줄을 id로 다시 읽으면 바뀐 상태 낱말 · 새 version — 형식 오류 id는 빠지고 범위 밖 사람은 0줄", async () => {
    const intake = await createIntakeViewer();
    const team = await teamIdByName("기획1팀");
    await addLotteCard("7501", { kind: "team", teamId: team });
    await registerFixtureFile(intake, lotteFixture(lotteLines("7501", ["75010001", "75010002"])), "롯데.xls");
    const list = await listEvidenceRecords(intake);
    await publishEvidenceRecords(intake, { groups: groupsOf(list) });
    const ids = list.rows.map((row) => row.id ?? "");

    const views = await listEvidenceRecordsByIds(intake, [...ids, "not-a-uuid"]);

    expect(views.map((view) => view.id).sort()).toEqual([...ids].sort());
    for (const view of views) expect(view).toMatchObject({ statusWord: "팀 공개", statusDetail: "기획1팀", visibilityLabel: "기획1팀 공개", version: 2 });
    expect(await listEvidenceRecordsByIds(await personViewer("role-pm"), ids)).toEqual([]);
  });
});

// 06.1-05 Task 3 — 줄마다 지금 version(픽스처가 바꾼 줄 포함)을 표에서 읽어 요청 꼴로.
async function versionsOf(ids: readonly string[]): Promise<Map<string, number>> {
  return new Map((await storedRows(ids)).map((row) => [row.id, row.version]));
}

function item(versions: Map<string, number>, id: string): readonly [string, number] {
  const version = versions.get(id);
  if (version === undefined) throw new Error(`줄 없음: ${id}`);
  return [id, version] as const;
}

async function actionLogFor(recordId: string) {
  return db.select().from(actionLog).where(eq(actionLog.entityId, recordId));
}

describe("domain/evidence-records — 서버가 거부하는 편집 · 보관 / 되살림 (06.1-05 Task 3)", () => {
  it("(E20) 제안 팀이 아닌 보관 아닌 팀으로 팀 공개 → 그 팀으로 저장", async () => {
    const intake = await createIntakeViewer();
    await addLotteCard("8101", { kind: "shared" });
    await registerFixtureFile(intake, lotteFixture(lotteLines("8101", ["81010001"])), "롯데.xls");
    const [proposal] = (await listEvidenceRecords(intake)).proposals;
    if (!proposal) throw new Error("제안 없음");
    const other = await teamIdByName("경영관리팀");

    const result = await publishEvidenceRecords(intake, { groups: [{ visibility: "team", teamId: other, items: [[proposal.id, proposal.version]] }] });

    expect(result.saved).toBe(1);
    expect((await storedRows([proposal.id]))[0]).toMatchObject({ visibility: "team", visibleTeamId: other, visibleOrgUnitId: null });
  });

  it("(E20 · A-6) 없는 팀 · 보관된 팀 · 팀 id 없는 팀 공개가 섞이면 저장 0줄 · 줄마다 오류 칸(없는 팀 · — / 없는 팀 · {이름} / 팀 없음)", async () => {
    const intake = await createIntakeViewer();
    await addLotteCard("8201", { kind: "shared" });
    await registerFixtureFile(intake, lotteFixture(lotteLines("8201", ["82010001", "82010002", "82010003", "82010004"])), "롯데.xls");
    const [good, missing, archived, noTeam] = (await listEvidenceRecords(intake)).proposals;
    if (!good || !missing || !archived || !noTeam) throw new Error("제안 넷 없음");
    const division = await orgUnitIdByName("기획본부");
    const closed = await insertTeam(SYSTEM_VIEWER, { orgUnitId: division, name: `닫은 팀 ${randomUUID().slice(0, 4)}` });
    await setTeamArchived(SYSTEM_VIEWER, closed.id, true);

    const error = await rejection(
      publishEvidenceRecords(intake, {
        groups: [
          { visibility: "division", items: [[good.id, good.version]] },
          { visibility: "team", teamId: randomUUID(), items: [[missing.id, missing.version]] },
          { visibility: "team", teamId: closed.id, items: [[archived.id, archived.version]] },
          { visibility: "team", items: [[noTeam.id, noTeam.version]] },
        ],
      }),
    );

    expect(error.summary).toBe("오류 3칸 · 전부 거부");
    expect(error.formatErrors.map((cell) => [cell.rowId, cell.reason])).toEqual([
      [missing.id, "없는 팀 · —"],
      [archived.id, `없는 팀 · ${closed.name}`],
      [noTeam.id, "팀 없음"],
    ]);
    const stored = await storedRows([good.id, missing.id, archived.id, noTeam.id]);
    expect(stored.every((row) => row.visibility === "private" && row.visibilitySavedAt === null && row.version === 1)).toBe(true);
  });

  it.each([
    ["확인 필요", "확인 필요", "needsCheck"],
    ["카드 미등록", "카드 미등록", "cardUnknown"],
    ["붙음", "붙음", "attached"],
    ["음수", "미공개", "negative"],
    ["보관", "보관됨", "archived"],
  ] as const)("(E32 · P2-2) 정상 줄과 %s 줄을 함께 보내면 저장 0줄 · 그 줄 오류 칸(이유 = 그 줄 상태 낱말 %s)", async (_label, reason, key) => {
    const intake = await createIntakeViewer();
    const rows = await seedStateRows(intake);
    const versions = await versionsOf([rows.plain, rows[key]]);

    const error = await rejection(publishEvidenceRecords(intake, { groups: [{ visibility: "division", items: [item(versions, rows.plain), item(versions, rows[key])] }] }));

    expect(error.formatErrors.map((cell) => [cell.rowId, cell.reason])).toEqual([[rows[key], reason]]);
    const stored = await storedRows([rows.plain]);
    expect(stored[0]).toMatchObject({ visibility: "private", visibilitySavedAt: null });
    expect(await versionsOf([rows.plain, rows[key]])).toEqual(versions);
  });

  it("(RP-15 ⑴) 경영관리만 종류 줄은 팀 · 본부 공개면 저장 0줄 + 오류 칸 `개인카드 전표 · 경영관리만`, 미공개면 저장되고 visibility_saved_at이 찍힌다", async () => {
    const intake = await createIntakeViewer();
    const rows = await seedStateRows(intake);
    const versions = await versionsOf([rows.plain, rows.privateType]);
    const team = await teamIdByName("기획1팀");

    const asTeam = await rejection(
      publishEvidenceRecords(intake, {
        groups: [
          { visibility: "division", items: [item(versions, rows.plain)] },
          { visibility: "team", teamId: team, items: [item(versions, rows.privateType)] },
        ],
      }),
    );
    const asDivision = await rejection(publishEvidenceRecords(intake, { groups: [{ visibility: "division", items: [item(versions, rows.privateType)] }] }));

    for (const error of [asTeam, asDivision]) expect(error.formatErrors.map((cell) => [cell.rowId, cell.reason])).toEqual([[rows.privateType, "개인카드 전표 · 경영관리만"]]);
    expect((await storedRows([rows.plain, rows.privateType])).every((row) => row.visibilitySavedAt === null)).toBe(true);

    const saved = await publishEvidenceRecords(intake, { groups: [{ visibility: "private", items: [item(versions, rows.privateType)] }] });

    expect(saved.saved).toBe(1);
    const [stored] = await storedRows([rows.privateType]);
    expect(stored).toMatchObject({ visibility: "private", version: (versions.get(rows.privateType) ?? 0) + 1 });
    expect(stored?.visibilitySavedAt).toBeInstanceOf(Date);
  });

  it("(DA-7 · E41 · C2) 안 붙은 줄 보관 → 보관 시각 · 보관한 사람 · version + 1 · 행동 로그 archive, 되살림 → 두 칸 null · version + 1 · 행동 로그 restore", async () => {
    const intake = await createIntakeViewer();
    const rows = await seedStateRows(intake);
    const version = (await versionsOf([rows.negative])).get(rows.negative) ?? 0;

    const archived = await archiveEvidenceRecord(intake, { id: rows.negative, version });

    expect(archived).toEqual({ id: rows.negative, version: version + 1 });
    const [afterArchive] = await storedRows([rows.negative]);
    expect(afterArchive?.archivedAt).toBeInstanceOf(Date);
    expect(afterArchive).toMatchObject({ archivedBy: intake.id, version: version + 1 });
    expect((await actionLogFor(rows.negative)).map((log) => [log.actionType, log.entity, log.actorId])).toEqual([["archive", "evidence_record", intake.id]]);
    expect((await listEvidenceRecords(intake)).rows.map((row) => row.id)).not.toContain(rows.negative);

    const restored = await restoreEvidenceRecord(intake, archived);

    expect(restored).toEqual({ id: rows.negative, version: version + 2 });
    expect((await storedRows([rows.negative]))[0]).toMatchObject({ archivedAt: null, archivedBy: null, version: version + 2 });
    expect((await actionLogFor(rows.negative)).map((log) => log.actionType).sort()).toEqual(["archive", "restore"]);
    expect((await listEvidenceRecords(intake)).rows.map((row) => row.id)).toContain(rows.negative);
  });

  it("(DA-7) 붙은 줄 보관 · 낡은 version 보관 · 보관 아닌 줄 되살림은 거부(다른 사람이 {HH:mm}에 바꿈 · 새로 고침) — 보관 0 · 로그 0", async () => {
    const intake = await createIntakeViewer();
    const rows = await seedStateRows(intake);
    const versions = await versionsOf([rows.attached, rows.plain]);
    const conflict = /^다른 사람이 \d{2}:\d{2}에 바꿈 · 새로 고침$/;

    await expect(archiveEvidenceRecord(intake, { id: rows.attached, version: versions.get(rows.attached) ?? 0 })).rejects.toThrow(conflict);
    await expect(archiveEvidenceRecord(intake, { id: rows.plain, version: (versions.get(rows.plain) ?? 0) + 1 })).rejects.toThrow(conflict);
    await expect(restoreEvidenceRecord(intake, { id: rows.plain, version: versions.get(rows.plain) ?? 0 })).rejects.toThrow(conflict);

    const stored = await storedRows([rows.attached]);
    expect(stored[0]).toMatchObject({ archivedAt: null, archivedBy: null, version: versions.get(rows.attached) });
    expect(await actionLogFor(rows.attached)).toEqual([]);
  });

  it("(P3) 갱신 시각 updated_at(timestamp)은 DB 세션 시간대와 무관하게 UTC 시각으로 담긴다 — 세션이 Asia/Seoul이어도 충돌 글자 HH:mm이 한국 시각이다", async () => {
    const intake = await createIntakeViewer();
    const rows = await seedStateRows(intake);
    const version = (await versionsOf([rows.plain])).get(rows.plain) ?? 0;

    // 세션 시간대를 한국으로 두고 갱신 두 문장(공개 범위 저장 · 보관)을 쓴 뒤, 같은 잠금 질의로 읽은 updatedAt이 지금과 가까워야 한다.
    const stampedBy = async (write: (tx: Parameters<Parameters<typeof withTransaction>[0]>[0], currentVersion: number) => Promise<unknown>, currentVersion: number): Promise<Date> =>
      withTransaction(async (tx) => {
        await tx.execute(sql`SET LOCAL TIME ZONE 'Asia/Seoul'`);
        await write(tx, currentVersion);
        const [locked] = await evidenceRecordsRepo.lockRecordsForUpdate(intake, [rows.plain], tx);
        if (!locked) throw new Error("줄 없음");
        return locked.updatedAt;
      });

    const afterVisibility = await stampedBy(
      (tx, current) => evidenceRecordsRepo.updateVisibilitiesIfVersionMatch(intake, [{ id: rows.plain, version: current, visibility: "private", teamId: null, orgUnitId: null }], tx),
      version,
    );
    expect(Math.abs(afterVisibility.getTime() - Date.now())).toBeLessThan(60_000);

    const afterArchive = await stampedBy((tx, current) => evidenceRecordsRepo.setRecordArchivedIfVersionMatches(intake, { id: rows.plain, version: current, archived: true }, tx), version + 1);
    expect(Math.abs(afterArchive.getTime() - Date.now())).toBeLessThan(60_000);
  });

  it("(DA-7) 증빙 등록 쓰기가 없는 계급(기획 PM)은 보관 · 되살림 둘 다 거부", async () => {
    const intake = await createIntakeViewer();
    const rows = await seedStateRows(intake);
    const versions = await versionsOf([rows.plain, rows.archived]);
    const pm = await personViewer("role-pm");

    await expect(archiveEvidenceRecord(pm, { id: rows.plain, version: versions.get(rows.plain) ?? 0 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(restoreEvidenceRecord(pm, { id: rows.archived, version: versions.get(rows.archived) ?? 0 })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await storedRows([rows.plain, rows.archived])).toEqual(expect.arrayContaining([expect.objectContaining({ id: rows.plain, archivedAt: null }), expect.objectContaining({ id: rows.archived, archivedBy: intake.id })]));
  });
});
