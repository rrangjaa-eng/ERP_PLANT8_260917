import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { kstDateTimeOf } from "@/lib/kst-date";
import type { DbOrTx } from "@/repositories/document-counters";
import {
  findVendorsChangedSinceLastPayment,
  insertAccountChange,
  listAccountChanges as repoListAccountChanges,
  type AccountChangeSource,
} from "@/repositories/vendor-details";
import { accountNumberLast4 } from "@/domain/vendors/account-digits";

// 07-23 V9 · AQ-35 · AQ-36: 거래처 계좌 변경 기록 — 지급 목록 `계좌 바뀜` · 계좌 바뀜 알림(N14)의 원천.
// 원값은 남기지 않는다(뒤 4자리만 · 07-11 CHECK). 260907은 계좌 변경을 기록하지 않고 알림만 보냈다(server/src/vendors.ts:1128).

// 저장 전 계좌가 있었나 — 세 칸 중 하나라도 있으면 「있던 계좌」다. 처음 넣는 계좌는 변경이 아니다(AQ-36 — 그 위험은 `확인 전`이 맡는다).
export function hadAccount(stored: { bank: string | null; holder: string | null; hasNumber: boolean }): boolean {
  return stored.hasNumber || (stored.bank ?? "").trim() !== "" || (stored.holder ?? "").trim() !== "";
}

// updateVendor 저장 트랜잭션 안에서 부른다 — 판정(accountFieldsChanged · hadAccount)은 호출자가 끝냈다.
// 뒤 4자리는 숫자만 뽑은 끝 4자리(F6 — 4자리 미만 · 없음은 NULL).
export async function writeAccountChange(
  viewer: Viewer,
  input: { vendorId: string; beforeNumberLast4: string | null; afterNumberLast4: string | null; source: AccountChangeSource },
  tx: DbOrTx,
): Promise<{ beforeLast4: string | null; afterLast4: string | null }> {
  const beforeLast4 = accountNumberLast4(input.beforeNumberLast4);
  const afterLast4 = accountNumberLast4(input.afterNumberLast4);
  await insertAccountChange(viewer, { vendorId: input.vendorId, beforeLast4, afterLast4, source: input.source }, tx);
  return { beforeLast4, afterLast4 };
}

export type AccountChangeDto = {
  id: string;
  beforeLast4: string | null;
  afterLast4: string | null;
  // `YYYY-MM-DD HH:mm` KST — 서버가 만든다(화면은 자르지 않는다).
  changedAt: string;
  changedByName: string;
};

type AccountChangeProjected = { id: string; beforeLast4: string | null; afterLast4: string | null; changedAt: string; changedByName: string };

export const ACCOUNT_CHANGE_DTO_SPEC: DtoSpec<AccountChangeProjected, AccountChangeDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "vendor.value" },
    { key: "beforeLast4", from: "beforeLast4", infoItem: "vendor.value" },
    { key: "afterLast4", from: "afterLast4", infoItem: "vendor.value" },
    { key: "changedAt", from: "changedAt", infoItem: "vendor.value" },
    { key: "changedByName", from: "changedByName", infoItem: "vendor.value" },
  ],
};

registerDto({ name: "AccountChangeDto", fields: ACCOUNT_CHANGE_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

// 수정 패널 `계좌 변경 기록` — 거래처 화면을 볼 수 있는 사람에게, 거래처 정보(vendor.value) 노출 판정 뒤. 최신 위.
export async function listAccountChanges(viewer: Viewer, vendorId: string, deps?: { can?: typeof defaultCan }): Promise<Partial<AccountChangeDto>[]> {
  if (!(await (deps?.can ?? defaultCan)(viewer, "admin.vendors", "view"))) return [];
  const rows = await repoListAccountChanges(viewer, vendorId);
  return projectMany(
    viewer,
    rows.map((row) => ({ ...row, changedAt: kstDateTimeOf(row.changedAt) })),
    ACCOUNT_CHANGE_DTO_SPEC,
  );
}

// AQ-36: 계좌가 바뀐 뒤 그 거래처로 아직 지급하지 않은 거래처 id 묶음 — 지급 대상 투영이 쪽마다 한 번 부른다(행마다 부르지 않는다).
export async function accountChangedSinceLastPayment(viewer: Viewer, vendorIds: readonly string[]): Promise<Set<string>> {
  return new Set(await findVendorsChangedSinceLastPayment(viewer, [...new Set(vendorIds)]));
}
