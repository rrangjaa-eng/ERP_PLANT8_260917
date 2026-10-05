import type { Viewer } from "@/domain/viewer";
import type { SettingDef } from "@/domain/settings/registry";
import type { visible as defaultVisible } from "@/domain/permissions/visible";
import type { SelfApproval } from "@/domain/approvals/route";
import type { InfoItemRef } from "@/domain/permissions/project";
import type { ApprovalRouteScopeValue } from "@/domain/settings/keys";
import type { DbOrTx } from "@/repositories/document-counters";
import type { Currency } from "@/domain/money/currency";

// 04.1(ROADMAP 기준 1): 문서 종류 등록부 — 결재 모듈은 문서 종류를 하드코딩하지
// 않는다. 종류 모듈(domain/leave 등)이 적재될 때 registerDocumentKind로 자기를
// 등록하고, 결재 모듈은 등록된 정의(결재선 설정 로더 · 요약 함수)로만 종류별
// 차이를 받는다 — approvals가 종류 모듈을 import하지 않는다.

// 선택지 원본은 설정 키 한 곳(APPROVAL_ROUTE_SCOPE_VALUES) — 한쪽만 늘면 컴파일이 잡는다(/review).
export type RouteConfigScope = ApprovalRouteScopeValue;

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

// 05-01 E5(Round 4 D2 · Z2 A): 결재함 요약 — 종류가 자기 투영 뒤 값으로 만든 열린 모양. 엔진 · 결재함이 읽는 선택 필드는 넷이고
// (보이지 않는 값이면 싣지 않는다), 나머지 키는 종류 필드 그대로다. 금액은 domain/money Money와 같은 네 숫자 필드(Round 2 P3-1),
// 일수 갈래의 text는 종류가 자기 서식으로 만든 글자다.
export type DocumentMeasure =
  | { kind: "money"; money: { currency: Currency; amount: number; fxRate: number; amountKrw: number } }
  | { kind: "days"; quarters: number; text: string };

export type DocumentSummary = {
  measure?: DocumentMeasure | null;
  // 결재함 문서 칸 · 확인 창 부제의 대상 조각 — 종류 라벨 뒤 글자.
  documentText?: string;
  number?: string | null;
  // 최종 승인 토스트 꼬리(예: 정산 결재 `{프로젝트 번호} 완료`).
  finalApprovalNote?: string;
  // 05-10: 첫 화면 「내 차례」 한 줄의 대상 · 상황 글자 — 종류가 투영 뒤 값으로 만든다(없으면 그 문서는 대상 글자 없이 `{종류} 열기`만).
  nextTurnText?: { target: string; situation: string };
  [key: string]: unknown;
};

// 04.1-05(Codex MEDIUM · ENG-17): 결재 시트 · 결재함 상세 행 — 문자열 칸만. 05-10(D9): 증빙 갈래는 같은 행에 선택 칸 `files`를 더한 것이다
// (파일 id · 이름 · 크기 · 형식만 — 주소는 시트가 열릴 때 서버가 권한 판정 뒤 만든다). 문자열 칸 `value`는 파일 이름 글자라 칸을 모르는 소비자도 읽는다.
export type DocumentDetailEvidenceFile = { id: string; name: string; sizeBytes: number; contentType: string };
export type DocumentDetailRow = { label: string; value: string; tone: "default" | "muted" | "warning"; files?: DocumentDetailEvidenceFile[] };
export type DocumentDetailRows = { title: string; subtitle: string; rows: DocumentDetailRow[] };
// now는 엔진이 받은 값을 그대로 넘긴다(CX-B2 — 엔진 · 종류 중간 층은 시계를 읽지 않는다).
export type LoadDetailsDeps = { visible: typeof defaultVisible; now?: Date };
export type DetailFields = Record<string, unknown>;
// 종류의 등록 DTO 명세(DtoSpec과 같은 모양 — 종류마다 키 타입이 달라 구조 타입으로 받는다).
export type DetailDtoSpec = { readonly fields: ReadonlyArray<{ key: string; from: string; infoItem: InfoItemRef }> };

export type ResubmittableStatus = "rejected" | "withdrawn";

export type DocumentKindDef = {
  kind: string;
  label: string;
  loadRouteConfig: () => Promise<RouteConfig>;
  href: (documentId: string) => string;
  // 결재함 요약 — id 목록을 한 번에 읽어 종류의 DTO로 투영한 값을 돌려준다.
  describeDocuments: (viewer: Viewer, documentIds: string[], deps?: DescribeDeps) => Promise<Map<string, DocumentSummary>>;
  routeSettings?: RouteSettingDefs;
  // 04.1-02: 반려 문서의 「다시 신청」을 보일지 — 있고 참일 때만. 05-01(Round 4 D5): 엔진이 그 문서 id를 둘째 인자로 넘긴다.
  canResubmit?: (viewer: Viewer, documentId?: string) => Promise<boolean>;
  // 05-01 E1: 기안자가 같은 문서를 다시 제출할 수 있는 상태 — 없으면 ["rejected"](resubmittableStatuses).
  resubmitFrom?: readonly ResubmittableStatus[];
  // 05-01 E2: 최종 승인 훅 짝 — prepareFinalApproval은 트랜잭션 전(풀 읽기 가능), onFinalApprovalInTx는 최종 승인과
  // 같은 tx 안에서 단계 기록 뒤 · 행동 로그 전에 불린다(tx를 받는 리포지토리 호출만). 던지면 승인 전체가 롤백된다.
  prepareFinalApproval?: (viewer: Viewer, documentId: string) => Promise<unknown>;
  onFinalApprovalInTx?: (viewer: Viewer, documentId: string, tx: DbOrTx, prepared: unknown) => Promise<void>;
  // 05-01 E3: 지금 담당에게 `승인`을 막아 보일 이유(문서 id → 글자) — 표시 전용, 서버 승인 판정은 보지 않는다(최종 판정은 훅).
  // 엔진은 viewer가 지금 담당인 문서 id를 종류마다 한 배열로 한 번 넘긴다(트랜잭션 없음 · 읽기 전용).
  approveBlockedReason?: (viewer: Viewer, documentIds: string[]) => Promise<Map<string, string>>;
  // 05-10 G1: 승인된 기안 문서가 승인 뒤에 막혔음을 기안자의 「내 차례」 [막힘] 줄로 알릴 때(증빙 무효 등) — 문서 id → 상황 글자 · 행동 글자 · 주소.
  // 엔진은 기안자의 승인 문서 id를 종류마다 한 배열로 한 번 넘긴다(읽기 전용). 없으면 이 종류는 승인 뒤 막힘이 없다.
  blockedAfterApproval?: (viewer: Viewer, documentIds: string[]) => Promise<Map<string, { situation: string; actionLabel: string; href: string }>>;
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
  if (Boolean(def.prepareFinalApproval) !== Boolean(def.onFinalApprovalInTx)) {
    throw new InvalidDocumentKindError(`최종 승인 훅 짝 없음: ${def.kind}`);
  }
  REGISTRY.set(def.kind, def);
}

const DEFAULT_RESUBMIT_FROM: readonly ResubmittableStatus[] = ["rejected"];

export function resubmittableStatuses(def: Pick<DocumentKindDef, "resubmitFrom">): readonly ResubmittableStatus[] {
  return def.resubmitFrom ?? DEFAULT_RESUBMIT_FROM;
}

export function getDocumentKind(kind: string): DocumentKindDef {
  const def = REGISTRY.get(kind);
  if (!def) throw new UnknownDocumentKindError(`등록되지 않은 문서 종류: ${kind}`);
  return def;
}

export function listDocumentKinds(): DocumentKindDef[] {
  return [...REGISTRY.values()];
}
