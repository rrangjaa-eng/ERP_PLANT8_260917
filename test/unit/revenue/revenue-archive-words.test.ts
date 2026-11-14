import { describe, expect, it } from "vitest";
import { handleServerError } from "@/lib/actions/handle-server-error";
import { revenueDeleteFailure, revenueRemovedLine, revenueUndoFailure } from "@/app/(app)/projects/[id]/revenue-archive-words";

// 07.6-01 design r1 G2 · G6 · r2 N2 — 매출 줄 지우기 · 되돌리기 실패 글자. 일반 서버 오류는 연결 실패처럼 다시 할 수 있는 실패(버튼 유지)이고,
// 버튼을 치우는(retry false) 것은 원인이 있는 도메인 거부뿐이다.
describe("revenue-archive-words (07.6-01)", () => {
  const generic = handleServerError(new Error("x"));

  it("결과 줄 글자는 종류와 날짜다(「보관」 낱말 0)", () => {
    expect(revenueRemovedLine("issue", "2026-10-01")).toBe("발행 줄 2026-10-01 삭제됨");
    expect(revenueRemovedLine("payment", "2026-10-02")).toBe("입금 줄 2026-10-02 삭제됨");
  });

  it("되돌리기 — 연결 실패 · 일반 서버 오류는 다시 시도(버튼 유지)", () => {
    expect(revenueUndoFailure(null)).toEqual({ text: "되돌리기 실패 · 다시 시도", retry: true });
    expect(revenueUndoFailure(generic)).toEqual({ text: "되돌리기 실패 · 다시 시도", retry: true });
  });

  it("되돌리기 — 도메인 거부는 원인 전부(꼬리가 다음 한 수)", () => {
    expect(revenueUndoFailure("다른 사람이 먼저 이 줄을 바꿈 · 새로 고침")).toEqual({
      text: "되돌리기 실패 · 다른 사람이 먼저 이 줄을 바꿈 · 새로 고침",
      retry: false,
    });
    expect(revenueUndoFailure("삭제 뒤 10분 지남 · 복원은 관리자").text).toBe("되돌리기 실패 · 삭제 뒤 10분 지남 · 복원은 관리자");
  });

  it("지우기 — 연결 실패 · 일반 서버 오류는 다시 시도", () => {
    expect(revenueDeleteFailure(null)).toEqual({ text: "삭제 실패 · 다시 시도", retry: true });
    expect(revenueDeleteFailure(generic)).toEqual({ text: "삭제 실패 · 다시 시도", retry: true });
  });

  it("지우기 — 도메인 거부는 원인의 마지막 ` · ` 앞부분(design r2 N2)", () => {
    expect(revenueDeleteFailure("완료 프로젝트 · 삭제 불가")).toEqual({ text: "삭제 실패 · 완료 프로젝트", retry: false });
    expect(revenueDeleteFailure("다른 사람이 먼저 이 줄을 바꿈 · 새로 고침").text).toBe("삭제 실패 · 다른 사람이 먼저 이 줄을 바꿈");
    expect(revenueDeleteFailure("발행 요청 연결 · 삭제 불가").text).toBe("삭제 실패 · 발행 요청 연결");
    expect(revenueDeleteFailure("존재하지 않는 프로젝트").text).toBe("삭제 실패 · 존재하지 않는 프로젝트");
  });
});
