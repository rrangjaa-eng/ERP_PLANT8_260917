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
