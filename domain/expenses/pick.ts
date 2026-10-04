import type { Viewer } from "@/domain/viewer";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { normalizeVendorName } from "@/domain/vendors";
import { codeLabelsOf } from "@/domain/expenses";
import { listVendorsForPick } from "@/repositories/vendors";

// 05-07 골라내기(S14) 서버 판정 — 행마다 고를 수 있음 · 이유 · 그룹을 서버가 만든다. 행은 투영 DTO다(폼 선택지도 `registerDto`된
// DTO — 누수 스캔 DTO 축이 본다). 한 번에 50행까지, 넘으면 truncated.

export const PICK_LIMIT = 50;

// 거래처 행 — 이름 · 기본 증빙 종류(코드 값 · 이름)는 거래처 정보(vendor.value)다. 프로젝트 등록 폼 선택지(`ProjectVendorOptionDto`)와 같은 항목.
export type PickVendorOptionDto = {
  id: string;
  name: string;
  defaultEvidenceType: string | null;
  defaultEvidenceName: string | null;
};

export const PICK_VENDOR_OPTION_SPEC: DtoSpec<PickVendorOptionDto, PickVendorOptionDto> = {
  fields: (["id", "name", "defaultEvidenceType", "defaultEvidenceName"] as const).map((key) => ({ key, from: key, infoItem: "vendor.value" })),
};

registerDto({ name: "PickVendorOptionDto", fields: PICK_VENDOR_OPTION_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

// 거래처 고르기 · 바꾸기 — 숨김 · 보관 거래처는 목록에 없다. 검색어는 이름 부분 일치(비면 이름순 앞 50행).
// 정보 노출표가 vendor.value를 가리면 행이 비어 id째 없다(이름이 새지 않는다).
export async function searchVendorsForPick(viewer: Viewer, input: { query: string }): Promise<{ rows: Partial<PickVendorOptionDto>[]; truncated: boolean }> {
  if (!(await can(viewer, "expenses", "write"))) throw new ForbiddenError("지출결의 작성 권한 없음");
  const found = await listVendorsForPick(viewer, { normalizedQuery: normalizeVendorName(input.query), limit: PICK_LIMIT + 1 });
  const evidenceNames = await codeLabelsOf(viewer, "evidence_type");
  const options: PickVendorOptionDto[] = found.slice(0, PICK_LIMIT).map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    defaultEvidenceType: vendor.defaultEvidenceType,
    defaultEvidenceName: vendor.defaultEvidenceType ? (evidenceNames.get(vendor.defaultEvidenceType) ?? vendor.defaultEvidenceType) : null,
  }));
  const rows = (await projectMany(viewer, options, PICK_VENDOR_OPTION_SPEC)).filter((row) => row.id !== undefined);
  return { rows, truncated: found.length > PICK_LIMIT };
}
