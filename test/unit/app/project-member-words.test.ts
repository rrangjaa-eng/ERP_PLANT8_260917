import { describe, expect, it } from "vitest";
import { memberAddPlacement, memberAddedStatus, memberPickLine, memberRemovedLine, memberUndoFailedLine } from "@/app/(app)/projects/[id]/member-words";

// 06.2-12(S2 · 떼기 · 되돌리기): 참여자 섹션 화면 낱말 — 순수 함수.
describe("member-words — 뗌 줄 · 되돌리기 실패 · 더함 상태", () => {
  it("memberRemovedLine — `{이름} 뗌`", () => {
    expect(memberRemovedLine("이서연")).toBe("이서연 뗌");
  });

  it("memberUndoFailedLine — 연결 실패(null)는 다시 시도를 말한다", () => {
    expect(memberUndoFailedLine(null)).toBe("되돌리기 실패 · 다시 시도");
  });

  it("memberUndoFailedLine — 서버 원문은 그대로 이어 붙인다", () => {
    expect(memberUndoFailedLine("완료 프로젝트 · 참여자 잠김")).toBe("되돌리기 실패 · 완료 프로젝트 · 참여자 잠김");
    expect(memberUndoFailedLine("참여자 변경 권한 없음 · 담당 PM 김민준")).toBe("되돌리기 실패 · 참여자 변경 권한 없음 · 담당 PM 김민준");
  });

  it("memberUndoFailedLine — 서버 일반 문구는 할 수 없는 다시 시도를 빼고 `되돌리기 실패`로 끝낸다", () => {
    expect(memberUndoFailedLine("처리 실패 · 다시 시도")).toBe("되돌리기 실패");
  });

  it("memberAddedStatus — `참여자 N명 더함`", () => {
    expect(memberAddedStatus(2)).toBe("참여자 2명 더함");
  });
});

describe("member-words — 고르기 결과 줄 · 더하기 자리(S3)", () => {
  it("memberPickLine — 0명은 줄 없음 · 1명은 `{이름} 선택` · 여럿은 `{이름} 외 N명 선택`", () => {
    expect(memberPickLine([])).toBeNull();
    expect(memberPickLine(["이서연"])).toBe("이서연 선택");
    expect(memberPickLine(["이서연", "박민준", "최지우"])).toBe("이서연 외 2명 선택");
  });

  it("memberAddPlacement — 권리 없음 · 후보 0이면 3차도 머리 자식도 없다", () => {
    expect(memberAddPlacement({ canEdit: false, hasCandidates: true, rowCount: 0 })).toEqual({ tertiary: "none", headerChild: false });
    expect(memberAddPlacement({ canEdit: true, hasCandidates: false, rowCount: 3 })).toEqual({ tertiary: "none", headerChild: false });
  });

  it("memberAddPlacement — 참여자 0이면 3차가 모든 폭에, 있으면 PC에만(폰은 「더보기」 자식)", () => {
    expect(memberAddPlacement({ canEdit: true, hasCandidates: true, rowCount: 0 })).toEqual({ tertiary: "all", headerChild: true });
    expect(memberAddPlacement({ canEdit: true, hasCandidates: true, rowCount: 2 })).toEqual({ tertiary: "pc", headerChild: true });
  });
});
