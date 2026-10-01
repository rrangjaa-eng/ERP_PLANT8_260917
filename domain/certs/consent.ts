// 04.3-02 Task 2 — 순수, 클라이언트도 import 가능(서버 · 클라이언트 안내 판을 같은 상수로 맞춘다).
// 04.3-14 사용자 결정 ① · ⑥ — v3 = 동의가 아니라 법령에 따른 수집 안내(주민등록번호는 동의로 받을 수 없다 — 개인정보 보호법
// 제24조의2제1항). 문장을 바꾸면 판을 올리고 test/unit/certs/consent-notice.test.ts에 새 판의 기대 문장을 더한다(판별 전문
// 보존 — 무엇을 안내했는지 판으로 증명한다). v2 문장은 실제 수집에 쓰인 적이 없어 남기지 않는다(git 이력). 법무 확인 전 초안.
// 수령자 화면 금지어 둘(SYSTEM §6-5)은 쓰지 않는다.
export const CERT_CONSENT_VERSION = "v3";

/** 전문 1절의 문의 전화 자리 — 화면이 그 행사 문의 전화의 `tel:` 링크를 끼운다(G9 a). */
export const CONTACT_PHONE_SLOT = "{문의 전화}";

export type CertCollectionNotice = { summary: string; sections: { title: string; body: string }[] };

// 변형은 현장 · 택배 둘뿐이다(택배만 주소). retentionYears는 페이지가 준 판의 보존 연수.
export function certCollectionNotice({
  parcel,
  retentionYears,
}: {
  parcel: boolean;
  retentionYears: number;
}): CertCollectionNotice {
  const address = parcel ? "주소 · " : "";
  return {
    summary: `이름 · 주민등록번호 · ${address}연락처 · 서명을 경품 전달과 세무 신고를 위해 법령에 따라 받습니다. 제출한 해가 끝나고 법정 신고기한이 지난 날부터 ${retentionYears}년 동안 보관한 뒤 파기합니다. 제출하지 않으면 경품을 드릴 수 없습니다.`,
    sections: [
      { title: "처리자 · 문의", body: `PLANT8 · 경영관리 ${CONTACT_PHONE_SLOT}` },
      { title: "받는 항목", body: `이름 · 주민등록번호(외국인은 외국인등록번호) · ${address}연락처 · 서명 이미지.` },
      {
        title: "받는 근거",
        body: "주민등록번호: 소득세법 제127조 · 제145조 · 제164조, 국세기본법 시행령 제68조제3항, 개인정보 보호법 제24조의2제1항제1호. 외국인등록번호: 개인정보 보호법 제24조제1항제2호. 그 밖의 항목: 개인정보 보호법 제15조제1항제2호 · 제4호. 법령에 따라 받는 정보라 따로 동의를 받지 않습니다.",
      },
      { title: "쓰는 곳", body: "경품 전달 · 기타소득 세무 신고. 서명은 경품 수령 확인에 씁니다." },
      {
        title: "보관 기간",
        body: `제출한 해가 끝나고 법정 신고기한이 지난 날부터 ${retentionYears}년(국세기본법 제85조의3제2항).`,
      },
      {
        title: "파기",
        body: "보관 기간이 지나면 위 항목을 되살릴 수 없게 지웁니다(개인정보 보호법 제21조 · 같은 법 시행령 제16조).",
      },
      {
        title: "제공",
        body: "관할 세무서에 제출합니다. 법령상 의무입니다(소득세법 제164조 · 개인정보 보호법 제17조제1항제2호). 그 밖에는 제공하지 않습니다.",
      },
      { title: "제출하지 않으면", body: "경품을 드릴 수 없습니다." },
    ],
  };
}
