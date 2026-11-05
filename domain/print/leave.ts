import type { Viewer } from "@/domain/viewer";
import type { LeaveRequestBalanceDto } from "@/domain/leave/dto";

// 07.4-02 RED 단계 자리표시 — 구현은 GREEN 커밋에서.
export type LeavePrintDto = {
  submittedAt: Date | null;
  divisionName: string | null;
  teamName: string | null;
  roleName: string | null;
  balance: Partial<LeaveRequestBalanceDto> | null;
};

export async function getLeavePrint(viewer: Viewer, leaveId: string, deps?: { now?: Date }): Promise<Partial<LeavePrintDto> | null> {
  void viewer;
  void leaveId;
  void deps;
  return null;
}
