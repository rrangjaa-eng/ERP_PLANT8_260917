import type { SettlementApprovalAuthority } from "@/domain/settlements";
import { changeProjectStatus } from "@/domain/projects/status";
import type { Viewer } from "@/domain/viewer";

// 05-11 — 정산 → 완료는 정산 결재 승인으로만 간다(trigger approval + 정산 모듈만 만드는 권한 값). 완료 전환의 잠금 · 자동 정산 선판정 ·
// 견적 줄 잠금 같은 다른 규칙을 결재 문서 없이 재는 기존 테스트만 이 테스트 전용 권한 값으로 결재 경로를 부른다(운영 코드에는 캐스트 0건 —
// 권한 판정 자체는 settlement-approval.test.ts가 잰다).
export function testSettlementAuthority(projectId: string): SettlementApprovalAuthority {
  return { projectId, documentId: projectId } as SettlementApprovalAuthority;
}

export function completeViaApproval(
  viewer: Viewer,
  projectId: string,
  deps?: Omit<NonNullable<Parameters<typeof changeProjectStatus>[3]>, "approvalAuthority">,
): Promise<void> {
  return changeProjectStatus(viewer, projectId, { from: "settling", to: "completed", trigger: "approval" }, { ...deps, approvalAuthority: testSettlementAuthority(projectId) });
}
