import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  registerDocumentKind,
  getDocumentKind,
  DuplicateDocumentKindError,
  UnknownDocumentKindError,
  type DocumentKindDef,
} from "@/domain/approvals/kinds";

// 결재 모듈은 문서 종류를 하드코딩하지 않는다 — 등록된 종류만 쓴다. 테스트마다 새
// 종류 키를 써서 등록부를 초기화하지 않고도 사례끼리 섞이지 않는다.
function testKind(kind: string): DocumentKindDef {
  return {
    kind,
    label: "테스트 메모",
    loadRouteConfig: () => Promise.resolve({ selfApproval: "skip", steps: [] }),
    href: (id) => `/memo/${id}`,
    describeDocuments: () => Promise.resolve(new Map()),
  };
}

describe("문서 종류 등록부", () => {
  it("등록한 종류를 kind로 되찾는다", () => {
    const kind = `test_memo_${randomUUID()}`;
    const def = testKind(kind);
    registerDocumentKind(def);
    expect(getDocumentKind(kind)).toBe(def);
  });

  it("같은 kind 두 번 등록은 예외", () => {
    const kind = `test_memo_${randomUUID()}`;
    registerDocumentKind(testKind(kind));
    expect(() => registerDocumentKind(testKind(kind))).toThrow(DuplicateDocumentKindError);
  });

  it("등록 안 된 kind는 예외", () => {
    expect(() => getDocumentKind(`nope_${randomUUID()}`)).toThrow(UnknownDocumentKindError);
  });
});
