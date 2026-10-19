// D-38(03-03 선례): 액션 레지스트리 등록을 actions.ts("use server", server-only 의존 체인)와 분리한다.
import { registerAction } from "@/lib/actions/registry";

// 06.1-04 — 증빙 엑셀 파일 등록(FormData 파일 하나). 결과는 건수 + 이름 다름 줄(EvidenceImportResultDto).
registerAction({
  name: "registerEvidenceFileAction",
  menu: "evidence.intake",
  action: "write",
  dtoName: "EvidenceImportResultDto",
});

// 06.1-05 — 공개 범위 저장. 결과는 저장 줄 수 · 시각 + 화면에 보이던 저장 줄의 다시 읽은 행(EvidenceRecordDto — O-6106) 또는 거부 칸(줄 id · 이유).
registerAction({ name: "publishEvidenceRecordsAction", menu: "evidence.intake", action: "write", dtoName: "EvidenceRecordDto" });

// 06.1-05 — 증빙 보관 · 되살림(DA-7). 결과는 줄 id · 새 version 또는 충돌 글자(행 DTO 없음).
registerAction({ name: "archiveEvidenceRecordAction", menu: "evidence.intake", action: "write", dtoName: null });
registerAction({ name: "restoreEvidenceRecordAction", menu: "evidence.intake", action: "write", dtoName: null });

// 06.1-07 — S3 증빙 패널. 상세는 EvidenceDetailDto(금액 셋 = 증빙 금액 · 나머지 = 증빙 내용), 미리 보기는 세액 · 합계 두 수 또는 이유 한 줄,
// 저장 · 풀기는 줄 id · 새 version 또는 충돌 글자(행 DTO 없음).
registerAction({ name: "getEvidenceDetailAction", menu: "evidence.intake", action: "view", dtoName: "EvidenceDetailDto" });
registerAction({ name: "previewEvidenceAmountAction", menu: "evidence.intake", action: "view", dtoName: null });
registerAction({ name: "updateEvidenceAmountAction", menu: "evidence.intake", action: "write", dtoName: null });
registerAction({ name: "clearRecordNeedsCheckAction", menu: "evidence.intake", action: "write", dtoName: null });
