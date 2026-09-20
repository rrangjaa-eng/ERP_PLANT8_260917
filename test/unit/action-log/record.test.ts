import { describe, expect, it, vi } from "vitest";
import {
  recordAction,
  CORE_ACTION_TYPES,
  ALWAYS_ON_ACTION_TYPES,
  UnknownActionTypeError,
} from "@/domain/action-log/record";
import type { Viewer } from "@/domain/viewer";

const viewer: Viewer = { id: "u1", roleId: "role-pm" };

describe("recordAction (OPS-05)", () => {
  it("핵심 행동 종류 목록에 없는 종류를 받으면 행을 만들지 않고 UnknownActionTypeError를 던진다", async () => {
    const appendActionLog = vi.fn();
    await expect(
      recordAction(viewer, { actionType: "not_a_core_type" }, { appendActionLog }),
    ).rejects.toBeInstanceOf(UnknownActionTypeError);
    expect(appendActionLog).not.toHaveBeenCalled();
  });

  it("끌 수 없는 종류는 설정 조회 결과와 무관하게 항상 기록한다(설정 조회 dep을 throw로 스텁)", async () => {
    const appendActionLog = vi.fn().mockResolvedValue(undefined);
    await recordAction(
      viewer,
      { actionType: "excel_export" },
      {
        appendActionLog,
        isActionTypeEnabled: () => {
          throw new Error("항상 켬 종류는 설정 조회를 부르면 안 된다");
        },
      },
    );
    expect(appendActionLog).toHaveBeenCalledTimes(1);
  });

  it("같은 종류·같은 대상으로 두 번 부르면 기록 함수가 두 번 호출된다(append-only, 중복 제거 없음)", async () => {
    const appendActionLog = vi.fn().mockResolvedValue(undefined);
    await recordAction(viewer, { actionType: "document_create", entityId: "x" }, { appendActionLog });
    await recordAction(viewer, { actionType: "document_create", entityId: "x" }, { appendActionLog });
    expect(appendActionLog).toHaveBeenCalledTimes(2);
  });

  it("일반 종류는 설정 조회가 거짓을 반환하면 기록하지 않는다", async () => {
    const appendActionLog = vi.fn().mockResolvedValue(undefined);
    await recordAction(
      viewer,
      { actionType: "document_create" },
      { appendActionLog, isActionTypeEnabled: () => Promise.resolve(false) },
    );
    expect(appendActionLog).not.toHaveBeenCalled();
  });

  it("ALWAYS_ON_ACTION_TYPES는 CORE_ACTION_TYPES의 부분집합이다", () => {
    for (const type of ALWAYS_ON_ACTION_TYPES) {
      expect(CORE_ACTION_TYPES as readonly string[]).toContain(type);
    }
  });
});
