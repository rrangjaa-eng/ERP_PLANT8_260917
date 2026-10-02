import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";

// 04-28 — 쓰기 시점 경합(사전 판정 통과 뒤 다른 커밋)을 결정적으로 만들기
// 위해 버전 조건 UPDATE만 감싼다. 기본 동작은 실제 함수 그대로다.
vi.mock("@/repositories/quote-lines", async () => {
  const actual = await vi.importActual<typeof import("@/repositories/quote-lines")>("@/repositories/quote-lines");
  return { ...actual, updateQuoteLineIfVersionMatches: vi.fn(actual.updateQuoteLineIfVersionMatches) };
});
// 충돌 경로의 거래처 이름 조회 횟수를 세기 위해 감싼다. 기본 동작은 실제 함수 그대로다.
vi.mock("@/repositories/vendors", async () => {
  const actual = await vi.importActual<typeof import("@/repositories/vendors")>("@/repositories/vendors");
  return { ...actual, findVendorNamesByIds: vi.fn(actual.findVendorNamesByIds) };
});

import { db } from "@/db/client";
import { quoteLines, codeItems, teams, actionLog } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor, findVendorNamesByIds } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines, SaveRejectedError, type QuoteLineBaseline } from "@/domain/quotes/lines";
import { updateQuoteLineIfVersionMatches } from "@/repositories/quote-lines";
import { checkPayloadSize, MAX_ACTION_PAYLOAD_BYTES } from "@/lib/actions/payload-size";

async function setupProject() {
  const client = await insertVendor(SYSTEM_VIEWER, {
    name: `거래처-${randomUUID()}`,
    normalizedName: `거래처-${randomUUID()}`,
  });
  const { userId: pmUserId } = await createAccount(SYSTEM_VIEWER, {
    email: `pm-${randomUUID()}@example.test`,
    name: "통합테스트 PM",
    roleId: DEFAULT_ROLE_ID,
  });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");

  const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");

  const project = await createProject(SYSTEM_VIEWER, {
    clientId: client.id,
    teamId: team.id,
    pmUserId,
    name: `프로젝트-${randomUUID()}`,
  });

  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("createProject가 1차 차수를 만들지 않았습니다");

  return { project, revision, subcategoryValue: subcategory.value };
}

async function countActionLogRows(entityId: string): Promise<number> {
  const rows = await db.select().from(actionLog).where(eq(actionLog.entityId, entityId));
  return rows.length;
}

// 04-04 Task 2 ⑦ — behavior의 여섯 경우. (b)는 저장 후 DB를 다시 읽어
// "세 줄 모두 저장되지 않는다"를 단언한다(응답만 보지 않는다).
describe("domain/quotes/lines saveQuoteLines — 배치 충돌·전부 거부(04-04)", () => {
  it("(a) 읽은 버전이 서버 버전과 같은 줄 셋을 저장하면 셋 다 저장되고 버전이 1씩 오른다", async () => {
    const { revision, subcategoryValue } = await setupProject();

    const result = await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      { id: randomUUID(), isNew: true, subcategory: subcategoryValue, itemName: "줄1", unitPrice: { currency: "KRW", amount: 100, fxRate: 1 }, execution: { currency: "KRW", amount: 0, fxRate: 1 } },
      { id: randomUUID(), isNew: true, subcategory: subcategoryValue, itemName: "줄2", unitPrice: { currency: "KRW", amount: 200, fxRate: 1 }, execution: { currency: "KRW", amount: 0, fxRate: 1 } },
      { id: randomUUID(), isNew: true, subcategory: subcategoryValue, itemName: "줄3", unitPrice: { currency: "KRW", amount: 300, fxRate: 1 }, execution: { currency: "KRW", amount: 0, fxRate: 1 } },
    ] });
    expect(result.lines).toHaveLength(3);
    for (const line of result.lines) expect(line.version).toBe(1);

    // 방금 만든 버전으로 항목명을 고쳐 다시 저장 — 버전이 일치하므로 충돌 없이 통과하고 1씩 오른다
    // (04-12 검토 S1 — 값이 그대로인 줄은 쓰지 않으므로 한 칸을 고친다).
    const resaved = await saveQuoteLines(
      SYSTEM_VIEWER,
      revision.id,
      { rows: result.lines.map((line) => ({
        id: line.id,
        version: line.version,
        subcategory: line.subcategory,
        itemName: `${line.itemName} 고침`,
        unitPrice: { currency: "KRW", amount: line.unitPrice.amount, fxRate: 1 },
        execution: { currency: "KRW", amount: 0, fxRate: 1 },
        baseline: {
          subcategory: line.subcategory,
          itemName: line.itemName,
          vendorId: line.vendorId,
          quantity: line.quantity,
          unitPriceAmountKrw: line.unitPrice.amountKrw,
          executionAmountKrw: line.execution.amountKrw,
          lineStatus: line.lineStatus,
          note: line.note,
        } satisfies QuoteLineBaseline,
      })) },
    );
    for (const line of resaved.lines) expect(line.version).toBe(2);
  });

  it("(b)(c) 셋 중 한 줄의 서버 버전이 그 사이 올라가면 실제로 달라진 셀만 충돌로 담기고 세 줄 모두 DB에 반영되지 않는다 — 값이 같은 셀은 충돌이 아니다", async () => {
    const { revision, subcategoryValue } = await setupProject();

    const created = await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      { id: randomUUID(), isNew: true, subcategory: subcategoryValue, itemName: "A", unitPrice: { currency: "KRW", amount: 1_000_000, fxRate: 1 }, execution: { currency: "KRW", amount: 0, fxRate: 1 } },
      { id: randomUUID(), isNew: true, subcategory: subcategoryValue, itemName: "B", unitPrice: { currency: "KRW", amount: 2_000_000, fxRate: 1 }, execution: { currency: "KRW", amount: 0, fxRate: 1 } },
      { id: randomUUID(), isNew: true, subcategory: subcategoryValue, itemName: "C", unitPrice: { currency: "KRW", amount: 3_000_000, fxRate: 1 }, execution: { currency: "KRW", amount: 0, fxRate: 1 } },
    ] });
    const [lineA, lineB, lineC] = created.lines;
    if (!lineA || !lineB || !lineC) throw new Error("setup 실패");

    function baselineOf(line: (typeof created.lines)[number]): QuoteLineBaseline {
      return {
        subcategory: line.subcategory,
        itemName: line.itemName,
        vendorId: line.vendorId,
        quantity: line.quantity,
        unitPriceAmountKrw: line.unitPrice.amountKrw,
        executionAmountKrw: line.execution.amountKrw,
        lineStatus: line.lineStatus,
        note: line.note,
      };
    }

    // 다른 사람이 lineB의 단가만 바꿔 버전을 올린다(itemName은 그대로).
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      {
        id: lineB.id,
        version: lineB.version,
        subcategory: lineB.subcategory,
        itemName: lineB.itemName,
        unitPrice: { currency: "KRW", amount: 9_800_000, fxRate: 1 },
        execution: { currency: "KRW", amount: 0, fxRate: 1 },
        baseline: baselineOf(lineB),
      },
    ] });

    // 이제 세 줄을 각자 읽은(원래) 버전으로 다시 저장 시도 — lineB만 버전이
    // 어긋났고, lineA·lineC는 baseline == 현재 DB 값이라 값 자체는 같다.
    const attempt = saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      { id: lineA.id, version: lineA.version, subcategory: lineA.subcategory, itemName: "A 수정", unitPrice: { currency: "KRW", amount: lineA.unitPrice.amount, fxRate: 1 }, execution: { currency: "KRW", amount: 0, fxRate: 1 }, baseline: baselineOf(lineA) },
      { id: lineB.id, version: lineB.version, subcategory: lineB.subcategory, itemName: "B 수정", unitPrice: { currency: "KRW", amount: lineB.unitPrice.amount, fxRate: 1 }, execution: { currency: "KRW", amount: 0, fxRate: 1 }, baseline: baselineOf(lineB) },
      { id: lineC.id, version: lineC.version, subcategory: lineC.subcategory, itemName: "C 수정", unitPrice: { currency: "KRW", amount: lineC.unitPrice.amount, fxRate: 1 }, execution: { currency: "KRW", amount: 0, fxRate: 1 }, baseline: baselineOf(lineC) },
    ] });

    await expect(attempt).rejects.toBeInstanceOf(SaveRejectedError);
    try {
      await attempt;
      throw new Error("이 지점에 도달하면 안 된다");
    } catch (error) {
      const rejected = error as SaveRejectedError;
      // lineA·lineC는 baseline과 현재 DB 값이 같으므로(버전만 올랐어도)
      // 충돌로 잡히지 않는다 — lineB의 unitPriceAmountKrw만 충돌이다.
      expect(rejected.conflicts).toHaveLength(1);
      expect(rejected.conflicts[0]?.rowId).toBe(lineB.id);
      expect(rejected.conflicts[0]?.field).toBe("unitPriceAmountKrw");
      expect(rejected.conflicts[0]?.reason).toContain("9,800,000");
      expect(rejected.conflicts[0]?.reason).toContain("덮어쓰기 / 그 값으로");
      // 04-28 거부 봉투 — 서버 현재 원값·그 줄의 서버 현재 version, 합계 행 요약.
      expect(rejected.conflicts[0]?.theirRaw).toBe(9_800_000);
      expect(rejected.conflicts[0]?.theirVersion).toBe(lineB.version + 1);
      expect(rejected.summary).toBe("충돌 1줄 · 전부 거부");
      expect(rejected.message.startsWith("충돌 1줄 · 전부 거부 · [단가] 다른 사람이 ")).toBe(true); // message는 그대로다.
    }

    // DB를 다시 읽어 세 줄 모두 이번 시도로 바뀌지 않았음을 단언한다
    // (응답만 보고 판단하지 않는다) — lineA·lineC는 애초에 손대지 않았고,
    // lineB는 앞서 다른 저장이 만든 9,800,000 그대로다.
    const [freshA, freshB, freshC] = await Promise.all([
      db.select().from(quoteLines).where(eq(quoteLines.id, lineA.id)),
      db.select().from(quoteLines).where(eq(quoteLines.id, lineB.id)),
      db.select().from(quoteLines).where(eq(quoteLines.id, lineC.id)),
    ]);
    expect(freshA[0]?.itemName).toBe("A");
    expect(freshB[0]?.itemName).toBe("B");
    expect(freshB[0]?.unitPriceAmountKrw).toBe(9_800_000);
    expect(freshC[0]?.itemName).toBe("C");
  });

  it("(e) 사전 판정 뒤 쓰기 직전에 다른 저장이 커밋되면(쓰기 시점 경합) 서버의 실제 값·버전으로 달라진 칸만 충돌로 담긴다", async () => {
    const { revision, subcategoryValue } = await setupProject();
    const created = await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      { id: randomUUID(), isNew: true, subcategory: subcategoryValue, itemName: "A", unitPrice: { currency: "KRW", amount: 1_000_000, fxRate: 1 }, execution: { currency: "KRW", amount: 0, fxRate: 1 } },
    ] });
    const [lineA] = created.lines;
    if (!lineA) throw new Error("setup 실패");

    // 버전 조건 UPDATE 직전에 다른 커넥션(자동 커밋)이 단가만 바꿔 커밋한다 —
    // 사전 판정은 이미 통과했으므로 실제 쓰기가 0행을 돌려주는 경합 경로다.
    const actual = await vi.importActual<typeof import("@/repositories/quote-lines")>("@/repositories/quote-lines");
    vi.mocked(updateQuoteLineIfVersionMatches).mockImplementationOnce(async (viewer, id, expectedVersion, scope, input, tx) => {
      await db
        .update(quoteLines)
        .set({ unitPriceAmountKrw: 7_700_000, version: sql`${quoteLines.version} + 1`, updatedAt: new Date() })
        .where(eq(quoteLines.id, id));
      return actual.updateQuoteLineIfVersionMatches(viewer, id, expectedVersion, scope, input, tx);
    });

    const baseline: QuoteLineBaseline = {
      subcategory: lineA.subcategory,
      itemName: lineA.itemName,
      vendorId: lineA.vendorId,
      quantity: lineA.quantity,
      unitPriceAmountKrw: lineA.unitPrice.amountKrw,
      executionAmountKrw: lineA.execution.amountKrw,
      lineStatus: lineA.lineStatus,
      note: lineA.note,
    };
    const attempt = saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      { id: lineA.id, version: lineA.version, subcategory: lineA.subcategory, itemName: "A 수정", unitPrice: { currency: "KRW", amount: 1_000_000, fxRate: 1 }, execution: { currency: "KRW", amount: 0, fxRate: 1 }, baseline },
    ] });

    const rejected = await attempt.then(
      () => {
        throw new Error("이 지점에 도달하면 안 된다");
      },
      (error: unknown) => error,
    );
    expect(rejected).toBeInstanceOf(SaveRejectedError);
    const conflicts = (rejected as SaveRejectedError).conflicts;
    // 내 값(itemName)이 아니라 다른 사람이 실제로 바꾼 칸(단가)만, 서버 값·버전으로.
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.field).toBe("unitPriceAmountKrw");
    expect(conflicts[0]?.theirRaw).toBe(7_700_000);
    expect(conflicts[0]?.theirVersion).toBe(lineA.version + 1);

    const [fresh] = await db.select().from(quoteLines).where(eq(quoteLines.id, lineA.id));
    expect(fresh?.itemName).toBe("A");
    expect(fresh?.unitPriceAmountKrw).toBe(7_700_000);
  });

  it("(d) 한 줄에 형식 오류(quantity <= 0)가 있으면 나머지 줄도 저장되지 않고 응답이 오류 좌표를 담는다", async () => {
    const { revision, subcategoryValue } = await setupProject();

    const attempt = saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      { id: randomUUID(), isNew: true, subcategory: subcategoryValue, itemName: "정상 줄", unitPrice: { currency: "KRW", amount: 100, fxRate: 1 }, execution: { currency: "KRW", amount: 0, fxRate: 1 } },
      { id: randomUUID(), isNew: true, subcategory: subcategoryValue, itemName: "형식 오류 줄", quantity: -1, unitPrice: { currency: "KRW", amount: 100, fxRate: 1 }, execution: { currency: "KRW", amount: 0, fxRate: 1 } },
    ] });

    await expect(attempt).rejects.toBeInstanceOf(SaveRejectedError);
    try {
      await attempt;
    } catch (error) {
      const rejected = error as SaveRejectedError;
      expect(rejected.formatErrors).toHaveLength(1);
      expect(rejected.formatErrors[0]?.field).toBe("quantity");
      expect(rejected.formatErrors[0]?.rowIndex).toBe(1);
      expect(rejected.summary).toBe("오류 1칸 · 전부 거부"); // 04-28 거부 봉투 요약.
      expect(rejected.message).toBe("오류 1칸 · 전부 거부 · [수량] 숫자 형식 오류 · 0보다 큰 수");
    }

    const rows = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revision.id));
    expect(rows).toHaveLength(0); // "정상 줄"도 저장되지 않았다.
  });

  it("(f) 저장 성공은 행동 로그 1행, 거부는 행동 로그 0행을 남긴다", async () => {
    const { revision, subcategoryValue } = await setupProject();

    const before = await countActionLogRows(revision.id);
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      { id: randomUUID(), isNew: true, subcategory: subcategoryValue, itemName: "성공 줄", unitPrice: { currency: "KRW", amount: 100, fxRate: 1 }, execution: { currency: "KRW", amount: 0, fxRate: 1 } },
    ] });
    expect(await countActionLogRows(revision.id)).toBe(before + 1);

    const afterSuccess = await countActionLogRows(revision.id);
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      { id: randomUUID(), isNew: true, subcategory: subcategoryValue, itemName: "거부될 줄", quantity: 0, unitPrice: { currency: "KRW", amount: 100, fxRate: 1 }, execution: { currency: "KRW", amount: 0, fxRate: 1 } },
    ] }).catch(() => undefined);
    expect(await countActionLogRows(revision.id)).toBe(afterSuccess); // 늘지 않았다.
  });
});

// /review PR #128 분리 과제 — 거래처 칸 충돌 이유가 거래처 UUID가 아니라 이름을 보인다. 이름은 거래처 정보라
// project.value · vendor.value를 다 볼 때만(all-of) 싣는다 — 하나라도 없으면 「다른 값」.
describe("domain/quotes/lines saveQuoteLines — 거래처 충돌 이유의 거래처 이름", () => {
  async function createSaver(visible: string[]): Promise<Viewer> {
    const roleId = `role-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: `계급 ${roleId.slice(5, 13)}` });
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "projects", action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "projects", action: "write", allowed: true });
    for (const infoItem of visible) await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem, visible: true });
    const { userId } = await createAccount(SYSTEM_VIEWER, { email: `r-${randomUUID()}@example.test`, name: "통합테스트 계급", roleId });
    return { id: userId, roleId };
  }

  // 줄 하나를 거래처 A로 만들고, 다른 사람이 거래처 B로 바꾼(clear면 비운) 뒤, 옛 버전(거래처 A 기준)으로 항목명만 고쳐 저장한다.
  async function vendorConflict(saver: Viewer, opts?: { clear?: boolean }) {
    const { revision, subcategoryValue } = await setupProject();
    const vendorA = await insertVendor(SYSTEM_VIEWER, { name: `거래처A-${randomUUID()}`, normalizedName: `거래처a-${randomUUID()}` });
    const vendorB = await insertVendor(SYSTEM_VIEWER, { name: `거래처B-${randomUUID()}`, normalizedName: `거래처b-${randomUUID()}` });
    const created = await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      { id: randomUUID(), isNew: true, subcategory: subcategoryValue, itemName: "A", vendorId: vendorA.id, unitPrice: { currency: "KRW", amount: 100, fxRate: 1 }, execution: { currency: "KRW", amount: 0, fxRate: 1 } },
    ] });
    const [line] = created.lines;
    if (!line) throw new Error("setup 실패");
    const baseline: QuoteLineBaseline = {
      subcategory: line.subcategory,
      itemName: line.itemName,
      vendorId: line.vendorId,
      quantity: line.quantity,
      unitPriceAmountKrw: line.unitPrice.amountKrw,
      executionAmountKrw: line.execution.amountKrw,
      lineStatus: line.lineStatus,
      note: line.note,
    };
    const unitPrice = { currency: "KRW" as const, amount: 100, fxRate: 1 };
    const execution = { currency: "KRW" as const, amount: 0, fxRate: 1 };
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      { id: line.id, version: line.version, subcategory: line.subcategory, itemName: line.itemName, vendorId: opts?.clear ? undefined : vendorB.id, unitPrice, execution, baseline },
    ] });
    const rejected = await saveQuoteLines(saver, revision.id, { rows: [
      { id: line.id, version: line.version, subcategory: line.subcategory, itemName: "A 수정", vendorId: vendorA.id, unitPrice, execution, baseline },
    ] }).then(
      () => {
        throw new Error("이 지점에 도달하면 안 된다");
      },
      (error: unknown) => error,
    );
    expect(rejected).toBeInstanceOf(SaveRejectedError);
    return { conflicts: (rejected as SaveRejectedError).conflicts, vendorB };
  }

  function vendorCell(conflicts: SaveRejectedError["conflicts"]) {
    const conflict = conflicts.find((c) => c.field === "vendorId");
    if (!conflict) throw new Error("거래처 칸 충돌이 없다");
    return conflict;
  }

  it("project.value · vendor.value를 다 보는 사람은 충돌 이유에서 바뀐 거래처의 이름을 본다(UUID가 아니다)", async () => {
    const saver = await createSaver(["quote.amount", "project.value", "vendor.value"]);
    const { conflicts, vendorB } = await vendorConflict(saver);
    const conflict = vendorCell(conflicts);
    expect(conflict.reason).not.toContain(vendorB.id);
    expect(conflict.reason).toMatch(new RegExp(`^다른 사람이 \\d{2}:\\d{2}에 ${vendorB.name}으로 바꿈 · 덮어쓰기 / 그 값으로$`));
    expect(conflict.theirRaw).toBe(vendorB.id); // 「그 값으로」는 여전히 id로 받는다.
  });

  it("다른 사람이 거래처를 비우면 충돌 이유는 「—」이다", async () => {
    const saver = await createSaver(["quote.amount", "project.value", "vendor.value"]);
    const conflict = vendorCell((await vendorConflict(saver, { clear: true })).conflicts);
    expect(conflict.theirRaw).toBeNull();
    expect(conflict.reason).toMatch(/^다른 사람이 \d{2}:\d{2}에 —으로 바꿈 · 덮어쓰기 \/ 그 값으로$/);
  });

  it.each([
    ["다 보는 사람은 이름", ["quote.amount", "project.value", "vendor.value"], true],
    ["vendor.value 없으면 「다른 값」", ["quote.amount", "project.value"], false],
  ])("쓰기 시점 경합으로 거래처가 바뀌면 — %s", async (_label, visible, named) => {
    const saver = await createSaver(visible);
    const { revision, subcategoryValue } = await setupProject();
    const vendorB = await insertVendor(SYSTEM_VIEWER, { name: `거래처B-${randomUUID()}`, normalizedName: `거래처b-${randomUUID()}` });
    const created = await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      { id: randomUUID(), isNew: true, subcategory: subcategoryValue, itemName: "A", unitPrice: { currency: "KRW", amount: 100, fxRate: 1 }, execution: { currency: "KRW", amount: 0, fxRate: 1 } },
    ] });
    const [line] = created.lines;
    if (!line) throw new Error("setup 실패");

    const actual = await vi.importActual<typeof import("@/repositories/quote-lines")>("@/repositories/quote-lines");
    vi.mocked(updateQuoteLineIfVersionMatches).mockImplementationOnce(async (viewer, id, expectedVersion, scope, input, tx) => {
      await db.update(quoteLines).set({ vendorId: vendorB.id, version: sql`${quoteLines.version} + 1`, updatedAt: new Date() }).where(eq(quoteLines.id, id));
      return actual.updateQuoteLineIfVersionMatches(viewer, id, expectedVersion, scope, input, tx);
    });
    const baseline: QuoteLineBaseline = {
      subcategory: line.subcategory,
      itemName: line.itemName,
      vendorId: line.vendorId,
      quantity: line.quantity,
      unitPriceAmountKrw: line.unitPrice.amountKrw,
      executionAmountKrw: line.execution.amountKrw,
      lineStatus: line.lineStatus,
      note: line.note,
    };
    const rejected = await saveQuoteLines(saver, revision.id, { rows: [
      { id: line.id, version: line.version, subcategory: line.subcategory, itemName: "A 수정", unitPrice: { currency: "KRW", amount: 100, fxRate: 1 }, execution: { currency: "KRW", amount: 0, fxRate: 1 }, baseline },
    ] }).then(
      () => {
        throw new Error("이 지점에 도달하면 안 된다");
      },
      (error: unknown) => error,
    );
    expect(rejected).toBeInstanceOf(SaveRejectedError);
    const conflict = (rejected as SaveRejectedError).conflicts.find((c) => c.field === "vendorId");
    expect(conflict?.reason).toContain(named ? `${vendorB.name}으로 바꿈` : "다른 값으로 바꿈");
    if (!named) expect(conflict?.reason).not.toContain(vendorB.name);
    expect(conflict?.reason).not.toContain(vendorB.id);
  });

  it("vendor.value 없음 — 거래처 칸을 기존 값으로 지키므로(261001-85g) 거래처 충돌도, 이름 · UUID도 없다", async () => {
    const saver = await createSaver(["quote.amount", "project.value"]);
    const { conflicts, vendorB } = await vendorConflict(saver);
    expect(conflicts.find((c) => c.field === "vendorId")).toBeUndefined();
    expect(JSON.stringify(conflicts)).not.toContain(vendorB.name);
    expect(JSON.stringify(conflicts)).not.toContain(vendorB.id);
  });

  it("project.value 없음 — 충돌 이유에 거래처 이름도 UUID도 싣지 않는다(「다른 값」)", async () => {
    const saver = await createSaver(["quote.amount", "vendor.value"]);
    const { conflicts, vendorB } = await vendorConflict(saver);
    const conflict = vendorCell(conflicts);
    expect(conflict.reason).not.toContain(vendorB.name);
    expect(conflict.reason).not.toContain(vendorB.id);
    expect(conflict.theirValue).not.toContain(vendorB.name);
    expect(conflict.reason).toMatch(/^다른 사람이 \d{2}:\d{2}에 다른 값으로 바꿈 · 덮어쓰기 \/ 그 값으로$/);
  });

  // 거래처 A인 줄 둘을 만들고, 다른 사람이 한 번에 바꾼(change) 뒤, 옛 버전으로 두 줄의 항목명만 고쳐 저장한다. 이름 조회는 거부된 저장에서만 센다.
  async function twoLineConflict(
    saver: Viewer,
    change: (index: number, vendors: { a: string; b: string; c: string }) => { vendorId: string; unitPriceAmount: number },
  ) {
    const { revision, subcategoryValue } = await setupProject();
    const vendorA = await insertVendor(SYSTEM_VIEWER, { name: `거래처A-${randomUUID()}`, normalizedName: `거래처a-${randomUUID()}` });
    const vendorB = await insertVendor(SYSTEM_VIEWER, { name: `거래처B-${randomUUID()}`, normalizedName: `거래처b-${randomUUID()}` });
    const vendorC = await insertVendor(SYSTEM_VIEWER, { name: `거래처C-${randomUUID()}`, normalizedName: `거래처c-${randomUUID()}` });
    const unitPrice = { currency: "KRW" as const, amount: 100, fxRate: 1 };
    const execution = { currency: "KRW" as const, amount: 0, fxRate: 1 };
    const created = await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: ["A1", "A2"].map((itemName) => (
      { id: randomUUID(), isNew: true, subcategory: subcategoryValue, itemName, vendorId: vendorA.id, unitPrice, execution }
    )) });
    const lines = created.lines.map((line) => ({
      line,
      baseline: {
        subcategory: line.subcategory,
        itemName: line.itemName,
        vendorId: line.vendorId,
        quantity: line.quantity,
        unitPriceAmountKrw: line.unitPrice.amountKrw,
        executionAmountKrw: line.execution.amountKrw,
        lineStatus: line.lineStatus,
        note: line.note,
      } satisfies QuoteLineBaseline,
    }));
    expect(lines).toHaveLength(2);
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: lines.map(({ line, baseline }, index) => {
      const next = change(index, { a: vendorA.id, b: vendorB.id, c: vendorC.id });
      return { id: line.id, version: line.version, subcategory: line.subcategory, itemName: line.itemName, vendorId: next.vendorId, unitPrice: { ...unitPrice, amount: next.unitPriceAmount }, execution, baseline };
    }) });
    vi.mocked(findVendorNamesByIds).mockClear();
    const rejected = await saveQuoteLines(saver, revision.id, { rows: lines.map(({ line, baseline }) => (
      { id: line.id, version: line.version, subcategory: line.subcategory, itemName: `${line.itemName} 수정`, vendorId: vendorA.id, unitPrice, execution, baseline }
    )) }).then(
      () => {
        throw new Error("이 지점에 도달하면 안 된다");
      },
      (error: unknown) => error,
    );
    expect(rejected).toBeInstanceOf(SaveRejectedError);
    return { conflicts: (rejected as SaveRejectedError).conflicts, lineIds: lines.map(({ line }) => line.id), vendorB, vendorC };
  }

  it("거래처 칸 충돌 줄이 여럿이어도 거래처 이름은 같은 tx로 한 번만 묶어 조회한다", async () => {
    const saver = await createSaver(["quote.amount", "project.value", "vendor.value"]);
    const { conflicts, lineIds, vendorB, vendorC } = await twoLineConflict(saver, (index, vendors) => (
      { vendorId: index === 0 ? vendors.b : vendors.c, unitPriceAmount: 100 }
    ));
    const vendorConflicts = conflicts.filter((c) => c.field === "vendorId");
    expect(vendorConflicts.map((c) => c.rowId)).toEqual(lineIds);
    expect(vendorConflicts.map((c) => c.theirValue)).toEqual([vendorB.name, vendorC.name]);
    expect(vendorConflicts[0]?.reason).toContain(`${vendorB.name}으로 바꿈`);
    expect(vendorConflicts[1]?.reason).toContain(`${vendorC.name}으로 바꿈`);
    const calls = vi.mocked(findVendorNamesByIds).mock.calls;
    expect(calls).toHaveLength(1);
    expect([...(calls[0]?.[1] ?? [])].sort()).toEqual([vendorB.id, vendorC.id].sort());
    expect(calls[0]?.[2]).toBeDefined();
  });

  it("거래처 칸 충돌이 없으면 거래처 이름을 조회하지 않는다", async () => {
    const saver = await createSaver(["quote.amount", "project.value", "vendor.value"]);
    const { conflicts } = await twoLineConflict(saver, (_index, vendors) => ({ vendorId: vendors.a, unitPriceAmount: 200 }));
    expect(conflicts.map((c) => c.field)).toEqual(["unitPriceAmountKrw", "unitPriceAmountKrw"]);
    expect(findVendorNamesByIds).not.toHaveBeenCalled();
  });
});

// 04-04 Task 2 ③ — 요청 본문 크기 한도(behavior (e)). `lib/actions/client.ts`의
// authedActionClient 미들웨어가 getSession()보다 먼저 이 함수를 부른다
// ("정확히 한 자리") — 세션 없이도 즉시 거부되고 아무 줄도 저장되지 않는다.
// "use server" 액션 파일은 lib/viewer.ts의 server-only 가드 때문에
// vitest에서 직접 import할 수 없어(즉시 throw), 판정 로직을 분리한
// 순수 함수를 직접 부른다 — 실제 배선은 lib/actions/client.ts를 읽어 확인한다.
describe("checkPayloadSize — 요청 본문 크기 한도(04-04 Task 2 ③)", () => {
  it("한도 이하는 통과한다", () => {
    expect(checkPayloadSize({ rows: [{ id: randomUUID(), isNew: true, itemName: "짧은 값" }] })).toEqual({ ok: true });
  });

  it("한도를 넘는 배치는 이유 문자열과 함께 거부된다(KB·한도 표기 포함)", () => {
    const hugeNote = "x".repeat(400_000); // MAX_ACTION_PAYLOAD_BYTES(256KB)를 확실히 넘는다.
    const result = checkPayloadSize({ rows: [{ id: randomUUID(), isNew: true, note: hugeNote }] });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toContain("KB");
    expect(result.reason).toContain("한도");
    expect(result.bytes).toBeGreaterThan(MAX_ACTION_PAYLOAD_BYTES);
  });
});
