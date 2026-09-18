# 다음 세션 — §4(통일) 진행 중

§1(브리프)·§2(발산)·§3(수렴)이 끝났다. 판단의 근거는 `BRIEF.md` → `EXPLORE.md` → `SYSTEM.md`·`DECISIONS.md` 순서로 있다. 내용이 어긋나면 `SYSTEM.md`가 맞다.

## 상태 (2026-09-18, 두 번째 세션)

- 채택: **안 A 원장**, 색 구성은 안 C의 그린 톤온톤 흡수 (사용자 결정)
- 산출물: `SYSTEM.md` · `tokens.css` · `DECISIONS.md` · `REVIEW.md` · `system/`(실물 + 스크린샷)
- 이번 세션: **시트·모달 실물 확정**(`system/sheet-modal.html`, 보드 https://claude.ai/artifact/Tqqc3345KGjAjoNmWNE55n, `DECISIONS.md` 5건, `SYSTEM.md` §7-8 보강). 브랜치 `design/sheet-modal-260918`, 드래프트 PR — 머지 전이면 `git fetch origin design/sheet-modal-260918 && git checkout design/sheet-modal-260918`
- Phase 1(배포 스켈레톤·로그인)은 다른 세션에서 진행 중(PR #5, 브랜치 `claude/gsd-progress-086on8`, 플랜 8개 중 0개 완료). GSD 명령은 그 세션에서만
- CI 없음(리포에 `.github/workflows/` 없음)

## 미확정 — 인쇄물 전부 재디자인 (사용자 2026-09-18)

- 기타소득 확인증 인쇄 템플릿 초안을 보드(https://claude.ai/artifact/G3WKCKP4pK4SYGdoHmWycX)로 보였고 사용자가 **「인쇄물이 전부 안 예쁘니까 나중에 다시 만들어」**. 지출결의서(`system/print-expense.html`) 포함 인쇄물은 확정안이 아니다(`SYSTEM.md` §6-6 머리의 주석, `DECISIONS.md` 「인쇄물 전부 재디자인 대상」). 확인증 초안은 커밋하지 않았다
- 재디자인 방법: 화면 규칙은 그대로 두고 인쇄물만 §2(발산)를 짧게 다시 돈다 — **3안 이상 실물을 보드로 먼저** 보이고 사용자가 고른다. 「검정 하나 · 세로 괘선」 골격도 다시 검토 대상
- 확인된 사실: 확인증 인쇄물은 v1에서 수령자(경품 수령자 포함)에게 보이지 않는다. 내부·세무 보관용. PDF 링크(CERT-05)는 v2

## 남은 §4 실물 후보 (GSD 밖에서 가능)

- 인쇄물 재디자인(위)
- Pretendard Variable 파일 준비(U3 승인, `/public/fonts/`, SIL OFL) — 실제 파일은 Phase 2 앱 코드에서
- 그 밖의 §6 템플릿 실물: 폼 화면(6-3) 전체 · 손익 원장(6-4, 목표 대비 막대) · 외부 수령자 화면(6-5)

**이 세션의 교훈**: 사용자는 실시간으로 답한다. 결정은 실물(보드)을 먼저 보여 주고 한 건씩 묻는다. 묻지 않고 넣지 않는다. 사용자가 「고칠 것이 있음」이라고만 답하면 무엇인지 되묻는다 — 첫 답이 질문(「수령자에게 보이는 건 아니지?」)일 수 있다.

## 그 다음 — §4 통일 (화면마다)

`docs/DESIGN.md` §4 절차. 새 화면은 `SYSTEM.md` §6 템플릿 중 하나에서 시작하고, 토큰은 `tokens.css` 변수만. 완료 판정은 `/design-review` → `/qa`.
Phase 2(UX-01: SYSTEM.md 확정 + 컴포넌트 계약)가 이 산출물을 소비한다. GSD 명령은 그 페이즈를 맡은 세션에서만 실행한다.

## 지킨 제약 (다음 세션도 확인)

- 변경 범위 `docs/design/`만. `.planning/`·`CLAUDE.md`·`.claude/`·앱 코드 무변경
- GSD 명령 미실행(Phase 1이 다른 세션에서 진행 중)
- 260907의 화면·정보구조·UI 흐름·틀·토큰 참고 안 함
