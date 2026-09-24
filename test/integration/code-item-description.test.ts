import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createCodeItem, listCodeItems, updateCodeItemDescription, CODE_ITEM_DESCRIPTION_MAX } from "@/domain/code-tables";
import { archive } from "@/domain/archive";
import { queryActionLog } from "@/repositories/action-log";

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
