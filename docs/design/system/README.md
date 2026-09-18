# system/ — SYSTEM.md 실물

`SYSTEM.md`의 규칙을 눈으로 확인하기 위한 정적 HTML이다. **앱 코드가 아니다.** 컴포넌트 CSS는 `../tokens.css` 변수만 참조한다.

| 파일 | 무엇 |
|---|---|
| `preview.html` | 원장 화면 실물 — 상단 바 · 내 차례 · 편집용 표(그룹·편집 행·저장 대기 셀·오류 셀·외화 2행·합계 행의 저장 결과) · 단축키 힌트 줄 · EMPTY · 폼(막힘 = 이유 + 다음 한 수) · 토스트 · 폰 하단 탭. 폰(<700)에서 칸 접기(P1/P2/P3) 동작 |
| `shoot.mjs` | 위 실물들의 스크린샷 스크립트(장면 목록 포함). 앱 코드가 아니다 |
| `sheet-modal.html` | 시트·모달 실물(§7-8). 해시로 장면 선택: `#approve` 폰 결재 시트 · `#reject-m` 폰 반려 확인 시트 · `#more` 폰 더보기 시트 · `#reject-pc` PC 반려 모달(480). 실제로 열리고 닫힌다(탭·Esc·첫 행동 요소 포커스) |
| `print-expense.html` | 지출결의서 인쇄 템플릿(A4, 검정 하나) — **재디자인 대상**(`DECISIONS.md` 2026-09-18), 확정안 아님 |
| `shots/preview-pc.png` | 1280 |
| `shots/preview-m.png` · `shots/preview-m-viewport.png` | 390 전체 / 390 첫 화면(토스트·하단 탭 포함) |
| `shots/print-expense.png` | 인쇄 템플릿 |
| `shots/sheet-approve-m.png` · `shots/sheet-reject-m.png` · `shots/sheet-more-m.png` | 390×844 뷰포트, 시트 3장면 |
| `shots/modal-reject-pc.png` | 1280×800 뷰포트, PC 반려 모달 |

다시 찍기: 리포 루트에서 `node docs/design/system/shoot.mjs [장면이름 …]` — 장면 목록(파일·해시·크기·isMobile·fullPage)은 `shoot.mjs` 안의 `scenes` 배열. Playwright는 전역 설치본(`npm root -g`)을 쓴다.
Pretendard 웹폰트는 이 실물에 포함하지 않아 시스템 산세리프로 렌더된다. 서체 결정은 `SYSTEM.md` §2-1.
