// 출처: Node ICU 단기력(ko-KR-u-ca-dangi, Asia/Seoul)으로 계산한 양력 날짜 — 공식 월력요항 대조는 04.2-02 Task 2 체크포인트.
// 갱신: 해를 더하면 LUNAR_TABLE_LAST_YEAR도 올리고, ICU 대조 단위 테스트가 새 해의 세 날짜를 검사한다.
export type LunarHolidayDates = { seollal: string; buddhasBirthday: string; chuseok: string };

export const LUNAR_TABLE_FIRST_YEAR = 2025;
export const LUNAR_TABLE_LAST_YEAR = 2035;

export const LUNAR_HOLIDAY_TABLE: Readonly<Record<number, LunarHolidayDates>> = {
  2025: { seollal: "2025-01-29", buddhasBirthday: "2025-05-05", chuseok: "2025-10-06" },
  2026: { seollal: "2026-02-17", buddhasBirthday: "2026-05-24", chuseok: "2026-09-25" },
  2027: { seollal: "2027-02-07", buddhasBirthday: "2027-05-13", chuseok: "2027-09-15" },
  2028: { seollal: "2028-01-27", buddhasBirthday: "2028-05-02", chuseok: "2028-10-03" },
  2029: { seollal: "2029-02-13", buddhasBirthday: "2029-05-20", chuseok: "2029-09-22" },
  2030: { seollal: "2030-02-03", buddhasBirthday: "2030-05-09", chuseok: "2030-09-12" },
  2031: { seollal: "2031-01-23", buddhasBirthday: "2031-05-28", chuseok: "2031-10-01" },
  2032: { seollal: "2032-02-11", buddhasBirthday: "2032-05-16", chuseok: "2032-09-19" },
  2033: { seollal: "2033-01-31", buddhasBirthday: "2033-05-06", chuseok: "2033-09-08" },
  2034: { seollal: "2034-02-19", buddhasBirthday: "2034-05-25", chuseok: "2034-09-27" },
  2035: { seollal: "2035-02-08", buddhasBirthday: "2035-05-15", chuseok: "2035-09-16" },
};
