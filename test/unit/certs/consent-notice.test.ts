import { describe, expect, it } from "vitest";
import { CERT_CONSENT_VERSION, CONTACT_PHONE_SLOT, certCollectionNotice } from "@/domain/certs/consent";

// 04.3-14 사용자 결정 ① · ⑥ — 동의 대신 법령에 따른 수집 안내(판 v3). 문장은 판별로 고정한다 — 이 기대 문장과 한 글자라도
// 다르면 깨진다. 문장을 바꾸려면 판을 올리고 새 판의 기대 문장을 더한다(판별 전문 보존 — T-04.3-307). 변형은 현장 · 택배 둘뿐.

const RETENTION_YEARS = 5;
const CONTACT_PHONE = "02-1234-5678";

const ONSITE = {
  summary:
    "이름 · 주민등록번호 · 연락처 · 서명을 경품 전달과 세무 신고를 위해 법령에 따라 받습니다. 제출한 해가 끝나고 법정 신고기한이 지난 날부터 5년 동안 보관한 뒤 파기합니다. 제출하지 않으면 경품을 드릴 수 없습니다.",
  sections: [
    { title: "처리자 · 문의", body: "PLANT8 · 경영관리 {문의 전화}" },
    { title: "받는 항목", body: "이름 · 주민등록번호(외국인은 외국인등록번호) · 연락처 · 서명 이미지." },
    {
      title: "받는 근거",
      body: "주민등록번호: 소득세법 제127조 · 제145조 · 제164조, 국세기본법 시행령 제68조제3항, 개인정보 보호법 제24조의2제1항제1호. 외국인등록번호: 개인정보 보호법 제24조제1항제2호. 그 밖의 항목: 개인정보 보호법 제15조제1항제2호 · 제4호. 법령에 따라 받는 정보라 따로 동의를 받지 않습니다.",
    },
    { title: "쓰는 곳", body: "경품 전달 · 기타소득 세무 신고. 서명은 경품 수령 확인에 씁니다." },
    { title: "보관 기간", body: "제출한 해가 끝나고 법정 신고기한이 지난 날부터 5년(국세기본법 제85조의3제2항)." },
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

const PARCEL = {
  summary:
    "이름 · 주민등록번호 · 주소 · 연락처 · 서명을 경품 전달과 세무 신고를 위해 법령에 따라 받습니다. 제출한 해가 끝나고 법정 신고기한이 지난 날부터 5년 동안 보관한 뒤 파기합니다. 제출하지 않으면 경품을 드릴 수 없습니다.",
  sections: ONSITE.sections.map((section) =>
    section.title === "받는 항목"
      ? { title: "받는 항목", body: "이름 · 주민등록번호(외국인은 외국인등록번호) · 주소 · 연락처 · 서명 이미지." }
      : section,
  ),
};

// 법령 원문 대조(5906128673)의 조문 — 개수가 아니라 각각을 본다(E4-B8).
const STATUTES = [
  "소득세법 제127조",
  "제145조",
  "제164조",
  "국세기본법 시행령 제68조제3항",
  "개인정보 보호법 제24조의2제1항제1호",
  "개인정보 보호법 제24조제1항제2호",
  "개인정보 보호법 제15조제1항제2호",
  "제4호",
  "개인정보 보호법 제21조",
  "같은 법 시행령 제16조",
  "개인정보 보호법 제17조제1항제2호",
  "국세기본법 제85조의3제2항",
];

// 수령자 화면 금지어 둘(SYSTEM §6-5)과 없어진 명단 문장.
const FORBIDDEN = ["원천징수", "지급명세서", "등록한 이름", "당첨자로 등록"];

function allText(notice: ReturnType<typeof certCollectionNotice>): string {
  return [notice.summary, ...notice.sections.flatMap((section) => [section.title, section.body])].join("\n");
}

describe("수집 안내 v3", () => {
  it("판은 v3다", () => {
    expect(CERT_CONSENT_VERSION).toBe("v3");
  });

  it("현장 변형의 요약 · 전문 8절이 카피 계약 그대로다", () => {
    expect(certCollectionNotice({ parcel: false, retentionYears: RETENTION_YEARS })).toEqual(ONSITE);
  });

  it("택배 변형의 요약 · 전문 8절이 카피 계약 그대로다", () => {
    expect(certCollectionNotice({ parcel: true, retentionYears: RETENTION_YEARS })).toEqual(PARCEL);
  });

  it("전문 1절의 문의 전화는 자리표다 — 화면이 tel: 링크를 끼운다(G9 a)", () => {
    for (const parcel of [false, true]) {
      const [first] = certCollectionNotice({ parcel, retentionYears: RETENTION_YEARS }).sections;
      expect(first?.body).toContain(CONTACT_PHONE_SLOT);
      expect(allText(certCollectionNotice({ parcel, retentionYears: RETENTION_YEARS }))).not.toContain(CONTACT_PHONE);
    }
    expect(CONTACT_PHONE_SLOT).toBe("{문의 전화}");
  });

  it("두 변형 어디에도 금지어 둘 · 명단 문장이 없다", () => {
    for (const parcel of [false, true]) {
      const text = allText(certCollectionNotice({ parcel, retentionYears: RETENTION_YEARS }));
      for (const word of FORBIDDEN) expect(text).not.toContain(word);
    }
  });

  it("두 변형 모두 조문 열둘을 담는다", () => {
    for (const parcel of [false, true]) {
      const text = allText(certCollectionNotice({ parcel, retentionYears: RETENTION_YEARS }));
      for (const statute of STATUTES) expect(text).toContain(statute);
    }
  });

  it("택배 변형에만 주소가 있다", () => {
    expect(allText(certCollectionNotice({ parcel: true, retentionYears: RETENTION_YEARS }))).toContain("주소");
    expect(allText(certCollectionNotice({ parcel: false, retentionYears: RETENTION_YEARS }))).not.toContain("주소");
  });

  it("보존 연수는 페이지가 준 판의 값이다", () => {
    const notice = certCollectionNotice({ parcel: false, retentionYears: 7 });
    expect(notice.summary).toContain("지난 날부터 7년 동안");
    expect(notice.sections.find((section) => section.title === "보관 기간")?.body).toBe(
      "제출한 해가 끝나고 법정 신고기한이 지난 날부터 7년(국세기본법 제85조의3제2항).",
    );
  });
});
