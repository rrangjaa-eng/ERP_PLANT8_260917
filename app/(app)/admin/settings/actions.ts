"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { SETTING_DEFS } from "@/domain/settings/keys";
import { setSettingValue, addHistorizedValue, cancelHistorizedValue, type SettingDef } from "@/domain/settings/registry";
import { exportSettings } from "@/domain/settings/export";
import "./actions.registry";

// ADMN-05: 화면 코드에 설정 키 문자열이 하드코딩돼 있지 않다 — 클라이언트가
// 보낸 key로 SETTING_DEFS에서 정의를 찾는다. 등록되지 않은 키는 거부한다.
// "use server" 파일은 함수 export만 허용한다 — 클래스를 여기서 export하면
// Next.js가 모듈 전체의 export를 인식하지 못한다(실측). 에러 클래스는 이
// 파일 안에서만 쓰는 내부 헬퍼로 둔다. throw는 UserFacingError로 한다 —
// 다른 파일에서 import해 쓰는 것뿐이라 위 제약과 무관하다(defect 1).
function findSettingDef(key: string): SettingDef<unknown> {
  const def = SETTING_DEFS.find((candidate) => candidate.key === key);
  if (!def) throw new UserFacingError(`등록되지 않은 설정 키: ${key}`);
  return def;
}

// 비이력형 저장 — 값 타입은 registry의 zod 스키마가 결정한다(z.coerce.number()가
// 문자열 입력도 받는다). 검증 실패는 domain의 z.parse 예외로 그대로 표면화된다.
export const setSimpleSettingAction = authedActionClient
  .schema(z.object({ key: z.string().min(1), value: z.unknown() }))
  .action(async ({ parsedInput, ctx }) => {
    const def = findSettingDef(parsedInput.key);
    await setSettingValue(ctx.viewer, def, parsedInput.value);
    revalidatePath("/admin/settings");
  });

export const addHistorizedSettingAction = authedActionClient
  .schema(z.object({ key: z.string().min(1), effectiveFrom: z.string().min(1), value: z.unknown() }))
  .action(async ({ parsedInput, ctx }) => {
    const def = findSettingDef(parsedInput.key);
    await addHistorizedValue(ctx.viewer, def, { effectiveFrom: parsedInput.effectiveFrom, value: parsedInput.value });
    revalidatePath("/admin/settings");
  });

export const cancelHistorizedSettingAction = authedActionClient
  .schema(z.object({ key: z.string().min(1), effectiveFrom: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    const def = findSettingDef(parsedInput.key);
    await cancelHistorizedValue(ctx.viewer, def, parsedInput.effectiveFrom);
    revalidatePath("/admin/settings");
  });

// ADMN-06: JSON 내보내기 — 화면의 내보내기 버튼이 이 액션 결과를 클라이언트
// 에서 Blob으로 감싸 다운로드한다(별도 라우트 핸들러 없이 Server Action
// 반환값으로 충분하다). 가져오기는 파일 업로드가 필요해 이 페이즈의 화면
// 범위 밖이고, 대신 명령줄로 한다 — `pnpm settings:import --file <경로>`
// (scripts/settings-import.ts → domain/settings/export.ts의 importSettings,
// docs/OPERATIONS.md §12).
export const exportSettingsAction = authedActionClient.schema(z.object({})).action(async ({ ctx }) => {
  return exportSettings(ctx.viewer);
});
