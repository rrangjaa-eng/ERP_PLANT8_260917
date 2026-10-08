import { describe, expect, it } from "vitest";
import { memberAddedStatus, memberRemovedLine, memberUndoFailedLine } from "@/app/(app)/projects/[id]/member-words";

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
