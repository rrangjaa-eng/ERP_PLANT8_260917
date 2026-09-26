import { kstToday } from "@/lib/kst-date";

// 04.3-02 Task 3 ② — 성별 코드 → 세기(1·2 = 1900 · 3·4 = 2000 · 5·6 =
// 1900(외국인) · 7·8 = 2000(외국인) · 9·0 = 1800(거부 — 1800년대 출생
// 수령자는 없다)) · 실제 날짜 · 오늘(KST) 이후 거부 — 이 셋과 형식만
// {ok: false}를 낸다. 검증번호(가중치 2,3,4,5,6,7,8,9,2,3,4,5, 검증 =
// (11 − 합 % 11) % 10)는 판정만 하고 거부하지 않는다: CONTEXT 31행 규칙은
// 「2020-10 이전 발급분」인데 발급 시점은 번호에 없고, 그 전에 태어났어도
// 2020-10 뒤에 번호를 새로 받은 사람은 검증번호가 맞지 않는다 — 생년월일을
// 발급 시점 대신 쓰면 그 사람을 잘못 막는다. 성별 1~4이고 생년월일이
// 2020-10-01 이전이면 match/mismatch, 그날 이후 출생(새 체계 발급이
// 확실하다)과 외국인(5~8)은 notApplicable.
export type RrnValidationResult =
  | { ok: true; birthDate: string; checkDigit: "match" | "mismatch" | "notApplicable" }
  | { ok: false };

const CHECK_DIGIT_WEIGHTS = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5] as const;
const NEW_SYSTEM_CUTOFF = "2020-10-01"; // CONTEXT 31행

function centuryFor(genderDigit: string): number | null {
  if (genderDigit === "1" || genderDigit === "2" || genderDigit === "5" || genderDigit === "6") return 1900;
  if (genderDigit === "3" || genderDigit === "4" || genderDigit === "7" || genderDigit === "8") return 2000;
  return null; // 9·0(1800년대) 또는 그 외 자리 — 거부
}

function isForeigner(genderDigit: string): boolean {
  return genderDigit === "5" || genderDigit === "6" || genderDigit === "7" || genderDigit === "8";
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function validateRrn(front6: string, back7: string, now: Date = new Date()): RrnValidationResult {
  if (!/^\d{6}$/.test(front6) || !/^\d{7}$/.test(back7)) return { ok: false };

  const genderDigit = back7[0]!;
  const century = centuryFor(genderDigit);
  if (century === null) return { ok: false };

  const yy = Number(front6.slice(0, 2));
  const mm = Number(front6.slice(2, 4));
  const dd = Number(front6.slice(4, 6));
  const year = century + yy;

  if (!isValidCalendarDate(year, mm, dd)) return { ok: false };

  const birthDate = `${String(year).padStart(4, "0")}-${front6.slice(2, 4)}-${front6.slice(4, 6)}`;
  if (birthDate > kstToday(now)) return { ok: false };

  if (isForeigner(genderDigit) || birthDate >= NEW_SYSTEM_CUTOFF) {
    return { ok: true, birthDate, checkDigit: "notApplicable" };
  }

  const digits = `${front6}${back7.slice(0, 6)}`.split("").map(Number);
  const sum = digits.reduce((acc, digit, i) => acc + digit * CHECK_DIGIT_WEIGHTS[i]!, 0);
  const expected = (11 - (sum % 11)) % 10;
  const actual = Number(back7[6]);
  return { ok: true, birthDate, checkDigit: expected === actual ? "match" : "mismatch" };
}
