import type { Viewer } from "@/domain/viewer";
import type { SettingDef } from "@/domain/settings/registry";
import type { visible as defaultVisible } from "@/domain/permissions/visible";
import type { SelfApproval } from "@/domain/approvals/route";
import type { InfoItemRef } from "@/domain/permissions/project";

// 04.1(ROADMAP 기준 1): 문서 종류 등록부 — 결재 모듈은 문서 종류를 하드코딩하지
// 않는다. 종류 모듈(domain/leave 등)이 적재될 때 registerDocumentKind로 자기를
// 등록하고, 결재 모듈은 등록된 정의(결재선 설정 로더 · 요약 함수)로만 종류별
// 차이를 받는다 — approvals가 종류 모듈을 import하지 않는다.

export type RouteConfigScope = "drafter_team" | "drafter_org_unit" | "company" | "org_unit";

export type RouteConfigStep = {
  enabled: boolean;
  // "" = 계급 조건 없음.
  roleId: string;
  scope: RouteConfigScope;
  // "" = 특정 부서 없음(scope가 org_unit이면 그 단계는 빈 자리).
  orgUnitId: string;
};

export type RouteConfig = { selfApproval: SelfApproval; steps: RouteConfigStep[] };

// 결재선 설정 키 묶음 — 04.1-04의 설정 화면 경고가 등록된 종류를 순회할 때 쓴다.
export type RouteSettingDefs = {
  selfApproval: SettingDef<SelfApproval>;
  steps: Array<{
    enabled: SettingDef<boolean>;
    roleId: SettingDef<string>;
    scope: SettingDef<RouteConfigScope>;
    orgUnitId: SettingDef<string>;
  }>;
};

export type DescribeDeps = { visible?: typeof defaultVisible };

// 04.1-05(Codex MEDIUM · ENG-17): 결재 시트 · 결재함 상세 행 — 문자열 칸만.
export type DocumentDetailRow = { label: string; value: string; tone: "default" | "muted" | "warning" };
export type DocumentDetailRows = { title: string; subtitle: string; rows: DocumentDetailRow[] };
// now는 엔진이 받은 값을 그대로 넘긴다(CX-B2 — 엔진 · 종류 중간 층은 시계를 읽지 않는다).
export type LoadDetailsDeps = { visible: typeof defaultVisible; now?: Date };
export type DetailFields = Record<string, unknown>;
// 종류의 등록 DTO 명세(DtoSpec과 같은 모양 — 종류마다 키 타입이 달라 구조 타입으로 받는다).
export type DetailDtoSpec = { readonly fields: ReadonlyArray<{ key: string; from: string; infoItem: InfoItemRef }> };

export type DocumentKindDef = {
  kind: string;
  label: string;
  loadRouteConfig: () => Promise<RouteConfig>;
  href: (documentId: string) => string;
  // 결재함 요약 — id 목록을 한 번에 읽어 종류의 DTO로 투영한 값을 돌려준다.
  describeDocuments: (viewer: Viewer, documentIds: string[], deps?: DescribeDeps) => Promise<Map<string, object>>;
  routeSettings?: RouteSettingDefs;
  // 04.1-02: 반려 문서의 「다시 신청」을 보일지 — 있고 참일 때만.
  canResubmit?: (viewer: Viewer) => Promise<boolean>;
  // 04.1-05(ENG-17): 상세 — 순서 고정: loadDetails(구조 필드, id 목록 한 번) → 엔진이 detailDto로 정보 항목별
  // project() → buildDetailRows(투영 결과만)가 문자열 행을 만든다. loadDetails가 있으면 나머지 둘도 필수다.
  loadDetails?: (viewer: Viewer, documentIds: string[], deps: LoadDetailsDeps) => Promise<Map<string, DetailFields>>;
  detailDto?: DetailDtoSpec;
  // 메서드 표기 — 종류가 자기 DTO의 Partial로 받는다(투영 결과 타입).
  buildDetailRows?(projected: Partial<DetailFields>): DocumentDetailRows;
};

export class DuplicateDocumentKindError extends Error {}
export class InvalidDocumentKindError extends Error {}
export class UnknownDocumentKindError extends Error {}

const REGISTRY = new Map<string, DocumentKindDef>();

export function registerDocumentKind(def: DocumentKindDef): void {
  if (REGISTRY.has(def.kind)) throw new DuplicateDocumentKindError(`이미 등록된 문서 종류: ${def.kind}`);
  if (def.loadDetails && (!def.detailDto || !def.buildDetailRows)) {
    throw new InvalidDocumentKindError(`상세 투영 명세 없음: ${def.kind}`);
  }
  REGISTRY.set(def.kind, def);
}

export function getDocumentKind(kind: string): DocumentKindDef {
  const def = REGISTRY.get(kind);
  if (!def) throw new UnknownDocumentKindError(`등록되지 않은 문서 종류: ${kind}`);
  return def;
}

export function listDocumentKinds(): DocumentKindDef[] {
  return [...REGISTRY.values()];
}
