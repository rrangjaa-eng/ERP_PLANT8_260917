// 04.3-10 — 액션 레지스트리 등록(03-03 선례: actions.ts는 server-only 사슬이라 누수 스캔이 이 파일만 import한다).
import { registerAction } from "@/lib/actions/registry";

// 신청은 {eventId}만 돌려준다 — 행 DTO가 없다.
registerAction({
  name: "requestCertQrAction",
  menu: "certs.events",
  action: "write",
  dtoName: null,
});

// QR 생성의 버전 충돌 갈래가 경품 줄 DTO(가액 키는 cert_prize.value)를 싣는다.
registerAction({
  name: "generateCertQrAction",
  menu: "certs.qr",
  action: "write",
  dtoName: "CertPrizeDto",
});

// 저장 결과(saved · conflict)가 경품 줄 DTO(가액 키는 cert_prize.value)를 싣는다.
registerAction({
  name: "saveCertPrizesAction",
  menu: "certs.qr",
  action: "write",
  dtoName: "CertPrizeDto",
});

// 04.3-17 — 「링크 닫기」는 결과 종류와 제출 수만 돌려준다(행 DTO 없음).
registerAction({
  name: "closeCertEventAction",
  menu: "certs.qr",
  action: "write",
  dtoName: null,
});

// 04.3-17 — 「신청 취소」는 결과 종류 · 행사 이름 · 경품 줄 수만 돌려준다(행 DTO 없음). 신청자(certs.events 쓰기) 또는
// 경영관리(certs.qr 쓰기)가 부른다 — 판정은 domain cancelRequest(H-2).
registerAction({
  name: "cancelCertRequestAction",
  menu: "certs.events",
  action: "write",
  dtoName: null,
});

// 04.3-17 검토 X4 — 착지 토스트 쿠키 지우기. 돌려주는 값이 결과 종류뿐이고 쓰기가 없다 — 목록을 볼 수 있는 사람이 부른다.
registerAction({
  name: "clearCertCancelledToastAction",
  menu: "certs.events",
  action: "view",
  dtoName: null,
});
