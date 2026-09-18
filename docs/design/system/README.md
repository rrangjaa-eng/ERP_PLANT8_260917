# system/ — SYSTEM.md 실물

`SYSTEM.md`의 규칙을 눈으로 확인하기 위한 정적 HTML이다. **앱 코드가 아니다.** 컴포넌트 CSS는 `../tokens.css` 변수만 참조한다.

| 파일 | 무엇 |
|---|---|
| `preview.html` | 원장 화면 실물 — 상단 바 · 내 차례 · 편집용 표(그룹·편집 행·저장 대기 셀·오류 셀·외화 2행·합계 행의 저장 결과) · 단축키 힌트 줄 · EMPTY · 폼(막힘 = 이유 + 다음 한 수) · 토스트 · 폰 하단 탭. 폰(<700)에서 칸 접기(P1/P2/P3) 동작 |
| `shoot.mjs` | 위 실물들의 스크린샷 스크립트(장면 목록 포함). 앱 코드가 아니다 |
| `sheet-modal.html` | 시트·모달 실물(§7-8). 해시로 장면 선택: `#approve` 폰 결재 시트 · `#reject-m` 폰 반려 확인 시트 · `#more` 폰 더보기 시트 · `#reject-pc` PC 반려 모달(480). 실제로 열리고 닫힌다(탭·Esc·첫 행동 요소 포커스) |
| `form-expense.html` | 폼 화면 실물(§6-3, 지출결의 한 건). 확정 2026-09-18. 해시로 장면 선택: `#blocked` 막힘 · `#error` 서버 오류 · `#done` 제출됨 · `#pick` 「바꾸기」 목록(PC 모달 · 폰 시트) · `#self` 자기 승인 건너뜀 |
| `dashboard-ceo.html` | 손익 대시보드 전사(대표·경영관리 첫 화면, §6-4). 확정 2026-09-18. KPI 타일 4 · 목표 달성(팀별 수익·수익률) · 월별 차트 + 비중 띠 · 비용 구성 도넛 · 클라이언트별 매출 순위 · 프로젝트 현황. 해시 `#mgmt` = 경영관리(이름만) |
| `dashboard-team.html` | 손익 대시보드 팀 버전(팀장 첫 화면). 같은 부품, 자기 팀만. 프로젝트별 목표 대비 · 프로젝트별 매출 순위 · 내 차례 |
| `dashboard-pnl.html` | **탈락 · 기록용** — 손익 「원장」 초안(표). 사용자가 「표만으로는 한눈에 안 들어온다」로 버림(`DECISIONS.md` 손익 화면 = 대시보드). 고치지 않는다 |
| `external-cert.html` | 외부 수령자 화면 실물(§6-5, 기타소득 = 경품 수령 확인, 폰 전용). 확정 2026-09-18. 해시: `#empty` 빈 폼 · `#sign` 서명만 남음 · `#error` 주민등록번호 오류 · `#done` 제출됨 · `#expired` 만료 · `#post` 택배(주소 칸) |
| `print-expense.html` | 지출결의서 인쇄 템플릿(A4). 확정 2026-09-18 — 안 P2 「레터」 골격 + P3 명세 표, 구조 선 그린(`--print-rule`) |
| `print-cert.html` | 기타소득 지급 확인증 인쇄 템플릿(A4). 같은 골격(P2) |
| `print/p1-form.html` · `p2-letter.html` · `p3-statement.html` · `p4-seal.html` | 인쇄 재디자인 발산 기록(각 두 장). **P2 채택**(→ 위 두 파일로 승격), P1·P3·P4 탈락. 참고용, 고치지 않는다 |
| `shots/preview-pc.png` | 1280 |
| `shots/preview-m.png` · `shots/preview-m-viewport.png` | 390 전체 / 390 첫 화면(토스트·하단 탭 포함) |
| `shots/print-expense.png` · `shots/print-cert.png` | 인쇄 템플릿 2종 |
| `shots/print-p1-form.png` … `print-p4-seal.png` | 발산 안 4개 |
| `shots/sheet-approve-m.png` · `shots/sheet-reject-m.png` · `shots/sheet-more-m.png` | 390×844 뷰포트, 시트 3장면 |
| `shots/modal-reject-pc.png` | 1280×800 뷰포트, PC 반려 모달 |
| `shots/form-blocked-pc.png` · `form-error-pc.png` · `form-done-pc.png` | 1280 전체, 폼 3장면 |
| `shots/form-blocked-m.png` · `form-pick-m.png` | 390×844 뷰포트, 폰 폼 · 「바꾸기」 시트 |
| `shots/form-pick-pc.png` · `form-self.png` | 「바꾸기」 PC 모달 · 결재선 자기 승인 건너뜀(요소 캡처) |
| `shots/ceo-dash-pc.png` · `ceo-dash-m.png` · `ceo-dash-m-viewport.png` | 전사 대시보드 1280 · 390 전체 · 390 첫 화면 |
| `shots/team-dash-pc.png` · `team-dash-m.png` | 팀 대시보드 1280 · 390 전체 |
| `shots/pnl-*.png` | 탈락한 원장 초안(기록) |
| `shots/cert-empty-m.png` · `cert-sign-m.png` · `cert-error-m.png` · `cert-post-m.png` | 390 전체, 외부 수령자 4장면 |
| `shots/cert-done-m.png` · `cert-expired-m.png` | 390×844 뷰포트, 제출됨 · 만료 |

다시 찍기: 리포 루트에서 `node docs/design/system/shoot.mjs [장면이름 …]` — 장면 목록(파일·해시·크기·isMobile·fullPage·(선택자))은 `shoot.mjs` 안의 `scenes` 배열. 선택자를 주면 그 요소만 캡처한다. 전체 캡처는 뷰포트를 문서 높이로 늘려 고정 요소가 문서 끝에 놓인다. Playwright는 전역 설치본(`npm root -g`)을 쓴다.
Pretendard 웹폰트는 이 실물에 포함하지 않아 시스템 산세리프로 렌더된다. 서체 결정은 `SYSTEM.md` §2-1.
