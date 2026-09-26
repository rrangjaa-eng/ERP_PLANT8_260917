// 04.3-02 Task 2 ⑥ — 순수 함수: 이름 정규화·가림, 전화번호 정규화·표시(당첨자
// 전용 · 문의 전화 전용 두 계약으로 나뉜다), 주민등록번호 가림. DB·설정을
// 읽지 않는다 — 단위 테스트가 그대로 고정한다.

// NFC 정규화 + 앞뒤 공백 제거 — 자모 분리(NFD)로 들어온 이름도 이 함수를
// 거치면 같은 문자열이 된다.
export function normalizeName(name: string): string {
  return name.normalize("NFC").trim();
}

// UI-SPEC 「이름 가림 규칙」 — 공백을 뺀 글자 수 n으로 판정하되 공백은 원래
// 자리에 그대로 남긴다. n===1 → 전체 마스킹, n===2 → 마지막 글자만, n>=3 →
// 처음·마지막을 남기고 가운데를 전부 마스킹.
export function maskName(name: string): string {
  const chars = Array.from(name.normalize("NFC"));
  const nonSpaceIndices = chars.reduce<number[]>((acc, ch, i) => {
    if (ch !== " ") acc.push(i);
    return acc;
  }, []);
  const n = nonSpaceIndices.length;
  if (n === 0) return name;

  const result = [...chars];
  if (n === 1) {
    result[nonSpaceIndices[0]!] = "*";
  } else if (n === 2) {
    result[nonSpaceIndices[1]!] = "*";
  } else {
    for (let k = 1; k < n - 1; k++) {
      result[nonSpaceIndices[k]!] = "*";
    }
  }
  return result.join("");
}

// 당첨자 전화 전용 — 뒤 4자리 확인의 대상이라 휴대전화 형식만 받는다.
// 지역번호·대표번호(예: 02-123-4567)는 여기서 거부된다(normalizeContactPhone과
// 계약이 다르다).
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return /^01[016789]\d{7,8}$/.test(digits) ? digits : null;
}

export function formatPhone(digits: string): string {
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}

// 수령자 문의 전화 전용 — 지역번호·070·휴대전화·대표번호(1XXX-XXXX)를
// 받는다. 당첨자 전화(normalizePhone)보다 넓은 계약이라 같은 함수를 쓰지
// 않는다(같은 02-123-4567이 문의 전화로는 저장되고 당첨자 전화로는
// 거부된다).
export function normalizeContactPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (/^01[016789]\d{7,8}$/.test(digits)) return digits; // 휴대전화
  if (/^02\d{7,8}$/.test(digits)) return digits; // 서울
  if (/^0(3[1-3]|4[1-4]|5[1-5]|6[1-4])\d{6,7}$/.test(digits)) return digits; // 그 외 지역번호
  if (/^070\d{8}$/.test(digits)) return digits; // 인터넷 전화
  if (/^1[5-9]\d{6}$/.test(digits)) return digits; // 대표번호(1XXX-XXXX)
  return null;
}

export function formatContactPhone(digits: string): string {
  if (/^01[016789]/.test(digits)) return formatPhone(digits);
  if (digits.startsWith("02")) {
    const rest = digits.slice(2);
    return rest.length === 8
      ? `02-${rest.slice(0, 4)}-${rest.slice(4)}`
      : `02-${rest.slice(0, 3)}-${rest.slice(3)}`;
  }
  if (digits.startsWith("070")) {
    return `070-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (/^1[5-9]/.test(digits)) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  // 그 외 지역번호(3자리) — 나머지는 7자리(3+4 분할)만 다룬다(테스트 계약).
  const rest = digits.slice(3);
  return `${digits.slice(0, 3)}-${rest.slice(0, 3)}-${rest.slice(3)}`;
}

// 앞 6 + 하이픈 + 성별 코드 + 별 6개. 뒤 6자리(성별 코드 제외)는 어디에도
// 남기지 않는다.
export function maskRrn(rrn13: string): string {
  return `${rrn13.slice(0, 6)}-${rrn13.slice(6, 7)}******`;
}

// U13 — 제출 일시 표시는 브라우저 로케일(toLocaleString)에 기대지 않고
// KST 고정 YYYY-MM-DD HH:mm로 그린다(UI-SPEC E5·E6-a).
const KST_DATETIME_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatSubmittedAtKst(iso: string): string {
  const parts = KST_DATETIME_FORMAT.formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}
