import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { evidenceRecords, orgUnits, teams } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { createCorpCard, type CardOwnerKind } from "@/domain/corp-cards";
import { EVIDENCE_IMPORT_MAX_ROWS } from "@/domain/evidence-import/limits";
import {
  getEvidenceBatch,
  getEvidenceRecord,
  listEvidenceRecords,
  publishEvidenceRecords,
  type EvidencePublishGroup,
  type EvidenceRecordList,
} from "@/domain/evidence-records";
import { ForbiddenError } from "@/domain/permissions/can";
import { SaveRejectedError } from "@/domain/quotes/lines";
import { EVIDENCE_VISIBILITY_DIVISION_ORG_UNIT } from "@/domain/settings/keys";
import { getSettingValue, setSettingValue } from "@/domain/settings/registry";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { MAX_ACTION_PAYLOAD_BYTES } from "@/lib/actions/payload-size";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { seoulToday } from "@/lib/dates";
import * as evidenceRecordsRepo from "@/repositories/evidence-records";
import { insertMembership } from "@/repositories/team-memberships";
import { insertOrgUnit } from "@/repositories/org-units";
import { lotteFixture, type FixtureRow } from "@/test/fixtures/evidence-import/build";
import { createIntakeViewer, registerFixtureFile } from "./fixtures/evidence";

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

    expect((await listEvidenceRecords(admin)).rows).toHaveLength(2);
  });
});
