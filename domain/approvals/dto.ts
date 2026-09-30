import { project, type DtoSpec, type ProjectDeps } from "@/domain/permissions/project";
import type { Viewer } from "@/domain/viewer";
import { registerDto } from "@/domain/permissions/dto-registry";
import type { ApprovalStatus, DisplayState } from "@/domain/approvals/route";
import type { DocumentDetailRows } from "@/domain/approvals/kinds";

// 04.1(ROADMAP 기준 5): 결재 DTO — domain/approvals의 유일한 출구다(project()).
// 사용자 결정(2026-09-29 A, PR #90 5891993737): 노출 설정은 「무엇을 보여 줄지」이지 「결재를 할 수 있는지」가
// 아니다 — 구조 값(id · 종류 · 링크 · 상태 · version · 단계 번호 · 가능 행동)은 투영 밖에서 그대로 붙이고(액션
// 결과 DTO의 B-A1과 같은 방식), 이름 · 시각 · 사유 · 요약만 approval.value 뒤에 둔다(누수 스캔 DTO 축).

export type ApprovalStepView = {
  stepIndex: number;
  label: string;
  state: DisplayState;
  isFallback: boolean;
  holderNames: string;
  actedByName: string | null;
  actedAt: Date | null;
  selfApproved: boolean;
  // 04.1-05: 반려 단계의 사유(그 밖 null) · 보는 사람이 지금 단계 담당인가(`(나)` · `내 결재`).
  reason: string | null;
  viewerHolds: boolean;
};

// 04.1-05(S7 끝 줄): 해당할 때만 — 자기 승인 건너뜀 · 회수 시각 · 멈춘 문서의 기안자 줄(danger).
export type ApprovalRouteEndLine = { text: string; tone: "muted" | "danger" };

export type ApprovalInboxItemDto = {
  instanceId: string;
  kind: string;
  kindLabel: string;
  documentId: string;
  href: string;
  drafterName: string;
  submittedAt: Date;
  status: ApprovalStatus;
  version: number;
  stepLabel: string | null;
  holderNames: string | null;
  actedAt: Date | null;
  actedAction: string | null;
  summary: object | null;
  // 04.1-05(CEO-17 · withDetails): `내 결재` 항목의 결재 시트 재료 — 종류 상세(detailDto 투영 뒤 행) ·
  // 결재선 표시 목록 · 끝 줄 · 가능 행동. withDetails가 아니거나 처리함 항목이면 null.
  detail: DocumentDetailRows | null;
  steps: ApprovalStepView[] | null;
  endLines: ApprovalRouteEndLine[] | null;
  actions: ApprovalAction[] | null;
};

export type ApprovalInboxItemSource = ApprovalInboxItemDto;

const INBOX_ITEM_STRUCTURE_KEYS = ["instanceId", "kind", "kindLabel", "documentId", "href", "status", "version", "actions"] as const;
type ApprovalInboxItemStructure = Pick<ApprovalInboxItemDto, (typeof INBOX_ITEM_STRUCTURE_KEYS)[number]>;
type ApprovalInboxItemValues = Omit<ApprovalInboxItemDto, keyof ApprovalInboxItemStructure>;
export type ApprovalInboxItem = ApprovalInboxItemStructure & Partial<ApprovalInboxItemValues>;

export const APPROVAL_INBOX_ITEM_DTO_SPEC: DtoSpec<ApprovalInboxItemValues, ApprovalInboxItemValues> = {
  fields: [
    { key: "drafterName", from: "drafterName", infoItem: "approval.value" },
    { key: "submittedAt", from: "submittedAt", infoItem: "approval.value" },
    { key: "stepLabel", from: "stepLabel", infoItem: "approval.value" },
    { key: "holderNames", from: "holderNames", infoItem: "approval.value" },
    { key: "actedAt", from: "actedAt", infoItem: "approval.value" },
    { key: "actedAction", from: "actedAction", infoItem: "approval.value" },
    { key: "summary", from: "summary", infoItem: "approval.value" },
    { key: "detail", from: "detail", infoItem: "approval.value" },
    { key: "steps", from: "steps", infoItem: "approval.value" },
    { key: "endLines", from: "endLines", infoItem: "approval.value" },
  ],
};

// 04.1-02(X-5): 보는 사람이 지금 할 수 있는 일 — 목록 순서가 화면 1차 · 2차 순서다.
export type ApprovalAction = "approve" | "reject" | "withdraw" | "resubmit";

export type ApprovalViewDto = {
  instanceId: string;
  kind: string;
  documentId: string;
  status: ApprovalStatus;
  version: number;
  round: number;
  drafterName: string;
  steps: ApprovalStepView[];
  endLines: ApprovalRouteEndLine[];
  currentStepIndex: number | null;
  actions: ApprovalAction[];
};

export type ApprovalViewSource = ApprovalViewDto;

const VIEW_STRUCTURE_KEYS = ["instanceId", "kind", "documentId", "status", "version", "round", "currentStepIndex", "actions"] as const;
type ApprovalViewStructure = Pick<ApprovalViewDto, (typeof VIEW_STRUCTURE_KEYS)[number]>;
type ApprovalViewValues = Omit<ApprovalViewDto, keyof ApprovalViewStructure>;
export type ApprovalView = ApprovalViewStructure & Partial<ApprovalViewValues>;

export const APPROVAL_VIEW_DTO_SPEC: DtoSpec<ApprovalViewValues, ApprovalViewValues> = {
  fields: [
    { key: "drafterName", from: "drafterName", infoItem: "approval.value" },
    { key: "steps", from: "steps", infoItem: "approval.value" },
    { key: "endLines", from: "endLines", infoItem: "approval.value" },
  ],
};

function pickStructure<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) result[key] = source[key];
  return result;
}

function omitStructure<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Omit<T, K> {
  const result = { ...source };
  for (const key of keys) delete result[key];
  return result;
}

export async function projectInboxItem(
  viewer: Viewer,
  source: ApprovalInboxItemDto,
  deps?: Partial<ProjectDeps>,
): Promise<ApprovalInboxItem> {
  const values = await project(viewer, omitStructure(source, INBOX_ITEM_STRUCTURE_KEYS), APPROVAL_INBOX_ITEM_DTO_SPEC, deps);
  return { ...pickStructure(source, INBOX_ITEM_STRUCTURE_KEYS), ...values };
}

export async function projectApprovalView(
  viewer: Viewer,
  source: ApprovalViewDto,
  deps?: Partial<ProjectDeps>,
): Promise<ApprovalView> {
  const values = await project(viewer, omitStructure(source, VIEW_STRUCTURE_KEYS), APPROVAL_VIEW_DTO_SPEC, deps);
  return { ...pickStructure(source, VIEW_STRUCTURE_KEYS), ...values };
}

registerDto({
  name: "approvalInboxItem",
  fields: APPROVAL_INBOX_ITEM_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

registerDto({
  name: "approvalView",
  fields: APPROVAL_VIEW_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

// CX-R3: 제출 전 결재선 미리보기. 담당 이름 · 기안자 이름은 approval.value, 자리
// 이름(계급 · 부서 · 전사 · 대표)과 건너뜀 표시는 구조 정보라 role.value.
export type RoutePreviewStepDTO = { label: string; holderNames: string; skipped: boolean };
export type RoutePreviewDTO = { drafterName?: string; steps: Partial<RoutePreviewStepDTO>[] };

export const ROUTE_PREVIEW_DTO_SPEC: DtoSpec<{ drafterName: string }, { drafterName: string }> = {
  fields: [{ key: "drafterName", from: "drafterName", infoItem: "approval.value" }],
};

export const ROUTE_PREVIEW_STEP_DTO_SPEC: DtoSpec<Partial<RoutePreviewStepDTO>, RoutePreviewStepDTO> = {
  fields: [
    { key: "label", from: "label", infoItem: "role.value" },
    { key: "holderNames", from: "holderNames", infoItem: "approval.value" },
    { key: "skipped", from: "skipped", infoItem: "role.value" },
  ],
};

registerDto({
  name: "routePreview",
  fields: ROUTE_PREVIEW_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

registerDto({
  name: "routePreviewStep",
  fields: ROUTE_PREVIEW_STEP_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

// 04.1-02(B-A1 — CX-R3와 같은 규칙): 신청 · 다시 신청 · 승인 · 반려 액션이 돌려주는 토스트
// 재료. 사람 이름은 approval.value, 차감 일수는 leave.value — 투영에서 빠지면 토스트가 그
// 조각을 뺀다. 구조 값(documentId · final)은 투영 밖에서 그대로 붙인다.
export type ApprovalActionResultDto = {
  nextHolderNames: string | null;
  drafterName: string | null;
  deductedDays: string | null;
};

export const APPROVAL_ACTION_RESULT_DTO_SPEC: DtoSpec<Partial<ApprovalActionResultDto>, ApprovalActionResultDto> = {
  fields: [
    { key: "nextHolderNames", from: "nextHolderNames", infoItem: "approval.value" },
    { key: "drafterName", from: "drafterName", infoItem: "approval.value" },
    { key: "deductedDays", from: "deductedDays", infoItem: "leave.value" },
  ],
};

registerDto({
  name: "ApprovalActionResultDto",
  fields: APPROVAL_ACTION_RESULT_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

export type ApprovalActionResult = { documentId: string; final: boolean } & Partial<ApprovalActionResultDto>;

export async function projectActionResult(
  viewer: Viewer,
  raw: { documentId: string; final: boolean } & Partial<ApprovalActionResultDto>,
  deps?: Partial<ProjectDeps>,
): Promise<ApprovalActionResult> {
  const { documentId, final, ...material } = raw;
  const projected = await project(viewer, material, APPROVAL_ACTION_RESULT_DTO_SPEC, deps);
  return { documentId, final, ...projected };
}
