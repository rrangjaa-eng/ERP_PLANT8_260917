// 2026·2027 공식 공휴일 목록(법정·대체) — 규칙 함수 결과가 아니라 손으로 적은 기대값이다. 선거일·임시공휴일은 뺐다.
// 사용자 확인(2026-09-25 카드) — 노동절·제헌절 2026부터 법정·대체 대상(「둘 다 공휴일」). 공식 출처(law.go.kr lsiSeq=285779, kasa.go.kr plcyBrfNo=431)는 이 컨테이너에서 접속 불가
// 출처: https://www.law.go.kr/lsInfoP.do?lsiSeq=285779&viewCls=lsRvsDocInfoR (관공서의 공휴일에 관한 규정 제2·3조)
// 출처: https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=431 (우주항공청 월력요항)
// 확인 날짜: 2026-09-25 (KST) · 확인한 사람: 사용자 확인(2026-09-25 카드)
export type OfficialHoliday = { date: string; name: string; kind: "statutory" | "substitute" };

export const OFFICIAL_2026: readonly OfficialHoliday[] = [
  { date: "2026-01-01", name: "1월 1일", kind: "statutory" },
  { date: "2026-02-16", name: "설날 연휴", kind: "statutory" },
  { date: "2026-02-17", name: "설날", kind: "statutory" },
  { date: "2026-02-18", name: "설날 연휴", kind: "statutory" },
  { date: "2026-03-01", name: "3·1절", kind: "statutory" },
  { date: "2026-03-02", name: "3·1절", kind: "substitute" },
  { date: "2026-05-01", name: "노동절", kind: "statutory" },
  { date: "2026-05-05", name: "어린이날", kind: "statutory" },
  { date: "2026-05-24", name: "부처님오신날", kind: "statutory" },
  { date: "2026-05-25", name: "부처님오신날", kind: "substitute" },
  { date: "2026-06-06", name: "현충일", kind: "statutory" },
  { date: "2026-07-17", name: "제헌절", kind: "statutory" },
  { date: "2026-08-15", name: "광복절", kind: "statutory" },
  { date: "2026-08-17", name: "광복절", kind: "substitute" },
  { date: "2026-09-24", name: "추석 연휴", kind: "statutory" },
  { date: "2026-09-25", name: "추석", kind: "statutory" },
  { date: "2026-09-26", name: "추석 연휴", kind: "statutory" },
  { date: "2026-10-03", name: "개천절", kind: "statutory" },
  { date: "2026-10-05", name: "개천절", kind: "substitute" },
  { date: "2026-10-09", name: "한글날", kind: "statutory" },
  { date: "2026-12-25", name: "기독탄신일", kind: "statutory" },
];

export const OFFICIAL_2027: readonly OfficialHoliday[] = [
  { date: "2027-01-01", name: "1월 1일", kind: "statutory" },
  { date: "2027-02-06", name: "설날 연휴", kind: "statutory" },
  { date: "2027-02-07", name: "설날", kind: "statutory" },
  { date: "2027-02-08", name: "설날 연휴", kind: "statutory" },
  { date: "2027-02-09", name: "설날", kind: "substitute" },
  { date: "2027-03-01", name: "3·1절", kind: "statutory" },
  { date: "2027-05-01", name: "노동절", kind: "statutory" },
  { date: "2027-05-03", name: "노동절", kind: "substitute" },
  { date: "2027-05-05", name: "어린이날", kind: "statutory" },
  { date: "2027-05-13", name: "부처님오신날", kind: "statutory" },
  { date: "2027-06-06", name: "현충일", kind: "statutory" },
  { date: "2027-07-17", name: "제헌절", kind: "statutory" },
  { date: "2027-07-19", name: "제헌절", kind: "substitute" },
  { date: "2027-08-15", name: "광복절", kind: "statutory" },
  { date: "2027-08-16", name: "광복절", kind: "substitute" },
  { date: "2027-09-14", name: "추석 연휴", kind: "statutory" },
  { date: "2027-09-15", name: "추석", kind: "statutory" },
  { date: "2027-09-16", name: "추석 연휴", kind: "statutory" },
  { date: "2027-10-03", name: "개천절", kind: "statutory" },
  { date: "2027-10-04", name: "개천절", kind: "substitute" },
  { date: "2027-10-09", name: "한글날", kind: "statutory" },
  { date: "2027-10-11", name: "한글날", kind: "substitute" },
  { date: "2027-12-25", name: "기독탄신일", kind: "statutory" },
  { date: "2027-12-27", name: "기독탄신일", kind: "substitute" },
];
