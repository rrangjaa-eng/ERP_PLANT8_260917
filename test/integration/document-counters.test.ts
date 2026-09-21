import { describe, expect, it } from "vitest";
import * as documentCountersRepo from "@/repositories/document-counters";
import { SYSTEM_VIEWER } from "@/domain/viewer";

const { findDocumentCounter, upsertDocumentCounter } = documentCountersRepo;

// ROADMAP 트레일링 스키마 규약 — 문서 번호 카운터 표는 규약만 세운다. 실제
// 번호 부여(원자적 증가)와 행 잠금은 Phase 4다. 이 테스트는 표 존재·복합
// PK 동작·증가 함수의 부재만 증명한다.
describe("document counters (ROADMAP 트레일링 스키마 규약, 실제 Postgres)", () => {
  it("표가 존재하고 upsert로 행을 만들 수 있다", async () => {
    await upsertDocumentCounter(SYSTEM_VIEWER, { counterKey: "expense", period: "2026", value: 0 });
    const row = await findDocumentCounter(SYSTEM_VIEWER, "expense", "2026");
    expect(row?.value).toBe(0);
  });

  it("같은 (counterKey, period)에 upsert하면 값이 갱신된다(복합 PK 충돌 시 업데이트)", async () => {
    await upsertDocumentCounter(SYSTEM_VIEWER, { counterKey: "purchase_request", period: "2026", value: 1 });
    await upsertDocumentCounter(SYSTEM_VIEWER, { counterKey: "purchase_request", period: "2026", value: 2 });

    const row = await findDocumentCounter(SYSTEM_VIEWER, "purchase_request", "2026");
    expect(row?.value).toBe(2);
  });

  it("다른 period는 다른 행이다 — 복합 PK가 (counterKey, period) 단위로 행을 가른다", async () => {
    await upsertDocumentCounter(SYSTEM_VIEWER, { counterKey: "expense", period: "2026", value: 5 });
    await upsertDocumentCounter(SYSTEM_VIEWER, { counterKey: "expense", period: "2027", value: 1 });

    const row2026 = await findDocumentCounter(SYSTEM_VIEWER, "expense", "2026");
    const row2027 = await findDocumentCounter(SYSTEM_VIEWER, "expense", "2027");
    expect(row2026?.value).toBe(5);
    expect(row2027?.value).toBe(1);
  });

  it("존재하지 않는 카운터는 null을 돌려준다", async () => {
    const row = await findDocumentCounter(SYSTEM_VIEWER, "no-such-counter", "2026");
    expect(row).toBeNull();
  });

  it("원자적 증가 함수가 이 리포지토리에 없다(Phase 4 경계) — 읽기·upsert 두 함수만 export된다", () => {
    const exportedNames = Object.keys(documentCountersRepo).sort();
    expect(exportedNames).toEqual(["findDocumentCounter", "upsertDocumentCounter"]);
  });
});
