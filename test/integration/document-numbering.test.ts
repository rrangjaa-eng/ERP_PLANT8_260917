import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import {
  allocateDocumentNumber,
  assertSeqStartAvailable,
  loadDocumentNumberFormat,
  SeqStartOverlapError,
  UnknownDocumentNumberCounterError,
} from "@/domain/document-numbering";
import { ForbiddenError, getSettingValue, setSettingValue } from "@/domain/settings/registry";
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
});

// 04-51 결정 ②(a) — 사용자 답 2026-09-24: 올해 이미 매긴 최대 표시 순번 이하로 시작값을
// 내리는 저장은 거부한다. saveSeqStart는 설정 저장 액션(app/(app)/admin/settings/actions.ts
// setSimpleSettingAction)과 같은 순서 — 검증 뒤 저장 — 로 부른다("use server" 파일은
// Vitest에서 import할 수 없다).
describe("순번 시작값 낮추기(결정 ②)", () => {
  const NOW = new Date("2026-06-01T03:00:00Z");
  const YEAR = 2026;

  async function saveSeqStart(viewer: Viewer, value: number): Promise<void> {
    await assertSeqStartAvailable(viewer, DOCUMENT_NUMBER_PROJECT_SEQ_START, value, NOW);
    await setSettingValue(viewer, DOCUMENT_NUMBER_PROJECT_SEQ_START, value);
  }

  async function allocate(year = YEAR): Promise<string> {
    const format = await loadDocumentNumberFormat("project");
    const { number } = await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year, format });
    return number;
  }

  // 공통 준비: 시작값 100으로 올해 셋(표시 순번 100 · 101 · 102).
  async function issueThreeFrom100(): Promise<string[]> {
    await saveSeqStart(SYSTEM_VIEWER, 100);
    return [await allocate(), await allocate(), await allocate()];
  }

  it("준비: 시작값 100으로 올해 매긴 번호는 26100 · 26101 · 26102다", async () => {
    expect(await issueThreeFrom100()).toEqual(["26100", "26101", "26102"]);
  });

  it("50으로 낮추면 거부되고(필드 오류 문구) 설정 값은 100 그대로다", async () => {
    await issueThreeFrom100();
    const rejected = saveSeqStart(SYSTEM_VIEWER, 50);
    await expect(rejected).rejects.toBeInstanceOf(SeqStartOverlapError);
    await expect(rejected).rejects.toThrow("순번 시작값이 이미 매긴 번호(102)와 겹침 · 103 이상 입력");
    expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEQ_START)).toBe(100);
  });

  it("이미 매긴 최대 102와 같은 값도 거부되고 설정 값은 100 그대로다", async () => {
    await issueThreeFrom100();
    await expect(saveSeqStart(SYSTEM_VIEWER, 102)).rejects.toBeInstanceOf(SeqStartOverlapError);
    expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEQ_START)).toBe(100);
  });

  // 04-51 리뷰 B1 — 설정 화면은 칸을 벗어날 때마다(blur) 값을 다시 보낸다.
  it("현재 값 100을 그대로 다시 저장하면 통과하고 값은 100 그대로다", async () => {
    const issued = await issueThreeFrom100();
    await saveSeqStart(SYSTEM_VIEWER, 100);
    expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEQ_START)).toBe(100);
    expect(issued).not.toContain(await allocate());
  });

  it("기본값 1로 올해 첫 번호를 매긴 뒤 1을 그대로 다시 저장해도 통과한다", async () => {
    expect(await allocate()).toBe("26001");
    await saveSeqStart(SYSTEM_VIEWER, 1);
    expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEQ_START)).toBe(1);
  });

  it("103은 저장되고 다음 번호가 이미 매긴 번호와 겹치지 않는다", async () => {
    const issued = await issueThreeFrom100();
    await saveSeqStart(SYSTEM_VIEWER, 103);
    expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEQ_START)).toBe(103);

    const next = [await allocate(), await allocate()];
    for (const number of next) expect(issued).not.toContain(number);
    expect(next).toEqual(["26106", "26107"]);
  });

  it("올해 매긴 번호가 없으면(작년 번호만 있으면) 어떤 값으로 낮춰도 저장된다", async () => {
    await saveSeqStart(SYSTEM_VIEWER, 100);
    await allocate(2025);
    await saveSeqStart(SYSTEM_VIEWER, 1);
    expect(await allocate()).toBe("26001");
  });

  it("다른 설정 키 저장은 이 검증을 지나지 않는다", async () => {
    await issueThreeFrom100();
    await expect(
      assertSeqStartAvailable(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEQ_DIGITS, 1, NOW),
    ).resolves.toBeUndefined();
  });

  it("설정 쓰기 권한이 없으면 최대 번호를 알리지 않고 권한 거부로 끝난다", async () => {
    await issueThreeFrom100();
    const pmViewer: Viewer = { id: `pm-${randomUUID()}`, roleId: DEFAULT_ROLE_ID };
    await expect(saveSeqStart(pmViewer, 50)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("공통: 시작값을 올린 뒤에도 두 연결이 동시에 매긴 번호는 서로 다르다", async () => {
    const issued = await issueThreeFrom100();
    await saveSeqStart(SYSTEM_VIEWER, 103);
    const format = await loadDocumentNumberFormat("project");
    const [a, b] = await Promise.all([
      db.transaction((tx) => allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: YEAR, format }, tx)),
      db.transaction((tx) => allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: YEAR, format }, tx)),
    ]);
    expect(a.number).not.toBe(b.number);
    expect(issued).not.toContain(a.number);
    expect(issued).not.toContain(b.number);
  });
});
