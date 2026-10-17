// D-38(03-03 선례): 액션 레지스트리 등록을 actions.ts("use server", server-only 의존 체인)와 분리한다.
import { registerAction } from "@/lib/actions/registry";

// 06.1-04 — 증빙 엑셀 파일 등록(FormData 파일 하나). 결과는 건수 + 이름 다름 줄(EvidenceImportResultDto).
registerAction({
  name: "registerEvidenceFileAction",
  menu: "evidence.intake",
  action: "write",
  dtoName: "EvidenceImportResultDto",
});

// 06.1-05 — 공개 범위 저장. 결과는 저장 줄 수 · 시각 또는 거부 칸(줄 id · 상태 낱말)이라 행 DTO가 없다.
registerAction({ name: "publishEvidenceRecordsAction", menu: "evidence.intake", action: "write", dtoName: null });
