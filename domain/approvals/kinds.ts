import type { Viewer } from "@/domain/viewer";
import type { SettingDef } from "@/domain/settings/registry";
import type { visible as defaultVisible } from "@/domain/permissions/visible";
import type { SelfApproval } from "@/domain/approvals/route";

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
};

export class DuplicateDocumentKindError extends Error {}
export class UnknownDocumentKindError extends Error {}

const REGISTRY = new Map<string, DocumentKindDef>();

export function registerDocumentKind(def: DocumentKindDef): void {
  if (REGISTRY.has(def.kind)) throw new DuplicateDocumentKindError(`이미 등록된 문서 종류: ${def.kind}`);
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
