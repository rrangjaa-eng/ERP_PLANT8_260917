import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import {
  createCodeItem,
  listCodeItems,
  updateCodeItemLabel,
} from "@/domain/code-tables";
import { archive } from "@/domain/archive";
import { queryActionLog } from "@/repositories/action-log";

// MAST-04 원문: "코드표를 관리 화면에서 추가·수정·비활성화한다."
// 재검증(2026-09-21)이 「수정」에 해당하는 도메인 함수가 없다는 것을 찾았다 —
// setEvidenceTypeTaxRule은 tableKey가 evidence_type이 아니면 거부하므로
// MAST-04가 이름을 든 견적 대·소분류·지급 방식·프로젝트 상태에는 적용조차
// 되지 않는다.
//
// 수정 범위는 label 하나다(사용자 결정 2026-09-21, 안 a). value는 바꾸지
// 않는다 — db/schema/vendors.ts의 default_evidence_type이 FK 없는 text
// 컬럼에 코드 항목의 value 문자열을 담아서, value를 바꾸면 기존 거래처가
// 조용히 고아가 되고 목록이 라벨 대신 원시 값으로 내려앉는다.

const TABLE_KEY = `label_edit_${randomUUID()}`;

describe("코드표 항목 이름 수정 (MAST-04 「수정」)", () => {
  it("이름을 바꾸면 목록에 새 이름이 보이고 값은 그대로다", async () => {
    const created = await createCodeItem(SYSTEM_VIEWER, {
      tableKey: TABLE_KEY,
      value: "bank_transfer",
      label: "계좌 이체",
    });

    const updated = await updateCodeItemLabel(SYSTEM_VIEWER, created.id, "계좌 송금");
    expect(updated?.label).toBe("계좌 송금");
    expect(updated?.value).toBe("bank_transfer");

    const items = await listCodeItems(SYSTEM_VIEWER, TABLE_KEY);
    const found = items.find((i) => i.id === created.id);
    expect(found?.label).toBe("계좌 송금");
    expect(found?.value).toBe("bank_transfer");
  });

  it("수정은 행동 로그에 document_update로 남는다 (생성이 아니다)", async () => {
    const created = await createCodeItem(SYSTEM_VIEWER, {
      tableKey: TABLE_KEY,
      value: `logged_${randomUUID().slice(0, 8)}`,
      label: "처음",
    });
    await updateCodeItemLabel(SYSTEM_VIEWER, created.id, "나중");

    const updateRows = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_update" });
    expect(updateRows.some((row) => row.entityId === created.id)).toBe(true);
  });

  it("보관된 항목은 수정되지 않는다 — 판정은 화면이 아니라 도메인에서", async () => {
    const created = await createCodeItem(SYSTEM_VIEWER, {
      tableKey: TABLE_KEY,
      value: `archived_${randomUUID().slice(0, 8)}`,
      label: "보관 전",
    });
    await archive(SYSTEM_VIEWER, "code_items", created.id);

    await expect(updateCodeItemLabel(SYSTEM_VIEWER, created.id, "보관 후")).rejects.toThrow();
  });

  it("없는 id는 null을 돌려준다 (setCodeItemActive와 같은 결)", async () => {
    const result = await updateCodeItemLabel(SYSTEM_VIEWER, randomUUID(), "아무거나");
    expect(result).toBeNull();
  });

  it("빈 이름은 거부된다", async () => {
    const created = await createCodeItem(SYSTEM_VIEWER, {
      tableKey: TABLE_KEY,
      value: `blank_${randomUUID().slice(0, 8)}`,
      label: "이름 있음",
    });
    await expect(updateCodeItemLabel(SYSTEM_VIEWER, created.id, "   ")).rejects.toThrow();
  });
});
