import { project, type DtoSpec, type ProjectDeps } from "@/domain/permissions/project";
import type { Viewer } from "@/domain/viewer";
import { registerDto } from "@/domain/permissions/dto-registry";
import type { ApprovalStatus, DisplayState } from "@/domain/approvals/route";

// 04.1(ROADMAP 기준 5): 결재 DTO — 필드 전부 approval.value에 매핑되어 누수 스캔
// DTO 축에 들어간다. domain/approvals의 유일한 출구다(project()).

export type ApprovalStepView = {
  stepIndex: number;
  label: string;
  state: DisplayState;
  isFallback: boolean;
  holderNames: string;
  actedByName: string | null;
  actedAt: Date | null;
  selfApproved: boolean;
};

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
};

export type ApprovalInboxItemSource = ApprovalInboxItemDto;

export const APPROVAL_INBOX_ITEM_DTO_SPEC: DtoSpec<ApprovalInboxItemSource, ApprovalInboxItemDto> = {
  fields: [
    { key: "instanceId", from: "instanceId", infoItem: "approval.value" },
    { key: "kind", from: "kind", infoItem: "approval.value" },
    { key: "kindLabel", from: "kindLabel", infoItem: "approval.value" },
    { key: "documentId", from: "documentId", infoItem: "approval.value" },
    { key: "href", from: "href", infoItem: "approval.value" },
    { key: "drafterName", from: "drafterName", infoItem: "approval.value" },
    { key: "submittedAt", from: "submittedAt", infoItem: "approval.value" },
    { key: "status", from: "status", infoItem: "approval.value" },
    { key: "version", from: "version", infoItem: "approval.value" },
    { key: "stepLabel", from: "stepLabel", infoItem: "approval.value" },
    { key: "holderNames", from: "holderNames", infoItem: "approval.value" },
    { key: "actedAt", from: "actedAt", infoItem: "approval.value" },
    { key: "actedAction", from: "actedAction", infoItem: "approval.value" },
    { key: "summary", from: "summary", infoItem: "approval.value" },
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
  currentStepIndex: number | null;
  actions: ApprovalAction[];
};

export type ApprovalViewSource = ApprovalViewDto;

export const APPROVAL_VIEW_DTO_SPEC: DtoSpec<ApprovalViewSource, ApprovalViewDto> = {
  fields: [
    { key: "instanceId", from: "instanceId", infoItem: "approval.value" },
    { key: "kind", from: "kind", infoItem: "approval.value" },
    { key: "documentId", from: "documentId", infoItem: "approval.value" },
    { key: "status", from: "status", infoItem: "approval.value" },
    { key: "version", from: "version", infoItem: "approval.value" },
    { key: "round", from: "round", infoItem: "approval.value" },
    { key: "drafterName", from: "drafterName", infoItem: "approval.value" },
    { key: "steps", from: "steps", infoItem: "approval.value" },
    { key: "currentStepIndex", from: "currentStepIndex", infoItem: "approval.value" },
    { key: "actions", from: "actions", infoItem: "approval.value" },
  ],
};

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
