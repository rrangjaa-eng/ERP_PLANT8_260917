import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, evidenceRecords, teams } from "@/db/schema";
import { ForbiddenError } from "@/domain/permissions/can";
import { listEvidenceRecords } from "@/domain/evidence-records";
import { exportEvidenceRecords } from "@/domain/evidence-records/export";
import { createAccount } from "@/domain/auth/accounts";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { createIntakeViewer, createPmInTeam, insertLiveLinkFixture, insertRecordFixture, setRecordArchivedFixture, setRecordVisibilityFixture } from "./fixtures/evidence";

// 06.1-13 G6(RP-16) — 증빙 목록 `파일 받기`. 서버가 목록과 같은 범위 · 거르개 · 투영으로 쪽과 무관하게 전체를 다시 읽고, 직렬화 전에
// 끌 수 없는 기록 `excel_export`를 남긴다. 단언 대상 viewer는 등록 계급(임시) · 금액을 못 보는 등록 계급 · 시드 role-pm이다
// (시스템 관리자 자격으로 재지 않는다). SYSTEM_VIEWER는 준비 줄에만 쓴다.

const HEADER = ["날짜", "며칠째", "거래처·가맹점", "공급가", "세액", "합계", "공개", "상태"];

// RFC4180 최소 읽기 — 따옴표 칸 · 안 따옴표 둘 · CRLF 줄.
function parseCsv(body: string): string[][] {
  expect(body.startsWith("﻿")).toBe(true);
  const text = body.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (quoted) {
      if (char === '"' && text[at + 1] === '"') {
        cell += '"';
        at++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\r" && text[at + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      at++;
    } else cell += char;
  }
  return rows;
}

async function exportRows(viewer: Viewer, query: Parameters<typeof exportEvidenceRecords>[1] = { state: "all" }): Promise<string[][]> {
  const file = await exportEvidenceRecords(viewer, query);
  expect(file.contentType).toBe("text/csv; charset=utf-8");
  expect(file.filename).toMatch(/^evidence-records-.+\.csv$/);
  return parseCsv(file.body);
}

async function exportLogs(viewer: Viewer) {
  return db.select().from(actionLog).where(and(eq(actionLog.actorId, viewer.id), eq(actionLog.actionType, "excel_export")));
}

// 금액 정보 항목(evidence.amount)을 못 보는 등록 계급 — 목록에서도 금액 칸이 비는 사람.
async function createIntakeViewerWithoutAmount(): Promise<Viewer> {
  const roleId = `role-evidence-noamount-${randomUUID().slice(0, 8)}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `증빙 등록 금액 없음 ${roleId.slice(-8)}` });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence.intake", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence", action: "view", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "evidence.value", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "evidence.amount", visible: false });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `noamount-${randomUUID()}@example.test`, name: "금액 없는 등록자", roleId });
  return { id: userId, roleId };
}

describe("exportEvidenceRecords — 목록과 같은 범위 · 거르개 · 투영", () => {
  it("51건(쪽 둘)이면 파일은 머리줄 + 51줄(쪽 무관 전체) · 머리줄은 목록 열 순서 · 줄은 목록 차례와 같다", async () => {
    const intake = await createIntakeViewer();
    for (let index = 0; index < 51; index++) await insertRecordFixture(intake, { nameOnDocument: `거래처 ${String(index).padStart(2, "0")}`, issuedOn: `2026-09-${String((index % 28) + 1).padStart(2, "0")}` });

    const rows = await exportRows(intake);
    expect(rows[0]).toEqual(HEADER);
    expect(rows).toHaveLength(52);

    const first = await listEvidenceRecords(intake, { state: "all" });
    const second = await listEvidenceRecords(intake, { state: "all", page: "2" });
    expect(first.page.pageCount).toBe(2);
    const listed = [...first.rows, ...second.rows].map((row) => row.counterparty);
    expect(rows.slice(1).map((row) => row[2])).toEqual(listed);
  });

  it("거르개와 겹친다 — `state=published`면 공개한 줄만, 다른 줄은 파일에 없다", async () => {
    const intake = await createIntakeViewer();
    const published = await insertRecordFixture(intake, { nameOnDocument: "공개한 거래처" });
    await insertRecordFixture(intake, { nameOnDocument: "미공개 거래처" });
    const [team] = await db.select({ id: teams.id }).from(teams).limit(1);
    if (!team) throw new Error("시드 팀 없음");
    await setRecordVisibilityFixture(published, { visibility: "team", teamId: team.id });

    const rows = await exportRows(intake, { state: "published" });
    expect(rows.slice(1).map((row) => row[2])).toEqual(["공개한 거래처"]);
    expect(rows.slice(1).map((row) => row[7])).toEqual(["팀 공개"]);
    const listed = await listEvidenceRecords(intake, { state: "published" });
    expect(listed.total.count).toBe(1);
  });

  it("금액 정보 항목을 못 보는 계급 → 금액 칸 셋이 빈 칸(같은 투영)", async () => {
    const intake = await createIntakeViewer();
    await insertRecordFixture(intake, { nameOnDocument: "금액 가림", supplyKrw: 10_000, vatKrw: 1_000 });
    const noAmount = await createIntakeViewerWithoutAmount();

    const rows = await exportRows(noAmount);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.[2]).toBe("금액 가림");
    expect(rows[1]?.slice(3, 6)).toEqual(["", "", ""]);
    expect((await exportRows(intake))[1]?.slice(3, 6)).toEqual(["10000", "1000", "11000"]);
  });

  it("07.1-01 며칠째 열 — 날짜 바로 뒤 · 안 붙은 줄은 등록일 기준 정수 일수(오늘 0) · 붙은 줄 · 보관 줄은 빈 칸(화면 Ctrl+C와 같은 값)", async () => {
    const intake = await createIntakeViewer();
    await insertRecordFixture(intake, { nameOnDocument: "오늘 등록", issuedOn: "2026-09-03" });
    const old = await insertRecordFixture(intake, { nameOnDocument: "열흘 전 등록", issuedOn: "2026-09-02" });
    const attached = await insertRecordFixture(intake, { nameOnDocument: "붙은 줄", issuedOn: "2026-09-01" });
    const archived = await insertRecordFixture(intake, { nameOnDocument: "보관한 줄", issuedOn: "2026-08-31" });
    for (const id of [old, attached, archived]) await db.update(evidenceRecords).set({ createdAt: new Date(Date.now() - 10 * 86_400_000) }).where(eq(evidenceRecords.id, id));
    await insertLiveLinkFixture(attached, intake.id);
    await setRecordArchivedFixture(archived, intake.id);

    const rows = await exportRows(intake);
    expect(rows[0]?.slice(0, 3)).toEqual(["날짜", "며칠째", "거래처·가맹점"]);
    const ageOfName = new Map(rows.slice(1).map((row) => [row[2], row[1]]));
    expect(ageOfName.get("오늘 등록")).toBe("0");
    expect(ageOfName.get("열흘 전 등록")).toBe("10");
    expect(ageOfName.get("붙은 줄")).toBe("");
    // 보관한 줄은 `보관` 보기에서만 나온다.
    const archivedRows = await exportRows(intake, { state: "archived" });
    expect(archivedRows.slice(1).map((row) => [row[2], row[1]])).toEqual([["보관한 줄", ""]]);
    // 화면 목록 DTO와 같은 값이다.
    const listed = await listEvidenceRecords(intake, { state: "all" });
    for (const row of listed.rows) expect(ageOfName.get(row.counterparty ?? "")).toBe(row.ageDays === null ? "" : String(row.ageDays));
  });

  it("07.1-01 며칠째 열 — 증빙 값 정보 항목(evidence.value)을 못 보는 계급은 화면처럼 빈 칸", async () => {
    const intake = await createIntakeViewer();
    const id = await insertRecordFixture(intake, { nameOnDocument: "값 가림" });
    await db.update(evidenceRecords).set({ createdAt: new Date(Date.now() - 10 * 86_400_000) }).where(eq(evidenceRecords.id, id));
    if (!intake.roleId) throw new Error("준비한 계급 없음");
    await upsertVisibility(SYSTEM_VIEWER, { roleId: intake.roleId, infoItem: "evidence.value", visible: false });

    const listed = await listEvidenceRecords(intake, { state: "all" });
    const rows = await exportRows(intake);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.[1]).toBe(listed.rows[0]?.ageDays == null ? "" : String(listed.rows[0]?.ageDays));
    expect(rows[1]?.[1]).toBe("");
  });

  it("수식 방어 — 거래처 이름 `=1+1`은 `'=1+1`로 나간다", async () => {
    const intake = await createIntakeViewer();
    await insertRecordFixture(intake, { nameOnDocument: "=1+1" });
    const rows = await exportRows(intake);
    expect(rows[1]?.[2]).toBe("'=1+1");
  });

  it("G7 혼합 부호 — 금액 칸은 `12000` · `-12000` · `5000` 숫자 그대로(작은따옴표 없음) · 합 = 목록 합계, 글자 칸 `-12000원 환불`은 방어 그대로", async () => {
    const intake = await createIntakeViewer();
    await insertRecordFixture(intake, { nameOnDocument: "양수", supplyKrw: 12_000, issuedOn: "2026-09-03" });
    await insertRecordFixture(intake, { nameOnDocument: "-12000원 환불", supplyKrw: -12_000, issuedOn: "2026-09-02" });
    await insertRecordFixture(intake, { nameOnDocument: "작은 줄", supplyKrw: 5_000, issuedOn: "2026-09-01" });

    const rows = (await exportRows(intake)).slice(1);
    expect(rows.map((row) => row[3])).toEqual(["12000", "-12000", "5000"]);
    expect(rows.map((row) => row[2])).toEqual(["양수", "'-12000원 환불", "작은 줄"]);
    const list = await listEvidenceRecords(intake, { state: "all" });
    const sum = (index: number) => rows.reduce((total, row) => total + Number(row[index]), 0);
    expect(sum(3)).toBe(list.total.amounts?.supplyKrw);
    expect(sum(5)).toBe(list.total.amounts?.totalKrw);
  });

  it("0건이어도 머리줄만 있는 파일을 준다", async () => {
    const intake = await createIntakeViewer();
    const rows = await exportRows(intake);
    expect(rows).toEqual([HEADER]);
  });
});

describe("exportEvidenceRecords — 기록 · 권한", () => {
  it("행동 로그 `excel_export` 한 줄 — entity evidence_record · detail은 거르개 · 건수뿐(파일 이름 · 금액 · 사람 이름 없음)", async () => {
    const intake = await createIntakeViewer();
    await insertRecordFixture(intake, { nameOnDocument: "기록 거래처", supplyKrw: 77_000 });
    await exportRows(intake, { state: "all", period: "all" });

    const logs = await exportLogs(intake);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.entity).toBe("evidence_record");
    expect(logs[0]?.detail).toEqual({ filter: { state: "all", type: "", period: "all", batch: null }, count: 1 });
    const detail = JSON.stringify(logs[0]?.detail);
    for (const word of ["기록 거래처", "77000", "evidence-records-", "증빙 등록자"]) expect(detail).not.toContain(word);
  });

  it("등록 권한이 없는 계급(role-pm) → ForbiddenError · 기록 0", async () => {
    const pm = await createPmInTeam(null);
    await expect(exportEvidenceRecords(pm, { state: "all" })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await exportLogs(pm)).toHaveLength(0);
  });
});
