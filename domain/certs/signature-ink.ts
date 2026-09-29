// 04.3-06 Task 1 ② — 잉크 측정 하나(checker-B W5). import 없는 순수 모듈 —
// 서명 칸(클라이언트)과 서버의 PNG 검사가 같은 함수 · 같은 상수로 「서명 있음」을
// 판정한다.

// 겹치지 않은 논리 24 선 × 내보내기 배율 2 × 굵기 6.
export const SIGNATURE_MIN_INK_PIXELS = 288;

// RGBA 바이트에서 알파가 0이 아닌 픽셀 수.
export function countInkPixels(rgba: Uint8Array | Uint8ClampedArray): number {
  let count = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] !== 0) count++;
  }
  return count;
}
