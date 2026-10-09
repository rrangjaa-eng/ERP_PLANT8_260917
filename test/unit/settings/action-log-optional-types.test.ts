import { describe, expect, it, vi } from "vitest";
import { ACTION_LOG_OPTIONAL_TYPES } from "@/domain/settings/keys";
import { describeSettingField, getSettingValue, simpleValueOrDefault } from "@/domain/settings/registry";
import { loadActionLogGate } from "@/domain/approvals/tx-log";

// 사용자 결정 2026-10-09 「읽을 때 빼기」 — 41010c13이 permission_change를 끌 수 없는 종류로 옮겼다.
// 그 전에 저장된 action_log.optional_types에는 permission_change가 남아 있을 수 있다. 읽을 때 빼서
// 나머지 선택(어느 종류를 껐나)은 그대로 살린다 — 마이그레이션 · DB 쓰기 없음.
const STORED = ["login", "permission_change"];

function storedRow(value: unknown) {
  return vi.fn().mockResolvedValue({ key: ACTION_LOG_OPTIONAL_TYPES.key, value, updatedAt: new Date(), updatedBy: null });
}

describe("action_log.optional_types — 끌 수 없는 종류는 읽을 때 뺀다", () => {
  it("저장값에 permission_change가 있어도 읽기가 던지지 않고 그 종류만 뺀다", async () => {
    const value = await getSettingValue(ACTION_LOG_OPTIONAL_TYPES, undefined, { findSimpleValue: storedRow(STORED) });
    expect(value).toEqual(["login"]);
  });

  it("결재 tx 로그 판정이 전부 켬(fail-open)으로 떨어지지 않는다 — 꺼 둔 종류는 꺼진 채다", async () => {
    const findSimpleValue = storedRow(STORED);
    const gate = await loadActionLogGate({
      getSettingValue: (def, opts) => getSettingValue(def, opts, { findSimpleValue }),
    });
    expect(gate("login")).toBe(true);
    expect(gate("document_update")).toBe(false);
  });

  it("설정 화면 값 읽기는 기본값으로 바꾸지 않고 저장된 선택을 보인다", () => {
    expect(simpleValueOrDefault(ACTION_LOG_OPTIONAL_TYPES, { value: STORED })).toEqual(["login"]);
  });

  it("설정 화면 선택지는 여전히 끌 수 있는 종류만이다", () => {
    const descriptor = describeSettingField(ACTION_LOG_OPTIONAL_TYPES);
    expect(descriptor.kind).toBe("multi-enum");
    if (descriptor.kind !== "multi-enum") return;
    expect(descriptor.options).toContain("login");
    expect(descriptor.options).not.toContain("permission_change");
  });

  it("저장 검증도 끌 수 없는 종류를 빼고 받는다 — 다시 저장되지 않는다", () => {
    expect(ACTION_LOG_OPTIONAL_TYPES.schema.parse(STORED)).toEqual(["login"]);
  });

  it("끌 수 없는 종류가 아닌 모르는 값은 여전히 거부한다", () => {
    expect(ACTION_LOG_OPTIONAL_TYPES.schema.safeParse(["no_such_type"]).success).toBe(false);
  });
});
