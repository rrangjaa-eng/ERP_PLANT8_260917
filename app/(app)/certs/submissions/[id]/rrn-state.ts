// 04.3-07 — I4 주민등록번호 칸 상태(순수 함수 · 단위 테스트 대상).
// 원래 번호는 평문으로 두지 않는다 — 숫자 13자리의 지문(originalKey)만 둬, 고친 채 가렸다가 다시 열어
// 원래 번호로 되돌려도 「바뀐 칸」이 아님을 안다(검토 R-L1). 평문은 입력 칸 값(input)뿐이다.

export type RrnState = { originalKey: string | null; input: string | null; open: boolean };

export const RRN_CLOSED: RrnState = { originalKey: null, input: null, open: false };

// cyrb53(53비트) — 같은 번호인지만 본다. 암호 목적이 아니다(숫자만 비교 — 하이픈 유무는 같은 번호).
function rrnKey(value: string): string {
  const digits = value.replace(/\D/g, "");
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < digits.length; i += 1) {
    const code = digits.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function revealedRrn(rrn: string): RrnState {
  return { originalKey: rrnKey(rrn), input: rrn, open: true };
}

export function isRrnDirty(state: RrnState): boolean {
  return state.input !== null && rrnKey(state.input) !== state.originalKey;
}

// 「가리기」 — 고친 값이 없으면 평문을 버리고, 있으면 칸만 내린다.
export function hideRrn(state: RrnState): RrnState {
  if (!isRrnDirty(state)) return RRN_CLOSED;
  return { ...state, open: false };
}

// 저장 성공 뒤 — 보낸 번호(sent, 보내지 않았으면 null) 기준(DOM 감사 H1). 보낸 번호가 지금 칸과 같으면
// 닫고, 대기 중에 또 고쳤으면 남기되 서버에 들어간 번호를 새 원래 번호로 삼는다.
export function afterRrnSave(current: RrnState, sent: string | null): RrnState {
  if (sent === null) return isRrnDirty(current) ? current : RRN_CLOSED;
  if (current.input === null || rrnKey(current.input) === rrnKey(sent)) return RRN_CLOSED;
  return { ...current, originalKey: rrnKey(sent) };
}
