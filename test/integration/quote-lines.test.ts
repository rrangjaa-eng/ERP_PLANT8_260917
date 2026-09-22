import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, quoteRevisions, quoteLines, codeItems, teams } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertFieldDefinition } from "@/repositories/field-definitions";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { GateBlockedError } from "@/domain/rules/gate";
import { UserFacingError } from "@/lib/actions/user-facing-error";

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

  it("(c) 완료(정산) 프로젝트의 줄 저장이 게이트 이유 문자열과 함께 거부된다", async () => {
    const { project, revision, subcategoryValue } = await setupProject();

    await db.update(projects).set({ status: "settled" }).where(eq(projects.id, project.id));

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
    await expect(attempt).rejects.toThrow("완료(정산)");
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
});
