import QRCode from "qrcode";

// 04.3-04 Task 1 ② — 링크 → 인라인 SVG. 오류 정정 M · 조용한 영역 4모듈.
// 어두운 모듈은 currentColor, 밝은 바탕은 그리지 않는다(투명) — 색은 CSS
// 토큰(color: var(--fg) · background: var(--bg))이 준다. 입력은 서버가
// 만든 링크뿐이다(사용자 입력이 SVG 문자열에 섞이지 않는다, T-04.3-31).
export async function renderQrSvg(link: string): Promise<string> {
  const svg = await QRCode.toString(link, { type: "svg", errorCorrectionLevel: "M", margin: 4 });
  return svg
    .trim()
    .replace(/<path fill="#[0-9a-fA-F]{3,8}"[^>]*\/>/, "")
    .replace(/stroke="#[0-9a-fA-F]{3,8}"/g, 'stroke="currentColor"');
}
