// 04.3-07 — I4 액션 레지스트리 등록(03-03 선례: actions.ts는 server-only 사슬이라
// 누수 스캔이 이 파일만 import한다).
import { registerAction } from "@/lib/actions/registry";

// 전체 보기 · 고친 값 재열람은 번호(또는 기록 사실)만 돌려주고 DTO 행이 아니다 — 정보 항목
// cert.rrn_unmasked가 이미 게이트다(vendors revealVendorAccountNumberAction과 같은 dtoName: null 예외).
registerAction({
  name: "revealCertRrnAction",
  menu: "certs.submissions",
  action: "view",
  dtoName: null,
});

registerAction({
  name: "reopenCertRrnAction",
  menu: "certs.submissions",
  action: "view",
  dtoName: null,
});

registerAction({
  name: "correctCertSubmissionAction",
  menu: "certs.submissions",
  action: "write",
  dtoName: "CertSubmissionReviewDto",
});

// 04.3-17 — 「대조 제외」는 결과 종류 · 행사 id · 이름만 돌려준다(행 DTO 없음 — 이름은 그 사람이 I4에서 이미 본 값).
registerAction({
  name: "excludeCertSubmissionAction",
  menu: "certs.submissions",
  action: "write",
  dtoName: null,
});
