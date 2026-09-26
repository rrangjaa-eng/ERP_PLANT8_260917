import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import {
  allocateDocumentNumber,
  loadDocumentNumberFormat,
  UnknownDocumentNumberCounterError,
} from "@/domain/document-numbering";
import { setSettingValue } from "@/domain/settings/registry";
import {
  DOCUMENT_NUMBER_PROJECT_PREFIX,
  DOCUMENT_NUMBER_PROJECT_YEAR_DIGITS,
  DOCUMENT_NUMBER_PROJECT_SEQ_DIGITS,
  DOCUMENT_NUMBER_PROJECT_SEPARATOR,
  DOCUMENT_NUMBER_PROJECT_SEQ_START,
} from "@/domain/settings/keys";

// 04-05(ADMN-09) — `document_counters` 표는 test/integration/setup.ts의
// beforeEach TRUNCATE로 매 테스트마다 빈 상태에서 시작한다(전역 격리) —
// 서식 설정 값도 같은 TRUNCATE로 매번 기본값부터 다시 시작해 테스트 간
// 별도 복원이 필요 없다.
describe("domain/document-numbering 서식 설정 (ADMN-09, 실제 Postgres)", () => {
  it("기본 서식으로 2026년 첫 프로젝트 번호는 26001이다", async () => {
    const format = await loadDocumentNumberFormat("project");
    const { number } = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: 2026, format });
    expect(number).toBe("26001");
  });

  it("서식을 바꿔도 이미 매긴 번호는 그대로다 — 그 뒤 등록분에만 반영된다", async () => {
    const firstFormat = await loadDocumentNumberFormat("project");
    const first = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: 2026, format: firstFormat });
    expect(first.number).toBe("26001");

    await setSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEQ_DIGITS, 4);

    const secondFormat = await loadDocumentNumberFormat("project");
    const second = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: 2026, format: secondFormat });
    expect(second.number).toBe("260002");
    // 이미 매긴 번호는 재계산되지 않는다 — 첫 호출이 돌려준 값은 그대로다.
    expect(first.number).toBe("26001");
  });

  it("접두어를 넣으면 그 뒤 등록분에만 접두어가 붙는다", async () => {
    const beforeFormat = await loadDocumentNumberFormat("project");
    const before = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: 2026, format: beforeFormat });
    expect(before.number).toBe("26001");

    await setSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_PREFIX, "PRJ");
    const afterFormat = await loadDocumentNumberFormat("project");
    const after = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: 2026, format: afterFormat });
    expect(after.number).toBe("PRJ26002");
  });

  it("연도가 2027로 바뀌면 순번이 1부터 다시 시작해 27001이 나온다(카운터 기간 값이 담당)", async () => {
    const format = await loadDocumentNumberFormat("project");
    const y2026 = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: 2026, format });
    expect(y2026.number).toBe("26001");

    const y2027 = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: 2027, format });
    expect(y2027.number).toBe("27001");
    expect(y2027.seq).toBe(1);
  });

  it("순번 자릿수 0은 저장이 거부되고 기존 서식이 유지된다", async () => {
    await expect(setSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEQ_DIGITS, 0)).rejects.toThrow();

    const format = await loadDocumentNumberFormat("project");
    const { number } = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: 2026, format });
    expect(number).toBe("26001");
  });

  it("순번 자릿수 음수는 저장이 거부된다", async () => {
    await expect(setSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEQ_DIGITS, -1)).rejects.toThrow();
  });

  it("연도 자릿수 0은 저장이 거부된다", async () => {
    await expect(setSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_YEAR_DIGITS, 0)).rejects.toThrow();
  });

  it("순번 시작값이 음수면 저장이 거부된다", async () => {
    await expect(setSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEQ_START, -1)).rejects.toThrow();
  });

  it("등록되지 않은 counterKey로 부르면 조용히 통과하지 않고 오류가 난다", async () => {
    await expect(loadDocumentNumberFormat("unregistered-document-type")).rejects.toThrow(
      UnknownDocumentNumberCounterError,
    );
  });

  it("구분자를 바꾼 뒤 등록분에 그 구분자가 반영된다", async () => {
    await setSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEPARATOR, "-");
    const format = await loadDocumentNumberFormat("project");
    const { number } = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: 2026, format });
    expect(number).toBe("26-001");
  });

  // 04.3-02 Task 2 ④ — 확인증 번호 서식(document_number.cert.*, 기본
  // CERT- + 4자리 연도 + - + 4자리 순번). counterKey가 project와 독립
  // (다른 카운터 행)임도 함께 확인한다.
  it("cert counterKey는 기본 서식으로 CERT-2026-0001을 낸다", async () => {
    const format = await loadDocumentNumberFormat("cert");
    const { number } = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "cert", year: 2026, format });
    expect(number).toBe("CERT-2026-0001");
  });
});
