# system/ — SYSTEM.md 실물

`SYSTEM.md`의 규칙을 눈으로 확인하기 위한 정적 HTML이다. **앱 코드가 아니다.** 컴포넌트 CSS는 `../tokens.css` 변수만 참조한다.

| 파일 | 무엇 |
|---|---|
| `preview.html` | 원장 화면 실물 — 상단 바 · 내 차례 · 편집용 표(그룹·편집 행·저장 대기 셀·오류 셀·외화 2행·합계 행의 저장 결과) · 단축키 힌트 줄 · EMPTY · 폼(막힘 = 이유 + 다음 한 수) · 토스트 · 폰 하단 탭. 폰(<700)에서 칸 접기(P1/P2/P3) 동작 |
| `print-expense.html` | 지출결의서 인쇄 템플릿(A4, 검정 하나) |
| `shots/preview-pc.png` | 1280 |
| `shots/preview-m.png` · `shots/preview-m-viewport.png` | 390 전체 / 390 첫 화면(토스트·하단 탭 포함) |
| `shots/print-expense.png` | 인쇄 템플릿 |

다시 찍기: Playwright(chromium)로 `preview.html`을 1280×900 · 390×844(isMobile)로, `print-expense.html`을 900×1200으로 fullPage 캡처.
Pretendard 웹폰트는 이 실물에 포함하지 않아 시스템 산세리프로 렌더된다. 서체 결정은 `SYSTEM.md` §2-1.
