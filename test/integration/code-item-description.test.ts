import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createCodeItem, listCodeItems, updateCodeItemDescription, CODE_ITEM_DESCRIPTION_MAX } from "@/domain/code-tables";
import { archive } from "@/domain/archive";
import { queryActionLog } from "@/repositories/action-log";
import { seedMasterData } from "@/domain/seed";

// D-93 · UI-SPEC rev 5 S14 · DR-29 — 코드표 값마다 한 문장 설명. 40자 상한은
// 서버 판정(설정 hint와 같은 결), 화면은 입력을 막지 않는다(Task 1 Task 2
// SUMMARY 참고). Task 2가 시드 채움·시드 보존·「코드 추가」 설명 칸 케이스를
// 이 파일에 더한다.

const TABLE_KEY = `description_edit_${randomUUID()}`;

describe("코드표 항목 설명 (D-93, UI-SPEC S14)", () => {
  it("설명을 저장하면 DTO의 description이 그 값이다", async () => {
    const created = await createCodeItem(SYSTEM_VIEWER, {
      tableKey: TABLE_KEY,
      value: `save_${randomUUID().slice(0, 8)}`,
      label: "무대·시공",
    });

    const updated = await updateCodeItemDescription(SYSTEM_VIEWER, created.id, "무대·부스 설치와 철거 공사");
    expect(updated?.description).toBe("무대·부스 설치와 철거 공사");

    const items = await listCodeItems(SYSTEM_VIEWER, TABLE_KEY);
    const found = items.find((i) => i.id === created.id);
    expect(found?.description).toBe("무대·부스 설치와 철거 공사");
  });

  it("41자 설명은 거부되고 이유는 서버 문구다 — DB 값은 그대로다", async () => {
    const created = await createCodeItem(SYSTEM_VIEWER, {
      tableKey: TABLE_KEY,
      value: `over40_${randomUUID().slice(0, 8)}`,
      label: "이름",
    });
    const tooLong = "가".repeat(CODE_ITEM_DESCRIPTION_MAX + 1);
    expect(tooLong.length).toBe(41);

    await expect(updateCodeItemDescription(SYSTEM_VIEWER, created.id, tooLong)).rejects.toThrow(
      "설명이 40자를 넘습니다 · 한 문장으로 줄여 주세요",
    );

    const items = await listCodeItems(SYSTEM_VIEWER, TABLE_KEY);
    const found = items.find((i) => i.id === created.id);
    expect(found?.description).toBeNull();
  });

  it("빈 문자열로 저장하면 description이 null이 된다(C-13 — 지우기)", async () => {
    const created = await createCodeItem(SYSTEM_VIEWER, {
      tableKey: TABLE_KEY,
      value: `blank_${randomUUID().slice(0, 8)}`,
      label: "이름",
    });
    await updateCodeItemDescription(SYSTEM_VIEWER, created.id, "설명 있음");

    const cleared = await updateCodeItemDescription(SYSTEM_VIEWER, created.id, "");
    expect(cleared?.description).toBeNull();

    const items = await listCodeItems(SYSTEM_VIEWER, TABLE_KEY);
    const found = items.find((i) => i.id === created.id);
    expect(found?.description).toBeNull();
  });

  it("코드표 쓰기 권한이 없는 계급의 저장은 거부된다", async () => {
    const created = await createCodeItem(SYSTEM_VIEWER, {
      tableKey: TABLE_KEY,
      value: `forbidden_${randomUUID().slice(0, 8)}`,
      label: "이름",
    });
    const pmViewer = { id: `desc-pm-${randomUUID()}`, roleId: DEFAULT_ROLE_ID };

    await expect(updateCodeItemDescription(pmViewer, created.id, "설명")).rejects.toThrow();
  });

  it("보관된 코드 항목의 설명 저장은 거부된다(updateCodeItemLabel과 같은 가드)", async () => {
    const created = await createCodeItem(SYSTEM_VIEWER, {
      tableKey: TABLE_KEY,
      value: `archived_${randomUUID().slice(0, 8)}`,
      label: "이름",
    });
    await archive(SYSTEM_VIEWER, "code_items", created.id);

    await expect(updateCodeItemDescription(SYSTEM_VIEWER, created.id, "설명")).rejects.toThrow();
  });

  it("성공한 저장은 행동 로그에 document_update로 남는다", async () => {
    const created = await createCodeItem(SYSTEM_VIEWER, {
      tableKey: TABLE_KEY,
      value: `logged_${randomUUID().slice(0, 8)}`,
      label: "이름",
    });
    await updateCodeItemDescription(SYSTEM_VIEWER, created.id, "설명");

    const updateRows = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_update" });
    expect(updateRows.some((row) => row.entityId === created.id)).toBe(true);
  });
});

// Task 2 — 시드 채움·보존, 「코드 추가」 설명 칸. beforeEach(test/integration/setup.ts)가
// 매 테스트 전 TRUNCATE 뒤 seedMasterData를 이미 한 번 돌린다.
describe("코드표 기본 제공 값 설명 시드 (D-93 「기본 제공 값은 시드로 설명을 채우고」)", () => {
  const SEEDED: { tableKey: string; value: string }[] = [
    { tableKey: "project_status", value: "bidding" },
    { tableKey: "project_status", value: "in_progress" },
    { tableKey: "project_status", value: "lost" },
    { tableKey: "quote_subcategory", value: "stage_construction" },
    { tableKey: "quote_subcategory", value: "print_production" },
    { tableKey: "quote_subcategory", value: "staffing" },
    { tableKey: "quote_subcategory", value: "etc" },
    { tableKey: "evidence_type", value: "tax_invoice" },
    { tableKey: "evidence_type", value: "invoice" },
    { tableKey: "evidence_type", value: "card_receipt" },
    { tableKey: "evidence_type", value: "cash_receipt" },
    { tableKey: "evidence_type", value: "other_income" },
    { tableKey: "evidence_type", value: "business_income" },
    { tableKey: "evidence_type", value: "overseas_invoice" },
  ];

  it("빈 DB에 시드를 돌리면 기본 제공 값 14개 전부에 40자 이하 설명이 있다", async () => {
    for (const tableKey of ["project_status", "quote_subcategory", "evidence_type"]) {
      const items = await listCodeItems(SYSTEM_VIEWER, tableKey, { includeInactive: true });
      for (const target of SEEDED.filter((s) => s.tableKey === tableKey)) {
        const item = items.find((i) => i.value === target.value);
        expect(item?.description, `${tableKey}.${target.value}`).toBeTruthy();
        expect((item?.description ?? "").length).toBeLessThanOrEqual(CODE_ITEM_DESCRIPTION_MAX);
      }
    }
  });

  it("관리자가 고친 설명은 시드를 다시 돌려도 덮어쓰이지 않는다", async () => {
    const items = await listCodeItems(SYSTEM_VIEWER, "project_status");
    const bidding = items.find((i) => i.value === "bidding");
    expect(bidding).toBeTruthy();

    const customized = await updateCodeItemDescription(SYSTEM_VIEWER, bidding!.id, "관리자가 직접 고친 설명");
    expect(customized?.description).toBe("관리자가 직접 고친 설명");

    await seedMasterData(SYSTEM_VIEWER);

    const afterReseed = await listCodeItems(SYSTEM_VIEWER, "project_status");
    const biddingAfter = afterReseed.find((i) => i.value === "bidding");
    expect(biddingAfter?.description).toBe("관리자가 직접 고친 설명");
  });
});

describe("「코드 추가」 폼 설명 칸 (D-93 · UI-SPEC S14)", () => {
  it("설명과 함께 추가하면 DTO에 설명이 있다", async () => {
    const created = await createCodeItem(SYSTEM_VIEWER, {
      tableKey: TABLE_KEY,
      value: `create_desc_${randomUUID().slice(0, 8)}`,
      label: "이름",
      description: "새 항목 설명",
    });
    expect(created.description).toBe("새 항목 설명");
  });

  it("41자 설명으로 추가하면 거부된다", async () => {
    const tooLong = "가".repeat(CODE_ITEM_DESCRIPTION_MAX + 1);
    await expect(
      createCodeItem(SYSTEM_VIEWER, {
        tableKey: TABLE_KEY,
        value: `create_desc_over40_${randomUUID().slice(0, 8)}`,
        label: "이름",
        description: tooLong,
      }),
    ).rejects.toThrow("설명이 40자를 넘습니다 · 한 문장으로 줄여 주세요");
  });
});
