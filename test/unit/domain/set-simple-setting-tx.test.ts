import { beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DOCUMENT_NUMBER_PROJECT_SEQ_START } from "@/domain/settings/keys";

// 07-04 /review — setSettingValue가 07-04에서 자기 트랜잭션을 연다. 순번 시작값 저장(setSimpleSettingValue)은
// 카운터 행을 잠근 바깥 tx 안에서 setSettingValue를 부르므로, 안쪽이 두 번째 트랜잭션(풀 연결 하나 더)을 열면
// 잠금 안에서 전역 풀을 쓰는 것이 된다(04-32 규칙 · 풀 소진 교착). 트랜잭션은 바깥 하나여야 하고 모든 읽기 · 쓰기가 그 tx로 간다.
const mocks = vi.hoisted(() => {
  const outerTx = { outer: true };
  return {
    outerTx,
    withTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(outerTx)),
    findSimpleValue: vi.fn(),
    upsertSimpleValue: vi.fn(),
    lockDocumentCounter: vi.fn(),
    recordAction: vi.fn(),
  };
});

vi.mock("@/lib/db-transaction", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db-transaction")>()),
  withTransaction: mocks.withTransaction,
}));
vi.mock("@/repositories/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/repositories/settings")>()),
  findSimpleValue: mocks.findSimpleValue,
  upsertSimpleValue: mocks.upsertSimpleValue,
}));
vi.mock("@/repositories/document-counters", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/repositories/document-counters")>()),
  lockDocumentCounter: mocks.lockDocumentCounter,
}));
vi.mock("@/domain/action-log/record", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/domain/action-log/record")>()),
  recordAction: mocks.recordAction,
}));
vi.mock("@/domain/permissions/can", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/domain/permissions/can")>()),
  can: () => Promise.resolve(true),
}));

const { setSimpleSettingValue } = await import("@/domain/document-numbering");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findSimpleValue.mockResolvedValue({ key: DOCUMENT_NUMBER_PROJECT_SEQ_START.key, value: 5 });
  mocks.upsertSimpleValue.mockResolvedValue(undefined);
  mocks.lockDocumentCounter.mockResolvedValue(0);
  mocks.recordAction.mockResolvedValue(undefined);
});

describe("setSimpleSettingValue — 순번 시작값 저장은 트랜잭션 하나(07-04 /review)", () => {
  it("바깥 tx 하나만 열고, 이전 값 읽기 · 저장 · 기록이 모두 그 tx로 간다", async () => {
    await setSimpleSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEQ_START, 7, new Date("2026-10-21T00:00:00Z"));

    expect(mocks.withTransaction).toHaveBeenCalledTimes(1);
    for (const call of mocks.findSimpleValue.mock.calls) expect(call[2]).toBe(mocks.outerTx);
    expect(mocks.upsertSimpleValue).toHaveBeenCalledWith(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEQ_START.key, 7, SYSTEM_VIEWER.id, mocks.outerTx);
    expect(mocks.recordAction).toHaveBeenCalledWith(
      SYSTEM_VIEWER,
      expect.objectContaining({ actionType: "settings_change", detail: { key: DOCUMENT_NUMBER_PROJECT_SEQ_START.key, changes: { value: [5, 7] } } }),
      { tx: mocks.outerTx },
    );
  });
});
