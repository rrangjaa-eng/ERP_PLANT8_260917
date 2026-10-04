# /qa — 수익률 기준선 색 (PR #163)

- 대상: `/projects`(수익률 기준선 미만 위험 색) · `/admin/settings`(「수익률 기준선(%)」 칸), diff-aware.
- 브라우저: Aside 없음 · gstack 브라우저는 로그인 세션 없음 → 같은 코드의 `CI=true` 프로덕션 빌드를 Playwright(Chromium)로 검사(프로젝트 기존 방식).
- 실행: `CI=true pnpm test:e2e projects-list · projects-list-number-nowrap · projects-filter-reset · settings · mobile-320-no-overflow · mobile-projects-error` → **960 passed · 27 skipped · 0 failed (23.2m)**. 로그: `/mnt/project-files/notes/quick-261004-51o/qa-e2e.log`. 서버 로그의 「destination stream closed early」는 페이지 이동 중 끊긴 스트림(실패 0).
- 흐름 점검(독립 DOM 감사 `/mnt/project-files/notes/quick-261004-51o/dom-audit.md`): 설정 14.5 → 「저장 실패 · 형식 오류 · 값 확인」 · 101 → 「100 이하만 가능」 · 저장값 유지, 20 저장 → 목록 판정 따라옴, 15 복구.
- 발견 이슈: 0. 수정 커밋: 없음.
- 요약: QA found 0 issues, fixed 0.
