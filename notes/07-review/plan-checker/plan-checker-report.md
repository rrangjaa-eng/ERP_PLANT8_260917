# Phase 07 (schedule-notify-audit) 플랜 체커 보고서

검토일 2026-10-20 · 대상 07-01..07-25 (8 웨이브) · 검토만 함(플랜 수정 없음)

## 요약
- 판정: **ISSUES FOUND** (BLOCKER 0 · WARNING 6 · INFO 4)
- 요구사항 EXP-11 · EXP-12 · NOTI-03: 모두 frontmatter `requirements`에 있음(EXP-12는 07-01·06·08·10·12·16).
- D-701..D-725 25개 결정: 모두 1개 이상 플랜에서 참조. 07-SCOPE-ITEMS 84개 ID: 모두 어느 플랜에 등장.
- 의존 그래프: 순환·없는 플랜 참조 없음, wave = max(dep)+1 맞음. 같은 웨이브 안 files_modified 겹침 0.
- 06.1-15/16 외부 의존(E1): 07-12:20 · 07-16:29 · 07-23:50 `external_depends_on`과 precondition 명령 있음. 07-01:271은 겹치는 파일 없음을 명시. evidence-table.tsx 무변경 검사가 07-12:151 · 07-14:249 · 07-16:214 · 07-23:289에 있음.
- 마이그레이션 플랜(02·07·11·13)은 `pnpm db:generate`로 번호를 정한다고 적음(07-02:18,37).
- verify 경로 탐침 · failing-direction 탐침: 전부 문제 없음(호출 측 제공 결과).

## 발견

### PC-01 WARNING — scope_sanity
- 근거: files_modified 수 07-23-PLAN.md:7 (35개), 07-21-PLAN.md:7 · 07-22-PLAN.md:7 (각 27개), 07-10 · 07-11 · 07-17 · 07-24 (19개), 07-19 (20개). 거의 모든 플랜이 태스크 4개.
- 문제: 기준표(15개 이상 = blocker)를 크게 넘긴다. 다만 CLAUDE.md §4가 `granularity: coarse`(플랜 하나 = 세션·게이트·CI 한 바퀴)를 정하므로 WARNING으로 둔다. 07-23(돈 · 35파일)은 Opus 실행자라도 문맥 품질 위험이 크다.
- 제안: 07-23 · 07-21 · 07-22를 서버/화면 두 플랜으로 나누거나, 나누지 않는 이유를 플랜에 한 줄 남긴다.

### PC-02 WARNING — claude_md_compliance (위험 경로 PR 분리)
- 근거: 07-04-PLAN.md:100 「PR 하나 · 사용자 머지」 — domain/permissions/matrix.ts · roles.ts와 함께 domain/action-log/* · domain/settings/* · domain/approvals/route-step-settings.ts · domain/people/index.ts가 같은 PR. 07-11(db/schema·migrations + domain/evidence/private-files.ts · repositories/files.ts)도 같음. 07-04:101은 06·09·19·20·23이 이 PR 머지를 기다린다고 적음.
- 문제: CLAUDE.md §4 머지 「위험 경로 변경은 별도 PR로 떼어 나머지가 무인으로 흐르게」. 사용자 머지가 늦으면 07-04 하나가 웨이브 2 이후 다섯 플랜을 묶는다.
- 제안: 07-04를 권한 표 PR(사용자 머지)과 행동 로그·설정 PR(세션 머지)로 나누거나, 같은 PR이어야 하는 이유(타입 의존 등)를 적는다.

### PC-03 WARNING — claude_md_compliance (risk 태그)
- 근거: 07-17-PLAN.md:28 근처 frontmatter에 `risk:` 없음. files_modified(07-17:7~)에 repositories/login-attempts.ts · repositories/users.ts · 사람 잠금/해제 액션(app/(app)/admin/people/[id]/actions.ts)이 있음 — 07-09(risk: auth)와 같은 잠금 저장소.
- 문제: 권한·잠금을 건드리는데 Opus 실행자 + 독립 검토 대상에서 빠진다(CLAUDE.md §4 Build · §8).
- 제안: risk: permissions 태그를 달거나 잠금 판정은 07-09 함수 호출만이라는 근거를 적는다.

### PC-04 WARNING — claude_md_compliance (마이그레이션 가드 시험)
- 근거: `grep migration-journal 07-*-PLAN.md` 0건. 07-02:168 · 07-07 · 07-11 · 07-13은 `db:generate` 무변경 확인만 함.
- 문제: 지시된 가드 test/unit/db/migration-journal.test.ts가 어느 마이그레이션 플랜 verify에도 없다. 07-02(웨이브1)·07-07(2)·07-11(3)·07-13(4)이 저널을 차례로 바꾸므로 번호·저널 어긋남을 잡는 장치가 필요.
- 제안: 네 플랜 verify에 `pnpm vitest run test/unit/db/migration-journal.test.ts` 추가.

### PC-05 WARNING — claude_md_compliance (Codex 디자인 검토 · 4폭)
- 근거: 화면 플랜(07-08 · 12 · 16~25)에 `codex-design-review` 0건, 1280 언급은 1~3건뿐(4폭 375·320·768·1280 + main 대비 캡처 명시 확인 안 됨).
- 문제: CLAUDE.md §6은 /design-review에서 scripts/codex-design-review.sh를 부르도록 한다. 게이트 단계 일이라 플랜에 꼭 있어야 하진 않지만, 묶음 PR 게이트 절에 빠지면 실행 세션이 건너뛸 수 있다.
- 제안: 각 화면 PR 게이트 줄에 `/design-review`(codex-design-review.sh · 4폭) → `/qa`를 명시.

### PC-06 WARNING — decision coverage gate 파싱 (알려진 문제)
- 근거: 07-CONTEXT.md:52 `- **D-714 (사용자 카드 …):**` 형태. grep으로는 25/25 결정이 플랜에서 참조되지만 decision-coverage-plan 게이트가 이 줄을 파싱하지 못해 실패.
- 문제: 게이트가 실패로 남으면 실행 전 자동 판정이 막히거나 무시하는 습관이 생긴다.
- 제안: 재계획 세션에서 CONTEXT 줄 형식을 `**D-714:** (사용자 카드 …)`로 맞추거나 게이트 파서 수정을 별도 quick로.

### PC-07 INFO — 260907 대조 인용
- 근거: 07-07 · 07-12 · 07-25에 `ERP_PLANT8_260907` 인용 0건. 07-12는 디자인 문서라 무관, 07-25는 최종 검수. 07-07(알림 규칙 스키마)은 07-19:95가 옛 `server/src/notices.ts`를 인용하는 같은 기능 축.
- 제안: 07-07에 「260907 대조: 07-19 참고」 한 줄. 07.1 배정 항목의 07 누수는 SCOPE ID 대조에서 발견 못 함(네트워크 메모 전문 대조는 미실시 — 참고).

### PC-08 INFO — 07-15 AQ-23
- 근거: 07-15-PLAN.md:113 — 07-19 머지 전 스테이징에 `알림 규칙` 링크가 404.
- 제안: 아침 브리핑에서 시드 줄을 07-19로 옮길지 결정.

### PC-09 INFO — 같은 파일을 여러 웨이브가 고침
- 근거: docs/design/SYSTEM.md · DECISIONS.md(07-12 웨이브4, 07-19 웨이브6), domain/permissions/matrix.ts · roles.ts(07-04 웨이브1, 07-15 웨이브5), repositories/login-attempts.ts(07-09, 07-17).
- 문제 아님(웨이브 순서로 정렬됨). 앞 PR 머지 전 뒤 웨이브 시작 금지만 지키면 됨.

### PC-10 INFO — 07-05 autonomous: false
- 근거: 07-05 frontmatter. 사용자 확인 체크포인트가 있으므로 무인 진행 중 멈춤 지점. 아침 브리핑 질문 카드로 올릴 것.
