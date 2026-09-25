import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, quoteRevisions, quoteLines, codeItems, teams } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertFieldDefinition } from "@/repositories/field-definitions";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines, SaveRejectedError, type QuoteLineWriteRow } from "@/domain/quotes/lines";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { log } from "@/lib/log";
import { GateBlockedError } from "@/domain/rules/gate";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { getSettingValue } from "@/domain/settings/registry";
import { FX_RECENT_RATE_USD } from "@/domain/settings/keys";

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

    const result = await saveQuoteLines(SYSTEM_VIEWER, revision.id, [
      {
        subcategory: subcategoryValue,
        itemName: "메인 스테이지 구조물 설치",
        quantity: 3,
        unitPrice: { currency: "KRW", amount: 1_200_000, fxRate: 1 },
        execution: { currency: "KRW", amount: 2_800_000, fxRate: 1 },
        // 타입에 없는 필드를 raw 객체로 흉내낸다 — 브라우저가 조작해 보낼 수 있는 값.
        ...({ quoteAmountKrw: 999_999_999, profitKrw: -999_999_999 } as Record<string, unknown>),
      },
    ]);

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
      saveQuoteLines(SYSTEM_VIEWER, revision.id, [
        {
          subcategory: subcategoryValue,
          itemName: "항목",
          unitPrice: { currency: "KRW", amount: 100_000, fxRate: 1 },
          execution: { currency: "KRW", amount: 50_000, fxRate: 1 },
          customFields: { registeredKey: "값", unregisteredKey: "거부되어야 한다" },
        },
      ]),
    ).rejects.toThrow();
  });

  it("(c) 완료 프로젝트의 줄 저장이 게이트 이유 문자열과 함께 거부된다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();

    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, project.id));

    const attempt = saveQuoteLines(SYSTEM_VIEWER, revision.id, [
      {
        subcategory: subcategoryValue,
        itemName: "완료 후 시도",
        unitPrice: { currency: "KRW", amount: 100_000, fxRate: 1 },
        execution: { currency: "KRW", amount: 0, fxRate: 1 },
      },
    ]);

    await expect(attempt).rejects.toBeInstanceOf(GateBlockedError);
    await expect(attempt).rejects.toBeInstanceOf(UserFacingError);
    await expect(attempt).rejects.toThrow("완료 · 견적 줄 잠김");
  });

  it("(c2) 미수주 프로젝트의 줄 저장은 막히지 않는다(D-45)", async () => {
    const { project, revision, subcategoryValue } = await setupProject();

    await db.update(projects).set({ status: "lost" }).where(eq(projects.id, project.id));

    const { lines } = await saveQuoteLines(SYSTEM_VIEWER, revision.id, [
      {
        subcategory: subcategoryValue,
        itemName: "미수주 뒤 도착한 청구",
        unitPrice: { currency: "KRW", amount: 100_000, fxRate: 1 },
        execution: { currency: "KRW", amount: 30_000, fxRate: 1 },
      },
    ]);

    expect(lines.map((line) => line.itemName)).toEqual(["미수주 뒤 도착한 청구"]);
  });

  it("(d) 연결된 줄이 있는 차수를 지우려 하면 실제 외래키 제약(RESTRICT)이 막는다", async () => {
    const { revision, subcategoryValue } = await setupProject();

    await saveQuoteLines(SYSTEM_VIEWER, revision.id, [
      {
        subcategory: subcategoryValue,
        itemName: "연결 문서 시뮬레이션 줄",
        unitPrice: { currency: "KRW", amount: 100_000, fxRate: 1 },
        execution: { currency: "KRW", amount: 0, fxRate: 1 },
      },
    ]);

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

    await saveQuoteLines(SYSTEM_VIEWER, revision.id, [
      {
        subcategory: subcategoryValue,
        itemName: "외화 줄",
        unitPrice: { currency: "USD", amount: 100, fxRate: 1350.25 },
        unitPriceFxRateTouched: true,
        execution: { currency: "KRW", amount: 0, fxRate: 1 },
      },
    ]);
    expect(await getSettingValue(FX_RECENT_RATE_USD)).toBe(1350.25);

    // 다른 값으로 다시 저장하되 fxRateTouched: false — 설정이 그대로다.
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, [
      {
        subcategory: subcategoryValue,
        itemName: "외화 줄 2",
        unitPrice: { currency: "USD", amount: 200, fxRate: 1400.0 },
        unitPriceFxRateTouched: false,
        execution: { currency: "KRW", amount: 0, fxRate: 1 },
      },
    ]);
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
});
