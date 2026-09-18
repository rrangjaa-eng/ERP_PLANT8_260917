# 다음 세션 — §3(수렴) 끝, §4(통일)로

§1(브리프)·§2(발산)·§3(수렴)이 끝났다. 판단의 근거는 `BRIEF.md` → `EXPLORE.md` → `SYSTEM.md`·`DECISIONS.md` 순서로 있다. 내용이 어긋나면 `SYSTEM.md`가 맞다.

## 상태 (2026-09-18)

- 채택: **안 A 원장**, 색 구성은 안 C의 그린 톤온톤 흡수 (사용자 결정)
- 산출물: `SYSTEM.md` · `tokens.css` · `DECISIONS.md` · `REVIEW.md`(디자인 리뷰 7패스, 7→9점) · `system/`(실물 + 스크린샷)
- 브랜치 `design/system-260918`, 드래프트 PR **#7** — 머지 전이면 `git fetch origin design/system-260918 && git checkout design/system-260918`
- CI 없음(리포에 `.github/workflows/` 없음)

## 먼저 — 사용자 결정 4건 (`DECISIONS.md` 「미확정」)

U1 로고 워드마크 반전 사용 · U2 인쇄물 결재 칸(텍스트/서명 이미지) · U3 Pretendard 웹폰트 파일 추가 승인(의존성) · U4 손익 인라인 막대 v1 포함 여부.
답이 나오면 `DECISIONS.md`에 결정 줄을 더하고 `SYSTEM.md`의 해당 절을 고친다. U1·U3은 첫 화면 구현 전에 필요하다.

## 그 다음 — §4 통일 (화면마다)

`docs/DESIGN.md` §4 절차. 새 화면은 `SYSTEM.md` §6 템플릿 중 하나에서 시작하고, 토큰은 `tokens.css` 변수만. 완료 판정은 `/design-review` → `/qa`.
Phase 2(UX-01: SYSTEM.md 확정 + 컴포넌트 계약)가 이 산출물을 소비한다. GSD 명령은 그 페이즈를 맡은 세션에서만 실행한다.

## 지킨 제약 (다음 세션도 확인)

- 변경 범위 `docs/design/`만. `.planning/`·`CLAUDE.md`·`.claude/`·앱 코드 무변경
- GSD 명령 미실행(Phase 1이 다른 세션에서 진행 중)
- 260907의 화면·정보구조·UI 흐름·틀·토큰 참고 안 함
