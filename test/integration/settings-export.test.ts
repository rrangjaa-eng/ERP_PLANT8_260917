import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { settingsSimple, settingsHistorized } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { queryActionLog } from "@/repositories/action-log";
import { SETTING_DEFS, AUTH_LOCKOUT_THRESHOLD, TAX_VAT_RATE } from "@/domain/settings/keys";
import { getSettingValue, setSettingValue, addHistorizedValue, listSettingHistory } from "@/domain/settings/registry";
import { exportSettings, importSettings, ImportValidationError } from "@/domain/settings/export";
import { DOCUMENT_NUMBER_PROJECT_SEQ_START } from "@/domain/settings/keys";
import { allocateDocumentNumber, loadDocumentNumberFormat, SeqStartOverlapError } from "@/domain/document-numbering";
import { kstYear } from "@/lib/kst-date";

async function snapshot(): Promise<Record<string, unknown>> {
  const state: Record<string, unknown> = {};
  for (const def of SETTING_DEFS) {
    state[def.key] = def.kind === "historized" ? await listSettingHistory(def) : await getSettingValue(def);
  }
  return state;
}

describe("설정 JSON 내보내기·가져오기 (ADMN-06, 실제 Postgres)", () => {
  it("(a) 내보내고 빈 환경에 가져오면 모든 키의 조회 결과가 원래 환경과 같다", async () => {
    await setSettingValue(SYSTEM_VIEWER, AUTH_LOCKOUT_THRESHOLD, 9);
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2026-01-01", value: 0.12 });

    const before = await snapshot();
    const exported = await exportSettings(SYSTEM_VIEWER);

    // 빈 환경 시뮬레이션 — 설정 두 표를 완전히 비운다.
    await db.delete(settingsHistorized);
    await db.delete(settingsSimple);

    await importSettings(SYSTEM_VIEWER, exported);
    const after = await snapshot();

    expect(after).toEqual(before);
  });

  it("(b) 같은 JSON을 두 번 가져오면 두 번째가 상태를 바꾸지 않는다(멱등)", async () => {
    await setSettingValue(SYSTEM_VIEWER, AUTH_LOCKOUT_THRESHOLD, 8);
    const exported = await exportSettings(SYSTEM_VIEWER);

    await importSettings(SYSTEM_VIEWER, exported);
    const afterFirst = await snapshot();
    await importSettings(SYSTEM_VIEWER, exported);
    const afterSecond = await snapshot();

    expect(afterSecond).toEqual(afterFirst);
  });

  it("(c) 가져오기 항목 중 하나라도 검증에 실패하면 아무것도 적용되지 않는다", async () => {
    await setSettingValue(SYSTEM_VIEWER, AUTH_LOCKOUT_THRESHOLD, 7);
    const before = await snapshot();

    const badPayload = {
      schemaVersion: "1",
      exportedAt: new Date().toISOString(),
      settings: {
        [AUTH_LOCKOUT_THRESHOLD.key]: 3, // 유효한 값
        "action_log.optional_types": "이건 배열이 아니라 문자열이다", // 스키마 위반
      },
    };

    await expect(importSettings(SYSTEM_VIEWER, badPayload)).rejects.toBeInstanceOf(ImportValidationError);

    const after = await snapshot();
    expect(after).toEqual(before);
  });

  it("(d) 내보내기가 excel_export 행동 로그 행 하나를 남긴다", async () => {
    const beforeLogs = await queryActionLog(SYSTEM_VIEWER, { actionType: "excel_export" });
    await exportSettings(SYSTEM_VIEWER);
    const afterLogs = await queryActionLog(SYSTEM_VIEWER, { actionType: "excel_export" });
    expect(afterLogs.length).toBe(beforeLogs.length + 1);
  });

  // 묶음 ④ /review R7 — 가져오기도 설정 화면 저장과 같은 순번 시작값 낮추기 가드(카운터 행 잠금 + 현재 값 비교)를 지난다.
  describe("순번 시작값 가져오기", () => {
    async function issueFrom100(): Promise<void> {
      await setSettingValue(SYSTEM_VIEWER, DOCUMENT_NUMBER_PROJECT_SEQ_START, 100);
      const format = await loadDocumentNumberFormat("project");
      await allocateDocumentNumber(SYSTEM_VIEWER, { counterKey: "project", year: kstYear(new Date()), format });
    }

    function payloadWith(seqStart: number) {
      return { schemaVersion: "1", exportedAt: new Date().toISOString(), settings: { [DOCUMENT_NUMBER_PROJECT_SEQ_START.key]: seqStart } };
    }

    it("올해 발급 뒤 더 낮은 시작값을 가져오면 거부되고 값은 그대로다", async () => {
      await issueFrom100();
      const rejected = importSettings(SYSTEM_VIEWER, payloadWith(50));
      await expect(rejected).rejects.toBeInstanceOf(SeqStartOverlapError);
      await expect(rejected).rejects.toHaveProperty("message", "순번 시작값은 현재 값(100)보다 낮출 수 없음");
      expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEQ_START)).toBe(100);
    });

    it("낮추기가 거부되면 같은 파일의 다른 키도 적용되지 않는다", async () => {
      await issueFrom100();
      await setSettingValue(SYSTEM_VIEWER, AUTH_LOCKOUT_THRESHOLD, 7);
      const payload = { ...payloadWith(50), settings: { ...payloadWith(50).settings, [AUTH_LOCKOUT_THRESHOLD.key]: 3 } };
      await expect(importSettings(SYSTEM_VIEWER, payload)).rejects.toBeInstanceOf(SeqStartOverlapError);
      expect(await getSettingValue(AUTH_LOCKOUT_THRESHOLD)).toBe(7);
    });

    it("올해 발급 뒤 시작값을 올려 가져오면 저장된다", async () => {
      await issueFrom100();
      await importSettings(SYSTEM_VIEWER, payloadWith(120));
      expect(await getSettingValue(DOCUMENT_NUMBER_PROJECT_SEQ_START)).toBe(120);
    });
  });
});
