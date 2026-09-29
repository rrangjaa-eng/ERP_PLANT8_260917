import { beforeEach, describe, expect, it, vi } from "vitest";

// /review(core): 반려된 내 문서를 다시 신청하려고 열 때 결재선이 막혀 있으면(대표 없음) 문서 화면이
// 오류 경계로 떨어졌다 — 신청 폼 미리보기처럼 막힌 이유를 결재선 자리에 주고 다른 오류는 그대로 던진다.
// 목은 평범한 함수 변수로 둔다(모듈 위 vi.fn에 거부를 넣으면 잡아도 실패로 친다 — .continue-here).
class RouteBlockedError extends Error {}
let previewImpl: () => Promise<unknown> = () => Promise.resolve({ steps: [] });
vi.mock("@/domain/approvals", () => ({
  RouteBlockedError,
  previewRoute: () => previewImpl(),
}));

const { previewRouteOrBlocked } = await import("@/app/(app)/leave/route-preview");
const viewer = { id: "viewer" } as never;

describe("previewRouteOrBlocked", () => {
  beforeEach(() => {
    previewImpl = () => Promise.resolve({ steps: [] });
  });

  it("막히지 않으면 미리보기를 주고 막힘은 없다", async () => {
    previewImpl = () => Promise.resolve({ drafterName: "박서연", steps: [] });
    expect(await previewRouteOrBlocked(viewer)).toEqual({ route: { drafterName: "박서연", steps: [] }, blocked: null });
  });

  it("결재선이 막히면(RouteBlockedError) 던지지 않고 이유를 준다", async () => {
    previewImpl = () => Promise.reject(new RouteBlockedError("대표 없음 · 관리자에게 대표 계급 확인 요청"));
    expect(await previewRouteOrBlocked(viewer)).toEqual({ route: null, blocked: "대표 없음 · 관리자에게 대표 계급 확인 요청" });
  });

  it("다른 오류는 그대로 던진다", async () => {
    previewImpl = () => Promise.reject(new Error("db down"));
    await expect(previewRouteOrBlocked(viewer)).rejects.toThrow("db down");
  });
});
