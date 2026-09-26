import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { actionLog, projects, quoteRevisions, quoteLines, codeItems, teams } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertFieldDefinition } from "@/repositories/field-definitions";
import { aggregateProjects, createProject, listProjects } from "@/domain/projects";
import {
  getCurrentQuoteRevision,
  listQuoteLines,
  quoteLineRowInputSchema,
  quoteLinesInputSchema,
  restoreQuoteLine,
  saveQuoteLines,
  SaveRejectedError,
  type QuoteLineWriteRow,
} from "@/domain/quotes/lines";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { log } from "@/lib/log";
import { GateBlockedError } from "@/domain/rules/gate";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { getSettingValue } from "@/domain/settings/registry";
import { FX_RECENT_RATE_USD } from "@/domain/settings/keys";
import { listArchivedAcrossEntities } from "@/repositories/archive";
import { restore } from "@/domain/archive";
import { changeProjectStatus } from "@/domain/projects/status";
import type { Viewer } from "@/domain/viewer";
import { addDays, kstToday } from "@/lib/kst-date";
import { deferred, waitForLockWaiter } from "./lock-race";
import { createRevisionFromCurrent } from "@/domain/quotes/revisions";
import { revenueEntries } from "@/db/schema";
import { saveProjectLedgerAction } from "@/app/(app)/projects/actions";

// 04-40(W3) — 거부 봉투를 액션으로 직접 확인하는 케이스용 세션. 이 파일의 다른 케이스는 액션을 부르지 않는다.
vi.mock("@/lib/viewer", async () => {
  const { SYSTEM_VIEWER: viewer } = await import("@/domain/viewer");
  return { getSession: () => Promise.resolve({ viewer, user: { id: viewer.id } }) };
});

const QUOTE_LINE_ENTITY = "quote_line";

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
  // 기획1팀(domain/seed ORG_SEED)이 항상 있다 — teams에서 아무 팀이나 하나 가져온다.
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다 — domain/seed ORG_SEED 확인 필요");

  const [subcategory] = await db
    .select()
    .from(codeItems)
    .where(eq(codeItems.tableKey, "quote_subcategory"))
    .limit(1);
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");

  const project = await createProject(SYSTEM_VIEWER, {
    clientId: client.id,
    teamId: team.id,
    pmUserId,
    name: `프로젝트-${randomUUID()}`,
  });

  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("createProject가 1차 차수를 만들지 않았습니다(D-53 위반)");

  return { project, revision, subcategoryValue: subcategory.value };
}

// Phase 4 Task 3 ③ — PROJ-02: 조작된 저장 페이로드, 미등록 custom_fields,
// 완료(정산) 게이트 거부, 연결된 행 삭제의 실제 FK 제약 동작 네 가지를
// 통합 테스트로 못박는다.
describe("domain/quotes/lines saveQuoteLines (Phase 4, 실제 Postgres)", () => {
  it("(a) 조작된 견적가·차익 값을 실은 페이로드로 저장해도 서버 재계산값이 저장된다", async () => {
    const { revision, subcategoryValue } = await setupProject();

    const result = await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      {
        id: randomUUID(), isNew: true, subcategory: subcategoryValue,
        itemName: "메인 스테이지 구조물 설치",
        quantity: 3,
        unitPrice: { currency: "KRW", amount: 1_200_000, fxRate: 1 },
        execution: { currency: "KRW", amount: 2_800_000, fxRate: 1 },
        // 타입에 없는 필드를 raw 객체로 흉내낸다 — 브라우저가 조작해 보낼 수 있는 값.
        ...({ quoteAmountKrw: 999_999_999, profitKrw: -999_999_999 } as Record<string, unknown>),
      },
    ] });

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.quoteAmountKrw).toBe(3_600_000);
    expect(result.lines[0]?.profitKrw).toBe(800_000);

    const [row] = await db.select().from(quoteLines).where(eq(quoteLines.id, result.lines[0]!.id));
    expect(row?.quoteAmountKrw).toBe(3_600_000);
    expect(row?.profitKrw).toBe(800_000);
  });

  it("(b) 미등록 custom_fields 키가 거부된다", async () => {
    const { revision, subcategoryValue } = await setupProject();

    await insertFieldDefinition(SYSTEM_VIEWER, {
      id: `fd-${randomUUID()}`,
      entity: QUOTE_LINE_ENTITY,
      key: "registeredKey",
      type: "text",
      required: false,
    });

    await expect(
      saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
        {
          id: randomUUID(), isNew: true, subcategory: subcategoryValue,
          itemName: "항목",
          unitPrice: { currency: "KRW", amount: 100_000, fxRate: 1 },
          execution: { currency: "KRW", amount: 50_000, fxRate: 1 },
          customFields: { registeredKey: "값", unregisteredKey: "거부되어야 한다" },
        },
      ] }),
    ).rejects.toThrow();
  });

  it("(c) 완료 프로젝트의 줄 저장이 게이트 이유 문자열과 함께 거부된다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();

    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, project.id));

    const attempt = saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      {
        id: randomUUID(), isNew: true, subcategory: subcategoryValue,
        itemName: "완료 후 시도",
        unitPrice: { currency: "KRW", amount: 100_000, fxRate: 1 },
        execution: { currency: "KRW", amount: 0, fxRate: 1 },
      },
    ] });

    await expect(attempt).rejects.toBeInstanceOf(GateBlockedError);
    await expect(attempt).rejects.toBeInstanceOf(UserFacingError);
    await expect(attempt).rejects.toThrow("완료 · 견적 줄 잠김");
  });

  it("(c2) 미수주 프로젝트의 줄 저장은 막히지 않는다(D-45)", async () => {
    const { project, revision, subcategoryValue } = await setupProject();

    await db.update(projects).set({ status: "lost" }).where(eq(projects.id, project.id));

    const { lines } = await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      {
        id: randomUUID(), isNew: true, subcategory: subcategoryValue,
        itemName: "미수주 뒤 도착한 청구",
        unitPrice: { currency: "KRW", amount: 100_000, fxRate: 1 },
        execution: { currency: "KRW", amount: 30_000, fxRate: 1 },
      },
    ] });

    expect(lines.map((line) => line.itemName)).toEqual(["미수주 뒤 도착한 청구"]);
  });

  it("(d) 연결된 줄이 있는 차수를 지우려 하면 실제 외래키 제약(RESTRICT)이 막는다", async () => {
    const { revision, subcategoryValue } = await setupProject();

    await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      {
        id: randomUUID(), isNew: true, subcategory: subcategoryValue,
        itemName: "연결 문서 시뮬레이션 줄",
        unitPrice: { currency: "KRW", amount: 100_000, fxRate: 1 },
        execution: { currency: "KRW", amount: 0, fxRate: 1 },
      },
    ] });

    // 모의 객체가 아니라 실제 DB 제약 동작 — quote_lines.revision_id는
    // onDelete: "restrict"라 연결된 줄이 있는 차수를 직접 지우면 Postgres가
    // 외래키 위반으로 거부한다. Drizzle의 DrizzleQueryError는 원본 pg 오류를
    // .cause에 싣는다(message 자체는 "Failed query: ..."일 뿐이다) — 실제
    // 위반은 Postgres 오류 코드 23503(foreign_key_violation)로 확인한다.
    let caught: unknown;
    try {
      await db.delete(quoteRevisions).where(eq(quoteRevisions.id, revision.id));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const cause = (caught as { cause?: { code?: string; message?: string } }).cause;
    expect(cause?.code).toBe("23503");
    expect(cause?.message).toMatch(/foreign key constraint|violates foreign key/i);
  });

  // 04-02(D-71) — 단가 환율 칸을 실제로 고친 저장만 fx.recent_rate.USD를
  // 갱신한다. 건드리지 않은 저장은 갱신하지 않는다.
  it("(e) 단가 환율을 고쳐 저장하면 fx.recent_rate.USD가 갱신되고, 건드리지 않은 저장은 갱신하지 않는다", async () => {
    const { revision, subcategoryValue } = await setupProject();

    await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      {
        id: randomUUID(), isNew: true, subcategory: subcategoryValue,
        itemName: "외화 줄",
        unitPrice: { currency: "USD", amount: 100, fxRate: 1350.25 },
        unitPriceFxRateTouched: true,
        execution: { currency: "KRW", amount: 0, fxRate: 1 },
      },
    ] });
    expect(await getSettingValue(FX_RECENT_RATE_USD)).toBe(1350.25);

    // 다른 값으로 다시 저장하되 fxRateTouched: false — 설정이 그대로다.
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      {
        id: randomUUID(), isNew: true, subcategory: subcategoryValue,
        itemName: "외화 줄 2",
        unitPrice: { currency: "USD", amount: 200, fxRate: 1400.0 },
        unitPriceFxRateTouched: false,
        execution: { currency: "KRW", amount: 0, fxRate: 1 },
      },
    ] });
    expect(await getSettingValue(FX_RECENT_RATE_USD)).toBe(1350.25);
  });
});

// ── 04-12(D-78 · 사용자 D10·D12 · CEO A-03·A-21·B-01 · 엔지 리뷰 A §2 P2) ──────────────────────
type SeedLine = {
  sortOrder: number;
  itemName: string;
  quantity?: string;
  unitPrice?: { currency: "KRW" | "USD"; foreignAmount: string | null; fxRate: string; amountKrw: number };
  executionKrw?: number;
  note?: string | null;
};

async function seedLine(revisionId: string, subcategory: string, line: SeedLine) {
  const unitPrice = line.unitPrice ?? { currency: "KRW" as const, foreignAmount: null, fxRate: "1.0000", amountKrw: 100_000 };
  const quantity = line.quantity ?? "1.00";
  const quoteAmountKrw = Math.round(Number(quantity) * unitPrice.amountKrw);
  const executionKrw = line.executionKrw ?? 50_000;
  const [row] = await db
    .insert(quoteLines)
    .values({
      revisionId,
      sortOrder: line.sortOrder,
      subcategory,
      itemName: line.itemName,
      quantity,
      unitPriceCurrency: unitPrice.currency,
      unitPriceForeignAmount: unitPrice.foreignAmount,
      unitPriceFxRate: unitPrice.fxRate,
      unitPriceAmountKrw: unitPrice.amountKrw,
      executionCurrency: "KRW",
      executionForeignAmount: null,
      executionFxRate: "1.0000",
      executionAmountKrw: executionKrw,
      quoteAmountKrw,
      profitKrw: quoteAmountKrw - executionKrw,
      note: line.note ?? null,
    })
    .returning();
  if (!row) throw new Error("줄 준비 실패");
  return row;
}

async function setStatus(projectId: string, status: string) {
  await db.update(projects).set({ status }).where(eq(projects.id, projectId));
}

async function reloadLine(id: string) {
  const [row] = await db.select().from(quoteLines).where(eq(quoteLines.id, id));
  if (!row) throw new Error("줄이 없습니다");
  return row;
}

// 기존 줄을 DB 값 그대로 싣고 바꿀 칸만 덮는다(화면이 보내는 모양).
function asInput(row: typeof quoteLines.$inferSelect, patch: Partial<QuoteLineWriteRow> = {}): QuoteLineWriteRow {
  return {
    id: row.id,
    version: row.version,
    subcategory: row.subcategory,
    itemName: row.itemName,
    quantity: Number(row.quantity),
    unitPrice: {
      currency: row.unitPriceCurrency as "KRW" | "USD",
      amount: row.unitPriceCurrency === "KRW" ? row.unitPriceAmountKrw : Number(row.unitPriceForeignAmount),
      fxRate: Number(row.unitPriceFxRate),
    },
    execution: { currency: "KRW", amount: row.executionAmountKrw, fxRate: 1 },
    lineStatus: row.lineStatus,
    ...patch,
  };
}

function deniedCalls(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.filter(([event]) => event === "write.denied").map(([, fields]) => fields as Record<string, unknown>);
}

describe("정산 편집 매트릭스(D10·D12)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(a) 정산 프로젝트에서 실행가만 바꾼 저장은 통과하고 그 줄의 sort_order는 그대로다(A-03)", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "첫 줄" });
    const target = await seedLine(revision.id, subcategoryValue, { sortOrder: 5, itemName: "실행가 고칠 줄" });
    await setStatus(project.id, "settling");

    await saveProjectLedger(SYSTEM_VIEWER, project.id, {
      seenStatus: "settling",
      quoteLines: { revisionId: revision.id, rows: [asInput(target, { execution: { currency: "KRW", amount: 70_000, fxRate: 1 } })] },
    });

    const after = await reloadLine(target.id);
    expect(after.executionAmountKrw).toBe(70_000);
    expect(after.sortOrder).toBe(5);
  });

  it("(b) 정산에서 단가를 같이 바꾼 조작 페이로드는 전부 거부되고 write.denied가 한 번, 금액 키가 없다(B-26)", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const target = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "조작 대상" });
    await setStatus(project.id, "settling");
    const warn = vi.spyOn(log, "warn");

    const outcome = await saveProjectLedger(SYSTEM_VIEWER, project.id, {
      seenStatus: "settling",
      quoteLines: {
        revisionId: revision.id,
        rows: [
          asInput(target, {
            unitPrice: { currency: "KRW", amount: 999_000, fxRate: 1 },
            execution: { currency: "KRW", amount: 70_000, fxRate: 1 },
          }),
        ],
      },
    }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(outcome).toBeInstanceOf(SaveRejectedError);
    expect(String(outcome)).toContain("정산 · 실행가와 새 줄만");
    const after = await reloadLine(target.id);
    expect(after.unitPriceAmountKrw).toBe(100_000);
    expect(after.executionAmountKrw).toBe(50_000);
    const denied = deniedCalls(warn);
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({ rule: "project.line-edit", projectId: project.id, revisionId: revision.id });
    expect(Object.keys(denied[0] ?? {}).filter((key) => /amount|krw|price|execution/i.test(key))).toEqual([]);
  });

  it("(c) 완료에서 비고만 바꾼 저장도 「완료 · 견적 줄 잠김」으로 거부된다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const target = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "완료 줄" });
    await setStatus(project.id, "completed");

    const attempt = saveProjectLedger(SYSTEM_VIEWER, project.id, {
      seenStatus: "completed",
      quoteLines: { revisionId: revision.id, rows: [asInput(target, { note: "완료 뒤 비고" })] },
    });

    await expect(attempt).rejects.toThrow("완료 · 견적 줄 잠김");
    expect((await reloadLine(target.id)).note).toBeNull();
  });

  it("(c3) 완료에서 값이 그대로인 줄을 다시 보낸 저장은 아무것도 쓰지 않는다 — version·updated_at·문서 수정 로그 그대로(D-47)", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const target = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "완료 그대로" });
    await setStatus(project.id, "completed");
    const logsBefore = await actionCount(QUOTE_LINE_ENTITY, revision.id, "document_update");

    await saveProjectLedger(SYSTEM_VIEWER, project.id, {
      seenStatus: "completed",
      quoteLines: { revisionId: revision.id, rows: [asInput(target)] },
    });

    const row = await reloadLine(target.id);
    expect(row.version).toBe(target.version);
    expect(row.updatedAt).toEqual(target.updatedAt);
    expect(await actionCount(QUOTE_LINE_ENTITY, revision.id, "document_update")).toBe(logsBefore);
  });

  it("(d) 정산에서 환율 1350·수량 2·비고 undefined를 실어 실행가만 바꾼 저장은 헛거부되지 않는다(A-21)", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const target = await seedLine(revision.id, subcategoryValue, {
      sortOrder: 0,
      itemName: "외화 줄",
      quantity: "2.00",
      unitPrice: { currency: "USD", foreignAmount: "100.00", fxRate: "1350.0000", amountKrw: 135_000 },
      note: null,
    });
    await setStatus(project.id, "settling");

    await saveProjectLedger(SYSTEM_VIEWER, project.id, {
      seenStatus: "settling",
      quoteLines: {
        revisionId: revision.id,
        rows: [
          asInput(target, {
            quantity: 2,
            unitPrice: { currency: "USD", amount: 100, fxRate: 1350 },
            note: undefined,
            execution: { currency: "KRW", amount: 90_000, fxRate: 1 },
          }),
        ],
      },
    });

    const after = await reloadLine(target.id);
    expect(after.executionAmountKrw).toBe(90_000);
    expect(after.unitPriceFxRate).toBe("1350.0000");
  });

  it("(e) 진행에서 3줄 중 3번째 줄만 고쳐 저장해도 세 줄 순서가 그대로이고 결과 lines가 3줄이다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const first = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "하나" });
    const second = await seedLine(revision.id, subcategoryValue, { sortOrder: 1, itemName: "둘" });
    const third = await seedLine(revision.id, subcategoryValue, { sortOrder: 2, itemName: "셋" });
    await setStatus(project.id, "in_progress");

    const result = await saveProjectLedger(SYSTEM_VIEWER, project.id, {
      seenStatus: "in_progress",
      quoteLines: { revisionId: revision.id, rows: [asInput(third, { itemName: "셋 고침" })] },
    });

    expect(result.quoteLines?.lines.map((line) => line.id)).toEqual([first.id, second.id, third.id]);
    expect(result.quoteLines?.lines.map((line) => line.itemName)).toEqual(["하나", "둘", "셋 고침"]);
    expect((await reloadLine(third.id)).sortOrder).toBe(2);
  });

  it("(f) 다른 프로젝트 줄 id를 섞은 배치는 전부 거부되고 두 프로젝트 줄이 그대로다(B-01)", async () => {
    const a = await setupProject();
    const b = await setupProject();
    const own = await seedLine(a.revision.id, a.subcategoryValue, { sortOrder: 0, itemName: "A 줄" });
    const foreign = await seedLine(b.revision.id, b.subcategoryValue, { sortOrder: 0, itemName: "B 줄" });
    const warn = vi.spyOn(log, "warn");

    const attempt = saveProjectLedger(SYSTEM_VIEWER, a.project.id, {
      seenStatus: "bidding",
      quoteLines: {
        revisionId: a.revision.id,
        rows: [asInput(own, { itemName: "A 고침" }), asInput(foreign, { itemName: "탈취" })],
      },
    });

    await expect(attempt).rejects.toThrow("차수와 프로젝트가 맞지 않음 · 새로 고침");
    expect((await reloadLine(own.id)).itemName).toBe("A 줄");
    expect((await reloadLine(foreign.id)).itemName).toBe("B 줄");
    expect(deniedCalls(warn).map((fields) => fields.rule)).toEqual(["quote.line-membership"]);
  });

  // 04-12 Task 2(사용자 D10·D12 · 엔지 리뷰 A §2 P1) — 정산 구조 판정.
  it("(g) 정산에서 단가 원화 0 · 수량 없음인 새 줄(실행가 300,000)은 통과하고 DB에 수량 1 · 견적가 0 · 실행가 300,000", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const existing = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "기존" });
    await setStatus(project.id, "settling");
    const added = newRow(subcategoryValue, { itemName: "정산 추가 실행", execution: krw(300_000) });

    await saveProjectLedger(SYSTEM_VIEWER, project.id, {
      seenStatus: "settling",
      quoteLines: { revisionId: revision.id, rows: [asInput(existing), added] },
    });

    const row = await reloadLine(added.id);
    expect(row.quantity).toBe("1.00");
    expect(row.quoteAmountKrw).toBe(0);
    expect(row.executionAmountKrw).toBe(300_000);
  });

  it("(h) 정산에서 단가 1,000원인 새 줄 · 수량 2인 새 줄 · 상태가 취소인 새 줄은 각각 「정산 · 새 줄은 실행가만」으로 전부 거부된다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const existing = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "기존" });
    await setStatus(project.id, "settling");

    for (const patch of [{ unitPrice: krw(1_000) }, { quantity: 2 }, { lineStatus: "cancelled" }]) {
      const attempt = saveProjectLedger(SYSTEM_VIEWER, project.id, {
        seenStatus: "settling",
        quoteLines: {
          revisionId: revision.id,
          rows: [asInput(existing, { execution: krw(60_000) }), newRow(subcategoryValue, patch)],
        },
      });
      await expect(attempt).rejects.toThrow("정산 · 새 줄은 실행가만");
    }
    expect(await activeIds(revision.id)).toEqual([existing.id]);
    expect((await reloadLine(existing.id)).executionAmountKrw).toBe(50_000);
  });

  it("(i) 정산에서 보관·기존 줄 순서 바꾸기는 「정산 · 줄 삭제·이동 없음」, 기존 순서를 지키고 새 줄을 가운데 끼운 order는 통과", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const first = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "하나" });
    const second = await seedLine(revision.id, subcategoryValue, { sortOrder: 1, itemName: "둘" });
    await setStatus(project.id, "settling");

    await expect(
      saveProjectLedger(SYSTEM_VIEWER, project.id, {
        seenStatus: "settling",
        quoteLines: { revisionId: revision.id, rows: [], archivedLineIds: [second.id] },
      }),
    ).rejects.toThrow("정산 · 줄 삭제·이동 없음");
    await expect(
      saveProjectLedger(SYSTEM_VIEWER, project.id, {
        seenStatus: "settling",
        quoteLines: { revisionId: revision.id, rows: [], order: [second.id, first.id] },
      }),
    ).rejects.toThrow("정산 · 줄 삭제·이동 없음");
    expect(await activeIds(revision.id)).toEqual([first.id, second.id]);

    const middle = newRow(subcategoryValue, { itemName: "가운데" });
    await saveProjectLedger(SYSTEM_VIEWER, project.id, {
      seenStatus: "settling",
      quoteLines: { revisionId: revision.id, rows: [middle], order: [first.id, middle.id, second.id] },
    });
    expect(await activeIds(revision.id)).toEqual([first.id, middle.id, second.id]);
  });

  it("(j) 완료에서 새 줄·보관은 「완료 · 견적 줄 잠김」으로 거부된다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const existing = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "완료 줄" });
    await setStatus(project.id, "completed");

    await expect(
      saveProjectLedger(SYSTEM_VIEWER, project.id, {
        seenStatus: "completed",
        quoteLines: { revisionId: revision.id, rows: [newRow(subcategoryValue)] },
      }),
    ).rejects.toThrow("완료 · 견적 줄 잠김");
    await expect(
      saveProjectLedger(SYSTEM_VIEWER, project.id, {
        seenStatus: "completed",
        quoteLines: { revisionId: revision.id, rows: [], archivedLineIds: [existing.id] },
      }),
    ).rejects.toThrow("완료 · 견적 줄 잠김");
    expect(await activeIds(revision.id)).toEqual([existing.id]);
  });
});

const krw = (amount: number) => ({ currency: "KRW" as const, amount, fxRate: 1 });

// 화면이 만든 uuid를 실은 새 줄(ENG-D10). 기본은 정산에서도 통과하는 견적 칸 0(원화 단가 0 · 수량 없음).
function newRow(subcategory: string, patch: Partial<QuoteLineWriteRow> = {}): QuoteLineWriteRow {
  return { id: randomUUID(), isNew: true, subcategory, itemName: `새 줄-${randomUUID()}`, unitPrice: krw(0), execution: krw(10_000), ...patch };
}

async function activeIds(revisionId: string): Promise<string[]> {
  const rows = await db
    .select({ id: quoteLines.id })
    .from(quoteLines)
    .where(and(eq(quoteLines.revisionId, revisionId), isNull(quoteLines.archivedAt)))
    .orderBy(asc(quoteLines.sortOrder), asc(quoteLines.id));
  return rows.map((row) => row.id);
}

async function listedIds(revisionId: string, status: string): Promise<string[]> {
  return (await listQuoteLines(SYSTEM_VIEWER, revisionId, { status, canWrite: true })).map((line) => line.id);
}

describe("순서·재전송(엔지 리뷰 A · ENG-D10)", () => {
  it("(u) 진행에서 한 줄을 가운데에 복제하고 다른 줄을 보관한 저장 뒤 두 번 읽어도 화면 순서와 같다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const first = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "하나" });
    const second = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "둘" });
    const third = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "셋" });
    await setStatus(project.id, "in_progress");
    const [a, b] = [first, second, third].sort((x, y) => x.id.localeCompare(y.id));
    const archived = [first, second, third].find((line) => line.id !== a!.id && line.id !== b!.id)!;
    const copy = newRow(subcategoryValue, { itemName: `${b!.itemName} 복제`, duplicatedFrom: b!.id });
    const screenOrder = [b!.id, copy.id, a!.id];

    await saveProjectLedger(SYSTEM_VIEWER, project.id, {
      seenStatus: "in_progress",
      quoteLines: { revisionId: revision.id, rows: [copy], order: screenOrder, archivedLineIds: [archived.id] },
    });

    expect(await listedIds(revision.id, "in_progress")).toEqual(screenOrder);
    expect(await listedIds(revision.id, "in_progress")).toEqual(screenOrder);
    expect((await reloadLine(a!.id)).version).toBe(a!.version);
  });

  it("(u2) 보관 뒤 order 없이 새 줄을 더하면 그 줄이 마지막이다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const first = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "하나" });
    const last = await seedLine(revision.id, subcategoryValue, { sortOrder: 1, itemName: "마지막" });
    await saveProjectLedger(SYSTEM_VIEWER, project.id, {
      seenStatus: "bidding",
      quoteLines: { revisionId: revision.id, rows: [], archivedLineIds: [last.id] },
    });

    const added = newRow(subcategoryValue);
    await saveProjectLedger(SYSTEM_VIEWER, project.id, {
      seenStatus: "bidding",
      quoteLines: { revisionId: revision.id, rows: [added] },
    });
    expect(await activeIds(revision.id)).toEqual([first.id, added.id]);
  });

  it("(u3) order가 활성 줄 집합과 다르면 「줄 순서가 맞지 않음 · 새로 고침」으로 전부 거부된다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const first = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "하나" });
    const second = await seedLine(revision.id, subcategoryValue, { sortOrder: 1, itemName: "둘" });
    const added = newRow(subcategoryValue);

    await expect(
      saveProjectLedger(SYSTEM_VIEWER, project.id, {
        seenStatus: "bidding",
        quoteLines: { revisionId: revision.id, rows: [asInput(first, { itemName: "고침" }), added], order: [second.id, added.id] },
      }),
    ).rejects.toThrow("줄 순서가 맞지 않음 · 새로 고침");
    expect(await activeIds(revision.id)).toEqual([first.id, second.id]);
    expect((await reloadLine(first.id)).itemName).toBe("하나");
  });

  it("(w) 새 줄 둘을 실은 배치를 같은 id로 다시 보내면 둘째도 성공이고 줄은 두 개만 늘었으며 문서 수정 로그도 늘지 않는다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const batch = [newRow(subcategoryValue, { itemName: "재전송 하나", note: "" }), newRow(subcategoryValue, { itemName: "재전송 둘", quantity: 2, unitPrice: krw(5_000) })];
    const save = () =>
      saveProjectLedger(SYSTEM_VIEWER, project.id, { seenStatus: "bidding", quoteLines: { revisionId: revision.id, rows: batch } });

    await save();
    const logsAfterFirst = await actionCount(QUOTE_LINE_ENTITY, revision.id, "document_update");
    const second = await save();

    expect(await activeIds(revision.id)).toHaveLength(2);
    expect(await actionCount(QUOTE_LINE_ENTITY, revision.id, "document_update")).toBe(logsAfterFirst);
    expect(second.quoteLines?.lines.map((line) => line.id).sort()).toEqual(batch.map((row) => row.id).sort());
  });

  it("(w2) 다른 프로젝트 차수에 이미 있는 줄 id를 isNew로 실은 배치는 소속 거부로 전부 거부된다", async () => {
    const a = await setupProject();
    const b = await setupProject();
    const foreign = await seedLine(b.revision.id, b.subcategoryValue, { sortOrder: 0, itemName: "B 줄" });
    const own = newRow(a.subcategoryValue);

    await expect(
      saveProjectLedger(SYSTEM_VIEWER, a.project.id, {
        seenStatus: "bidding",
        quoteLines: { revisionId: a.revision.id, rows: [own, newRow(a.subcategoryValue, { id: foreign.id, itemName: "B 줄" })] },
      }),
    ).rejects.toThrow("차수와 프로젝트가 맞지 않음 · 새로 고침");
    expect(await activeIds(a.revision.id)).toEqual([]);
    expect((await reloadLine(foreign.id)).revisionId).toBe(b.revision.id);
  });

  it("(w3) 같은 id를 다른 실행가로 다시 보낸 배치는 「이미 저장된 줄과 값이 다름 · 새로 고침」으로 전부 거부되고 DB 값이 첫 저장 그대로다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const row = newRow(subcategoryValue, { execution: krw(40_000) });
    await saveProjectLedger(SYSTEM_VIEWER, project.id, { seenStatus: "bidding", quoteLines: { revisionId: revision.id, rows: [row] } });
    const warn = vi.spyOn(log, "warn");

    await expect(
      saveProjectLedger(SYSTEM_VIEWER, project.id, {
        seenStatus: "bidding",
        quoteLines: { revisionId: revision.id, rows: [{ ...row, execution: krw(41_000) }] },
      }),
    ).rejects.toThrow("이미 저장된 줄과 값이 다름 · 새로 고침");
    expect((await reloadLine(row.id)).executionAmountKrw).toBe(40_000);
    expect(deniedCalls(warn).map((fields) => fields.rule)).toEqual(["quote.line-replay"]);
    warn.mockRestore();
  });
});

describe("재전송 — 보관된 줄(ENG-D10 · 검토 S5)", () => {
  it("(w4) 저장 뒤 보관된 새 줄을 같은 id·같은 값으로 isNew 재전송하면 소속 거부로 전부 거부되고 줄은 보관 그대로다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const row = newRow(subcategoryValue, { itemName: "보관될 새 줄" });
    await saveProjectLedger(SYSTEM_VIEWER, project.id, { seenStatus: "bidding", quoteLines: { revisionId: revision.id, rows: [row] } });
    await saveProjectLedger(SYSTEM_VIEWER, project.id, {
      seenStatus: "bidding",
      quoteLines: { revisionId: revision.id, rows: [], archivedLineIds: [row.id] },
    });

    await expect(
      saveProjectLedger(SYSTEM_VIEWER, project.id, { seenStatus: "bidding", quoteLines: { revisionId: revision.id, rows: [row] } }),
    ).rejects.toThrow("차수와 프로젝트가 맞지 않음 · 새로 고침");
    expect((await reloadLine(row.id)).archivedAt).toBeInstanceOf(Date);
    expect(await activeIds(revision.id)).toEqual([]);
  });
});

describe("보관·취소(D-56·A-04)", () => {
  it("(k) 수주중에서 보관한 줄은 DB에 남아 archived_at이 채워지고 보관함에 나오며, 줄 목록·프로젝트 목록·합계에서 빠진다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const kept = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "남는 줄", executionKrw: 30_000 });
    const gone = await seedLine(revision.id, subcategoryValue, { sortOrder: 1, itemName: `보관 줄-${randomUUID()}`, executionKrw: 70_000 });

    await saveProjectLedger(SYSTEM_VIEWER, project.id, {
      seenStatus: "bidding",
      quoteLines: { revisionId: revision.id, rows: [], archivedLineIds: [gone.id] },
    });

    const row = await reloadLine(gone.id);
    expect(row.archivedAt).toBeInstanceOf(Date);
    expect(row.archivedBy).toBe(SYSTEM_VIEWER.id);
    const archivedList = await listArchivedAcrossEntities(SYSTEM_VIEWER);
    expect(archivedList.find((item) => item.id === gone.id)).toMatchObject({ entity: "quote_line", label: "견적 줄", name: gone.itemName });
    expect(await listedIds(revision.id, "bidding")).toEqual([kept.id]);

    const [listed] = await listProjects(SYSTEM_VIEWER, { filter: { search: project.name } });
    expect(listed).toMatchObject({ quoteAmountKrw: 100_000, executionAmountKrw: 30_000 });
    const aggregate = await aggregateProjects(SYSTEM_VIEWER, { search: project.name });
    expect(aggregate).toMatchObject({ count: 1, quoteAmountKrw: 100_000, executionAmountKrw: 30_000 });
  });

  it("(l) 보관된 줄 id로 고치는 배치는 「보관된 줄 · 새로 고침」으로 전부 거부된다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const line = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "보관될 줄" });
    await saveProjectLedger(SYSTEM_VIEWER, project.id, {
      seenStatus: "bidding",
      quoteLines: { revisionId: revision.id, rows: [], archivedLineIds: [line.id] },
    });

    await expect(
      saveProjectLedger(SYSTEM_VIEWER, project.id, {
        seenStatus: "bidding",
        quoteLines: { revisionId: revision.id, rows: [asInput(line, { itemName: "보관 뒤 고침" })] },
      }),
    ).rejects.toThrow("보관된 줄 · 새로 고침");
    expect((await reloadLine(line.id)).itemName).toBe("보관될 줄");
  });

  it("(m) 버전 충돌로 거부된 배치에서는 함께 실은 보관도 일어나지 않고, 보관 뒤 같은 tx의 로그가 실패해도 보관이 되돌아간다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const toArchive = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "보관 시도" });
    const stale = await seedLine(revision.id, subcategoryValue, { sortOrder: 1, itemName: "낡은 줄" });
    await db.update(quoteLines).set({ version: stale.version + 1 }).where(eq(quoteLines.id, stale.id));

    await expect(
      saveProjectLedger(SYSTEM_VIEWER, project.id, {
        seenStatus: "bidding",
        quoteLines: { revisionId: revision.id, rows: [asInput(stale, { itemName: "고침" })], archivedLineIds: [toArchive.id] },
      }),
    ).rejects.toBeInstanceOf(SaveRejectedError);
    expect((await reloadLine(toArchive.id)).archivedAt).toBeNull();

    // 사전 판정을 통과해 보관 단계까지 간 뒤 로그(같은 tx)가 실패하면 보관도 되돌아간다 — 보관이 tx 밖이면 빨강(검토 S6).
    await expect(
      saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [], archivedLineIds: [toArchive.id] }, { recordAction: () => Promise.reject(new Error("로그 실패")) }),
    ).rejects.toThrow("로그 실패");
    expect((await reloadLine(toArchive.id)).archivedAt).toBeNull();
  });

  it("(n) 취소 줄의 견적가는 0이고 수량·단가 컬럼은 그대로다(PROJ-02)", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const line = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "취소할 줄", quantity: "2.00" });

    await saveProjectLedger(SYSTEM_VIEWER, project.id, {
      seenStatus: "bidding",
      quoteLines: { revisionId: revision.id, rows: [asInput(line, { lineStatus: "cancelled" })] },
    });

    const row = await reloadLine(line.id);
    expect(row.lineStatus).toBe("cancelled");
    expect(row.quoteAmountKrw).toBe(0);
    expect(row.profitKrw).toBe(-50_000);
    expect(row.quantity).toBe("2.00");
    expect(row.unitPriceAmountKrw).toBe(100_000);
  });

  it("(o) 줄 상태 「아무글자」·줄 id 「x」·보관 id 「x」 입력은 검증 오류다(A-37)", () => {
    const valid = { id: randomUUID(), isNew: true, subcategory: "s", itemName: "항목", unitPrice: krw(0), execution: krw(0) };
    expect(quoteLineRowInputSchema.safeParse(valid).success).toBe(true);
    expect(quoteLineRowInputSchema.safeParse({ ...valid, lineStatus: "아무글자" }).success).toBe(false);
    expect(quoteLineRowInputSchema.safeParse({ ...valid, lineStatus: "cancelled" }).success).toBe(true);
    expect(quoteLineRowInputSchema.safeParse({ ...valid, id: "x" }).success).toBe(false);
    const withoutIsNew = { ...valid, isNew: undefined };
    expect(quoteLineRowInputSchema.safeParse(withoutIsNew).success).toBe(false);
    expect(quoteLineRowInputSchema.safeParse({ ...withoutIsNew, version: 1 }).success).toBe(true);
    const lines = { revisionId: randomUUID(), rows: [valid] };
    expect(quoteLinesInputSchema.safeParse(lines).success).toBe(true);
    expect(quoteLinesInputSchema.safeParse({ ...lines, archivedLineIds: ["x"] }).success).toBe(false);
    expect(quoteLinesInputSchema.safeParse({ ...lines, order: ["x"] }).success).toBe(false);
  });
});

// ── 04-12 Task 3(A-19 · OV-2 · A-06 · OV-3 · 엔지 리뷰 A §1 P2 · ENG-D6) ─────────────────────────────
async function makeViewer(roleId: string): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `q3-${randomUUID()}@example.test`, name: "견적 줄 테스트 사람", roleId });
  return { id: userId, roleId };
}

async function archiveLine(id: string) {
  await db.update(quoteLines).set({ archivedAt: new Date(), archivedBy: SYSTEM_VIEWER.id }).where(eq(quoteLines.id, id));
}

async function actionCount(entity: string, entityId: string, actionType: string): Promise<number> {
  const rows = await db
    .select({ seq: actionLog.seq })
    .from(actionLog)
    .where(and(eq(actionLog.entity, entity), eq(actionLog.entityId, entityId), eq(actionLog.actionType, actionType)));
  return rows.length;
}

describe("보관함 복원(A-19 · OV-2)", () => {
  it("(s1) 완료 프로젝트의 줄 복원은 「완료 · 견적 줄 잠김」으로 거부되고 줄은 보관 그대로다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const line = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "완료 복원" });
    await archiveLine(line.id);
    await setStatus(project.id, "completed");

    await expect(restore(SYSTEM_VIEWER, "quote_line", line.id)).rejects.toThrow("완료 · 견적 줄 잠김");
    expect((await reloadLine(line.id)).archivedAt).toBeInstanceOf(Date);
  });

  it("(s2) 정산 프로젝트는 견적가가 있는 줄 복원을 「정산 · 새 줄은 실행가만」으로 거부하고 견적가 0 줄 복원은 통과시킨다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const priced = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "견적가 있음" });
    const zero = await seedLine(revision.id, subcategoryValue, {
      sortOrder: 1,
      itemName: "견적가 0",
      unitPrice: { currency: "KRW", foreignAmount: null, fxRate: "1.0000", amountKrw: 0 },
    });
    await archiveLine(priced.id);
    await archiveLine(zero.id);
    await setStatus(project.id, "settling");

    await expect(restore(SYSTEM_VIEWER, "quote_line", priced.id)).rejects.toThrow("정산 · 새 줄은 실행가만");
    expect((await reloadLine(priced.id)).archivedAt).toBeInstanceOf(Date);
    await restore(SYSTEM_VIEWER, "quote_line", zero.id);
    expect((await reloadLine(zero.id)).archivedAt).toBeNull();
  });

  it("(s3) 진행 프로젝트의 줄 복원은 통과하고 복원 로그가 한 줄이다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const line = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "진행 복원" });
    await archiveLine(line.id);
    await setStatus(project.id, "in_progress");

    await restore(SYSTEM_VIEWER, "quote_line", line.id);

    expect((await reloadLine(line.id)).archivedAt).toBeNull();
    expect(await actionCount(QUOTE_LINE_ENTITY, line.id, "restore")).toBe(1);
  });

  it("(s4) 복원 로그가 실패하면 보관 해제도 되돌아간다(같은 트랜잭션)", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const line = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "로그 실패 복원" });
    await archiveLine(line.id);
    await setStatus(project.id, "in_progress");

    await expect(
      restoreQuoteLine(SYSTEM_VIEWER, line.id, { recordAction: () => Promise.reject(new Error("로그 실패")) }),
    ).rejects.toThrow("로그 실패");
    expect((await reloadLine(line.id)).archivedAt).toBeInstanceOf(Date);
  });
});

describe("잠금·경합(A-06 · OV-3)", () => {
  it("(p) 저장이 잠금을 쥔 동안 정산→완료 전환은 기다리고, 저장 커밋(실행가 반영) 뒤 완료된다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const line = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "경합 p" });
    await setStatus(project.id, "settling");
    const ceo = await makeViewer("role-ceo");
    const locked = deferred();
    const release = deferred();

    const save = saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [asInput(line, { execution: krw(70_000) })] }, {
      afterLock: async () => {
        locked.resolve();
        await release.promise;
      },
    });
    await locked.promise;
    const complete = changeProjectStatus(ceo, project.id, { from: "settling", to: "completed" });
    try {
      await waitForLockWaiter(pool);
    } finally {
      release.resolve();
    }

    const [a, b] = await Promise.allSettled([save, complete]);
    expect(a.status).toBe("fulfilled");
    expect(b.status).toBe("fulfilled");
    expect((await reloadLine(line.id)).executionAmountKrw).toBe(70_000);
    const [row] = await db.select().from(projects).where(eq(projects.id, project.id));
    expect(row?.status).toBe("completed");
  });

  it("(q) 전환이 잠금을 쥔 동안 저장은 기다리고, 완료 커밋 뒤 저장은 「완료 · 견적 줄 잠김」으로 거부된다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const line = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "경합 q" });
    await setStatus(project.id, "settling");
    const ceo = await makeViewer("role-ceo");
    const locked = deferred();
    const release = deferred();

    const complete = changeProjectStatus(ceo, project.id, { from: "settling", to: "completed" }, {
      afterLock: async () => {
        locked.resolve();
        await release.promise;
      },
    });
    await locked.promise;
    const save = saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [asInput(line, { execution: krw(70_000) })] });
    try {
      await waitForLockWaiter(pool);
    } finally {
      release.resolve();
    }

    const [b, a] = await Promise.allSettled([complete, save]);
    expect(b.status).toBe("fulfilled");
    expect(a.status).toBe("rejected");
    if (a.status === "rejected") expect(String(a.reason)).toContain("완료 · 견적 줄 잠김");
    expect((await reloadLine(line.id)).executionAmountKrw).toBe(50_000);
  });

  it("(r) 복원 대 전환 — 복원이 먼저 잠그면 복원 뒤 완료, 전환이 먼저 잠그면 복원은 「완료 · 견적 줄 잠김」", async () => {
    const ceo = await makeViewer("role-ceo");
    const zeroPrice = { currency: "KRW" as const, foreignAmount: null, fxRate: "1.0000", amountKrw: 0 };

    // 복원 먼저
    {
      const { project, revision, subcategoryValue } = await setupProject();
      const line = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "경합 r1", unitPrice: zeroPrice });
      await archiveLine(line.id);
      await setStatus(project.id, "settling");
      const locked = deferred();
      const release = deferred();
      const restoring = restoreQuoteLine(SYSTEM_VIEWER, line.id, {
        afterLock: async () => {
          locked.resolve();
          await release.promise;
        },
      });
      await locked.promise;
      const complete = changeProjectStatus(ceo, project.id, { from: "settling", to: "completed" });
      try {
        await waitForLockWaiter(pool);
      } finally {
        release.resolve();
      }
      const [a, b] = await Promise.allSettled([restoring, complete]);
      expect(a.status).toBe("fulfilled");
      expect(b.status).toBe("fulfilled");
      expect((await reloadLine(line.id)).archivedAt).toBeNull();
    }

    // 전환 먼저
    {
      const { project, revision, subcategoryValue } = await setupProject();
      const line = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "경합 r2", unitPrice: zeroPrice });
      await archiveLine(line.id);
      await setStatus(project.id, "settling");
      const locked = deferred();
      const release = deferred();
      const complete = changeProjectStatus(ceo, project.id, { from: "settling", to: "completed" }, {
        afterLock: async () => {
          locked.resolve();
          await release.promise;
        },
      });
      await locked.promise;
      const restoring = restoreQuoteLine(SYSTEM_VIEWER, line.id);
      try {
        await waitForLockWaiter(pool);
      } finally {
        release.resolve();
      }
      const [b, a] = await Promise.allSettled([complete, restoring]);
      expect(b.status).toBe("fulfilled");
      expect(a.status).toBe("rejected");
      if (a.status === "rejected") expect(String(a.reason)).toContain("완료 · 견적 줄 잠김");
      expect((await reloadLine(line.id)).archivedAt).toBeInstanceOf(Date);
    }
  });
});

describe("합성 저장(엔지 리뷰 A §1 P2 · ENG-D6)", () => {
  it("(t) 유효한 견적 줄 변경과 거부되는 매출 줄을 한 합성 저장으로 보내면 전부 거부되고 견적 줄·매출 로그 수가 그대로다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const line = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "유령 로그" });
    const quoteLogsBefore = await actionCount(QUOTE_LINE_ENTITY, revision.id, "document_update");
    const revenueLogsBefore = await actionCount("revenue_entry", project.id, "document_update");

    await expect(
      saveProjectLedger(SYSTEM_VIEWER, project.id, {
        seenStatus: "bidding",
        quoteLines: { revisionId: revision.id, rows: [asInput(line, { itemName: "유령 로그 고침" })] },
        revenue: { issuedEntries: [{ id: randomUUID(), entryDate: "2026-09-01", amount: krw(1_000_000) }] },
      }),
    ).rejects.toThrow("버전 정보");

    expect((await reloadLine(line.id)).itemName).toBe("유령 로그");
    expect(await actionCount(QUOTE_LINE_ENTITY, revision.id, "document_update")).toBe(quoteLogsBefore);
    expect(await actionCount("revenue_entry", project.id, "document_update")).toBe(revenueLogsBefore);
  });

  it("(v) 종료일을 늦춰 정산을 진행으로 되돌리며 단가를 고친 저장은 통과하고, 종료일을 앞당겨 정산을 만들며 단가를 고친 저장은 전부 거부된다", async () => {
    const now = new Date();
    const today = kstToday(now);
    const admin = await makeViewer("role-sysadmin");

    // 늦추기 — 정산 → 진행(저장 뒤 상태로 판정) → 단가 수정 통과
    {
      const { project, revision, subcategoryValue } = await setupProject();
      const [startDate, endDate] = [addDays(today, -10), addDays(today, -1)];
      await db.update(projects).set({ status: "settling", startDate, endDate }).where(eq(projects.id, project.id));
      const line = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "늦추기" });

      await saveProjectLedger(
        admin,
        project.id,
        {
          seenStatus: "settling",
          period: { startDate, endDate: addDays(today, 5), baseline: { startDate, endDate } },
          quoteLines: { revisionId: revision.id, rows: [asInput(line, { unitPrice: krw(120_000) })] },
        },
        { now: () => now },
      );

      expect((await reloadLine(line.id)).unitPriceAmountKrw).toBe(120_000);
      const [row] = await db.select().from(projects).where(eq(projects.id, project.id));
      expect(row).toMatchObject({ status: "in_progress", endDate: addDays(today, 5) });
    }

    // 앞당기기 — 진행 → 정산(저장 뒤 상태로 판정) → 단가 수정 거부 · 기간·상태·단가 무변경
    {
      const { project, revision, subcategoryValue } = await setupProject();
      const [startDate, endDate] = [addDays(today, -10), addDays(today, 5)];
      await db.update(projects).set({ status: "in_progress", startDate, endDate }).where(eq(projects.id, project.id));
      const line = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: "앞당기기" });

      await expect(
        saveProjectLedger(
          admin,
          project.id,
          {
            seenStatus: "in_progress",
            period: { startDate, endDate: addDays(today, -1), baseline: { startDate, endDate } },
            quoteLines: { revisionId: revision.id, rows: [asInput(line, { unitPrice: krw(120_000) })] },
          },
          { now: () => now },
        ),
      ).rejects.toThrow("정산 · 실행가와 새 줄만");

      expect((await reloadLine(line.id)).unitPriceAmountKrw).toBe(100_000);
      const [row] = await db.select().from(projects).where(eq(projects.id, project.id));
      expect(row).toMatchObject({ status: "in_progress", endDate });
    }
  });
});

// 04-40(B-01 · A-14) — 차수가 둘 이상일 때만 드러나는 소속·일치 경우. 검사는 04-12(줄 소속)·04-22(프로젝트-차수 일치)의
// 것이고 이 describe는 그 증명과 「write.denied 정확히 한 번 · 금액 키 없음」만 더한다.
describe("여러 차수 소속·일치(04-40 · B-01 · A-14)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const MISMATCH = "차수와 프로젝트가 맞지 않음 · 새로 고침";
  const noAmountKeys = (fields: Record<string, unknown> | undefined) => !Object.keys(fields ?? {}).some((key) => /amount|krw/i.test(key));

  async function withSecondRevision() {
    const setup = await setupProject();
    const first = await seedLine(setup.revision.id, setup.subcategoryValue, { sortOrder: 0, itemName: `1차 줄-${randomUUID()}` });
    const { revisionId: secondId } = await createRevisionFromCurrent(SYSTEM_VIEWER, { projectId: setup.project.id, fromRevisionId: setup.revision.id });
    const [second] = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, secondId));
    if (!second) throw new Error("2차 줄이 없습니다");
    return { ...setup, first, secondId, second };
  }

  it("(m1) 2차(현재) 저장에 같은 프로젝트 1차 줄 id 하나가 섞이면 배치 전부 거부 · 두 차수 무변경 · write.denied 한 번", async () => {
    const { first, secondId, second } = await withSecondRevision();
    const warn = vi.spyOn(log, "warn");

    await expect(
      saveQuoteLines(SYSTEM_VIEWER, secondId, { rows: [asInput(second, { execution: krw(70_000) }), asInput(first, { execution: krw(80_000) })] }),
    ).rejects.toThrow(MISMATCH);

    expect((await reloadLine(first.id)).executionAmountKrw).toBe(first.executionAmountKrw);
    expect((await reloadLine(second.id)).executionAmountKrw).toBe(second.executionAmountKrw);
    const denied = deniedCalls(warn);
    expect(denied).toHaveLength(1);
    expect(denied[0]?.rule).toBe("quote.line-membership");
    expect(noAmountKeys(denied[0])).toBe(true);
  });

  it("(m2) 진행 프로젝트 저장에 완료 프로젝트의 줄 id를 섞으면 같은 거부 — 완료 잠금을 남의 줄로 비켜 가지 못한다", async () => {
    const open = await setupProject();
    const done = await setupProject();
    await setStatus(open.project.id, "in_progress");
    await setStatus(done.project.id, "completed");
    const own = await seedLine(open.revision.id, open.subcategoryValue, { sortOrder: 0, itemName: `진행 줄-${randomUUID()}` });
    const foreign = await seedLine(done.revision.id, done.subcategoryValue, { sortOrder: 0, itemName: `완료 줄-${randomUUID()}` });
    const warn = vi.spyOn(log, "warn");

    await expect(
      saveQuoteLines(SYSTEM_VIEWER, open.revision.id, { rows: [asInput(own, { execution: krw(70_000) }), asInput(foreign, { execution: krw(1) })] }),
    ).rejects.toThrow(MISMATCH);

    expect((await reloadLine(foreign.id)).executionAmountKrw).toBe(foreign.executionAmountKrw);
    expect((await reloadLine(own.id)).executionAmountKrw).toBe(own.executionAmountKrw);
    const denied = deniedCalls(warn);
    expect(denied).toHaveLength(1);
    expect(noAmountKeys(denied[0])).toBe(true);
  });

  it("(m3) A의 합성 저장에 B의 현재(2차) 차수를 실으면 「차수와 프로젝트가 맞지 않음」 · A·B 견적 줄과 A 매출 무변경 · write.denied 한 번(quote.revision-project)", async () => {
    const a = await setupProject();
    const b = await withSecondRevision();
    const warn = vi.spyOn(log, "warn");

    await expect(
      saveProjectLedger(SYSTEM_VIEWER, a.project.id, {
        seenStatus: "bidding",
        quoteLines: { revisionId: b.secondId, rows: [asInput(b.second, { execution: krw(70_000) })] },
        revenue: { issuedEntries: [{ entryDate: "2026-09-01", amount: krw(1_000_000) }] },
      }),
    ).rejects.toThrow(MISMATCH);

    expect((await reloadLine(b.second.id)).executionAmountKrw).toBe(b.second.executionAmountKrw);
    expect(await db.select().from(quoteLines).where(eq(quoteLines.revisionId, a.revision.id))).toHaveLength(0);
    expect(await db.select().from(revenueEntries).where(eq(revenueEntries.projectId, a.project.id))).toHaveLength(0);
    const denied = deniedCalls(warn);
    expect(denied).toHaveLength(1);
    expect(denied[0]?.rule).toBe("quote.revision-project");
    expect(noAmountKeys(denied[0])).toBe(true);
  });
});

// PG 오류(22003 등)가 원인 사슬 어디에도 없어야 한다 — 거부는 쓰기 전의 셀 오류다.
function pgCodes(error: unknown): string[] {
  const codes: string[] = [];
  let current: unknown = error;
  while (current && typeof current === "object") {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") codes.push(code);
    current = (current as { cause?: unknown }).cause;
  }
  return codes;
}

async function rejectionOf(promise: Promise<unknown>): Promise<SaveRejectedError> {
  const outcome = await promise.then(
    () => new Error("거부되지 않았다"),
    (error: unknown) => error,
  );
  expect(pgCodes(outcome)).toEqual([]);
  expect(outcome).toBeInstanceOf(SaveRejectedError);
  return outcome as SaveRejectedError;
}

// 04-40(엔지니어링 리뷰 B §2) — 견적 줄 금액 입력은 normalizeMoneyInput을 지나고 거부는 그 칸의 셀 오류다.
describe("금액 입력 정규화(04-40 · B §2)", () => {
  it("(n1) KRW 단가에 환율 1,350을 실어도 원화 = 금액 × 1 · 환율 1로 저장된다", async () => {
    const { revision, subcategoryValue } = await setupProject();
    const row = newRow(subcategoryValue, { quantity: 2, unitPrice: { currency: "KRW", amount: 5000, fxRate: 1350 } });

    await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [row] });

    const saved = await reloadLine(row.id);
    expect(saved.unitPriceFxRate).toBe("1.0000");
    expect(saved.unitPriceAmountKrw).toBe(5000);
    expect(saved.quoteAmountKrw).toBe(10_000);
  });

  it("(n2) USD 단가 환율 0은 그 칸의 셀 오류 「환율은 0보다 커야 합니다 · 환율을 고쳐 주세요」 · 배치 전부 거부", async () => {
    const { revision, subcategoryValue } = await setupProject();
    const ok = newRow(subcategoryValue);
    const bad = newRow(subcategoryValue, { unitPrice: { currency: "USD", amount: 100, fxRate: 0 } });

    const error = await rejectionOf(saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [ok, bad] }));

    expect(error.formatErrors).toContainEqual(expect.objectContaining({ rowId: bad.id, field: "unitPrice", reason: "환율은 0보다 커야 합니다 · 환율을 고쳐 주세요" }));
    expect(await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revision.id))).toHaveLength(0);
  });

  it("(n3) 원화 환산이 범위를 넘는 단가는 그 칸 셀 오류 「금액이 상한을 넘습니다 · 2,147,483,647원 이하」 — PG 22003으로 새지 않는다", async () => {
    const { revision, subcategoryValue } = await setupProject();
    const bad = newRow(subcategoryValue, { unitPrice: krw(3_000_000_000) });

    const error = await rejectionOf(saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [bad] }));

    expect(error.formatErrors).toContainEqual(expect.objectContaining({ rowId: bad.id, field: "unitPrice", reason: "금액이 상한을 넘습니다 · 2,147,483,647원 이하" }));
    expect(await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revision.id))).toHaveLength(0);
  });
});

// 04-40 검토 SF-1 — 원화 컬럼 밖의 숫자 컬럼(환율 · 외화 금액 · 수량 · 차익)도 쓰기 전에 그 칸의 셀 오류로 거부한다(PG 22003 아님).
describe("원화 밖 숫자 컬럼 범위(04-40 검토 SF-1)", () => {
  async function expectCell(revisionId: string, bad: QuoteLineWriteRow, field: string, reason: string) {
    const error = await rejectionOf(saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [bad] }));
    expect(error.formatErrors).toContainEqual(expect.objectContaining({ rowId: bad.id, field, reason }));
    expect(await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revisionId))).toHaveLength(0);
  }

  it("(o1) USD 단가 금액 0 · 환율 10억 → 단가 칸 「환율이 상한을 넘습니다 · 환율을 고쳐 주세요」", async () => {
    const { revision, subcategoryValue } = await setupProject();
    const bad = newRow(subcategoryValue, { unitPrice: { currency: "USD", amount: 0, fxRate: 1_000_000_000 } });
    await expectCell(revision.id, bad, "unitPrice", "환율이 상한을 넘습니다 · 환율을 고쳐 주세요");
  });

  it("(o2) USD 실행가 금액 1조 · 환율 0.0001 → 실행가 칸 「외화 금액이 상한을 넘습니다 · 금액을 고쳐 주세요」", async () => {
    const { revision, subcategoryValue } = await setupProject();
    const bad = newRow(subcategoryValue, { execution: { currency: "USD", amount: 1_000_000_000_000, fxRate: 0.0001 } });
    await expectCell(revision.id, bad, "execution", "외화 금액이 상한을 넘습니다 · 금액을 고쳐 주세요");
  });

  it("(o3) 수량 100억 · 단가 0 → 수량 칸 「수량이 상한을 넘습니다 · 수량을 고쳐 주세요」", async () => {
    const { revision, subcategoryValue } = await setupProject();
    const bad = newRow(subcategoryValue, { quantity: 10_000_000_000, unitPrice: krw(0) });
    await expectCell(revision.id, bad, "quantity", "수량이 상한을 넘습니다 · 수량을 고쳐 주세요");
  });

  it("(o5) 수량 1.234 · 단가 1,000,000 → 수량 칸 「수량은 소수 2자리까지」(저장 수량과 견적가가 어긋나지 않게 반올림하지 않고 거부)", async () => {
    const { revision, subcategoryValue } = await setupProject();
    const bad = newRow(subcategoryValue, { quantity: 1.234, unitPrice: krw(1_000_000) });
    await expectCell(revision.id, bad, "quantity", "수량은 소수 2자리까지");
  });

  it("(o4) 견적 외 비용 줄 실행가 −2,147,483,648 → 차익 2,147,483,648 — 실행가 칸 「차익이 상한을 넘습니다 · 실행가를 고쳐 주세요」", async () => {
    const { revision, subcategoryValue } = await setupProject();
    const bad = newRow(subcategoryValue, { lineKind: "out_of_quote", execution: krw(-2_147_483_648) });
    await expectCell(revision.id, bad, "execution", "차익이 상한을 넘습니다 · 실행가를 고쳐 주세요");
  });
});

// 04-40(DR-9) — 수량 × 단가의 계산 견적가가 quote_amount_krw 상한을 넘으면 수량·단가 두 칸 셀 오류로 쓰기 전에 거부한다.
describe("계산 견적가 상한(04-40 · DR-9)", () => {
  const OVER = "견적가가 상한을 넘습니다 · 수량이나 단가를 고쳐 주세요";

  function overBatch(subcategory: string) {
    const ok = newRow(subcategory, { unitPrice: krw(100_000) });
    const over = newRow(subcategory, { quantity: 3, unitPrice: krw(1_000_000_000) });
    return { ok, over };
  }

  function expectTwoCells(error: SaveRejectedError, rowId: string) {
    const cells = error.formatErrors.filter((cell) => cell.rowId === rowId);
    expect(cells.map((cell) => cell.field).sort()).toEqual(["quantity", "unitPrice"]);
    expect(cells.every((cell) => cell.reason === OVER)).toBe(true);
  }

  it("(d1) 단독 저장: 수량 3 × 단가 10억 줄은 수량·단가 두 칸 오류 · PG 오류 아님 · 같은 배치의 정상 줄도 쓰이지 않는다", async () => {
    const { revision, subcategoryValue } = await setupProject();
    const { ok, over } = overBatch(subcategoryValue);

    const error = await rejectionOf(saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [ok, over] }));

    expectTwoCells(error, over.id);
    expect(await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revision.id))).toHaveLength(0);
  });

  it("(d1b) 기존 줄을 수량 3 × 단가 10억으로 고친 저장도 두 칸 오류 · 줄 값 그대로", async () => {
    const { revision, subcategoryValue } = await setupProject();
    const line = await seedLine(revision.id, subcategoryValue, { sortOrder: 0, itemName: `상한 줄-${randomUUID()}` });

    const error = await rejectionOf(saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [asInput(line, { quantity: 3, unitPrice: krw(1_000_000_000) })] }));

    expectTwoCells(error, line.id);
    const after = await reloadLine(line.id);
    expect(after.quoteAmountKrw).toBe(line.quoteAmountKrw);
    expect(after.version).toBe(line.version);
  });

  it("(d2) 원장 합성 저장(견적 줄 + 매출 발행 줄)도 같은 두 칸 오류 · 매출 발행 줄 무변경", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const { ok, over } = overBatch(subcategoryValue);

    const error = await rejectionOf(
      saveProjectLedger(SYSTEM_VIEWER, project.id, {
        seenStatus: "bidding",
        quoteLines: { revisionId: revision.id, rows: [ok, over] },
        revenue: { issuedEntries: [{ entryDate: "2026-09-01", amount: krw(1_000_000) }] },
      }),
    );

    expectTwoCells(error, over.id);
    expect(await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revision.id))).toHaveLength(0);
    expect(await db.select().from(revenueEntries).where(eq(revenueEntries.projectId, project.id))).toHaveLength(0);
  });

  it("(d3) saveProjectLedgerAction의 봉투가 { rejected: { summary: 「오류 2칸 · 전부 거부」, cells } }이고 그 줄의 quantity·unitPrice 두 칸이 있다(W3)", async () => {
    const { project, revision, subcategoryValue } = await setupProject();
    const over = { id: randomUUID(), isNew: true as const, subcategory: subcategoryValue, itemName: `상한-${randomUUID()}`, quantity: 3, unitPrice: krw(1_000_000_000), execution: krw(10_000) };

    const result = await saveProjectLedgerAction({ projectId: project.id, seenStatus: "bidding", quoteLines: { revisionId: revision.id, rows: [over] } });

    const data = result?.data;
    if (!data || !("rejected" in data)) throw new Error(`거부 봉투가 아니다: ${JSON.stringify(result)}`);
    expect(data.rejected.summary).toBe("오류 2칸 · 전부 거부");
    expect(data.rejected.cells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rowId: over.id, field: "quantity", kind: "error", reason: OVER }),
        expect.objectContaining({ rowId: over.id, field: "unitPrice", kind: "error", reason: OVER }),
      ]),
    );
    expect(await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revision.id))).toHaveLength(0);
  });
});
