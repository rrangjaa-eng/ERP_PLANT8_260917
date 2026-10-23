import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import type { DbOrTx } from "@/repositories/document-counters";
import { archiveContacts, insertContact, listLiveContacts, lockLiveContacts, updateContact } from "@/repositories/vendor-details";

// 07-23 V7 · N4: 거래처 담당자 — 여럿(260907은 한 명 칸). 거래처 저장과 같은 트랜잭션 · 같은 version 검사로 목록 전체를 맞춘다(보낸 순서 = 정한 순서).
// 빠진 줄은 보관한다. 판정(상한 · 이름 · 이메일)은 트랜잭션 전 — 거절이면 거래처 본문도 저장하지 않는다.

export const VENDOR_CONTACTS_MAX = 5;

export class VendorContactsError extends UserFacingError {}

export type VendorContactInput = { id?: string; name: string; phone?: string | null; email?: string | null };

type JudgedContact = { id: string | undefined; name: string; phone: string | null; email: string | null };

// 이메일은 모양만 본다(@ 앞뒤 · 점 있는 도메인) — 보낼 곳 확인은 사람이 한다.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export function judgeContacts(list: readonly VendorContactInput[]): JudgedContact[] {
  if (list.length > VENDOR_CONTACTS_MAX) throw new VendorContactsError(`담당자 최대 ${VENDOR_CONTACTS_MAX}명`);
  return list.map((item) => {
    const name = item.name.trim();
    if (name === "") throw new VendorContactsError("담당자 이름 입력");
    const email = blankToNull(item.email);
    if (email !== null && !EMAIL_SHAPE.test(email)) throw new VendorContactsError("담당자 이메일 확인 · 다시 입력");
    return { id: item.id, name, phone: blankToNull(item.phone), email };
  });
}

// 거래처 저장 트랜잭션 안에서 부른다 — 살아 있는 줄을 잠그고, 보낸 id가 이 거래처의 살아 있는 줄이면 고치고(아니면 새 줄), 빠진 줄은 보관.
export async function saveVendorContacts(viewer: Viewer, vendorId: string, judged: readonly JudgedContact[], tx: DbOrTx): Promise<void> {
  const live = await lockLiveContacts(viewer, vendorId, tx);
  const liveIds = new Set(live.map((row) => row.id));
  const kept = new Set<string>();
  for (const [sortOrder, item] of judged.entries()) {
    const values = { name: item.name, phone: item.phone, email: item.email, sortOrder };
    if (item.id !== undefined && liveIds.has(item.id) && !kept.has(item.id)) {
      kept.add(item.id);
      await updateContact(viewer, item.id, values, tx);
    } else {
      await insertContact(viewer, vendorId, values, tx);
    }
  }
  await archiveContacts(
    viewer,
    live.filter((row) => !kept.has(row.id)).map((row) => row.id),
    tx,
  );
}

export type VendorContactDto = { id: string; name: string; phone: string | null; email: string | null };

const VENDOR_CONTACT_DTO_SPEC: DtoSpec<VendorContactDto, VendorContactDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "vendor.value" },
    { key: "name", from: "name", infoItem: "vendor.value" },
    { key: "phone", from: "phone", infoItem: "vendor.value" },
    { key: "email", from: "email", infoItem: "vendor.value" },
  ],
};

registerDto({ name: "VendorContactDto", fields: VENDOR_CONTACT_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

// 수정 패널 `담당자` — 거래처 화면을 볼 수 있는 사람에게, 거래처 정보(vendor.value) 노출 판정 뒤.
export async function listVendorContacts(viewer: Viewer, vendorId: string, deps?: { can?: typeof defaultCan }): Promise<Partial<VendorContactDto>[]> {
  if (!(await (deps?.can ?? defaultCan)(viewer, "admin.vendors", "view"))) return [];
  const rows = await listLiveContacts(viewer, vendorId);
  return projectMany(
    viewer,
    rows.map((row) => ({ id: row.id, name: row.name, phone: row.phone, email: row.email })),
    VENDOR_CONTACT_DTO_SPEC,
  );
}
