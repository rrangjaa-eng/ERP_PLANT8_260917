---
phase: quick-261001-x6q
plan: 01
subsystem: certs
tags: [cert-purge, collection-notice, legal-review, 04.3]
status: complete
requirements: [QUICK-261001-x6q, CERT-01, CERT-02]
key-files:
  modified:
    - domain/certs/purge.ts
    - domain/certs/consent.ts
    - test/unit/certs/purge-deadline.test.ts
    - test/integration/purge-expired-certs.test.ts
    - test/unit/certs/consent-notice.test.ts
    - docs/CERT-PURGE.md
    - docs/design/DECISIONS.md
    - docs/design/SYSTEM.md
    - docs/design/system/external-cert.html
  created:
    - docs/design/checks/2026-10-01-수집-안내-v4.md
actuals:
  tasks: 3
  commits: 3
plan_head_before: 1640bb53faa533279ae3824ff711f7edd4cabc0f
commits: 3
---

# Quick 261001-x6q: 04.3 법령 대조 반영 — 파기 4월 1일 · 수집 안내 v4 Summary

확인증 파기 기산을 (제출 KST 연도 + 1 + 보존 연수)-04-01 00:00 KST로(CS-2 a 포함) 옮기고, 수집 안내 판을 v4(외국인등록번호 근거 · 받는 근거 끝 문장 · 「제공」 조건 문장 하나)로 올렸다.

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | 0e777e1 | fix: cert purge deadline moves to April 1 after corporate tax filing |
| 2 | a532e04 | docs: record collection notice v4 and April-1 cert purge |
| 3 | 5da5430 | feat: cert collection notice v4 |

## RED / GREEN 증거

**Task 1 (tracer, TDD)**
- RED: 테스트 기대값만 4월 1일로 바꾼 뒤 `pnpm vitest run --project unit test/unit/certs/purge-deadline.test.ts` → 6 failed (6). 예: `AssertionError: expected 1835449200000 to be 1838127600000`(7년 케이스, 3월 1일 vs 4월 1일).
- GREEN: `certPurgeDeadline`의 `-03-01` → `-04-01`, 주석 두 곳(법인세법 제116조① · 국세기본법 제85조의3②), CERT-PURGE.md 세 줄. 단위 purge-deadline + docs-limits 2 files / 71 tests passed. `pnpm db:reset:test` 뒤 통합 `purge-expired-certs` 1 file / 23 tests passed(「기한 1ms 전 0건 · 정각 비움」 보존 · CS-2 a 두 곳이 새 날짜로 통과).
- verify grep: purge.ts · 두 테스트에 `-03-01` 0건, CERT-PURGE.md · purge.ts · 통합 테스트에 `3월 1일` 0건, CERT-PURGE.md `4월 1일` 3줄, purge.ts `법인세법 제116조①` 2곳.

**Task 2 (docs, design-gate 호출 뒤)**
- 점검표 `docs/design/checks/2026-10-01-수집-안내-v4.md` 빈칸 없음(`- [ ]` 0건). DECISIONS 끝에 5942919192 항목, SYSTEM.md 510행 「판 v4」 · 「2026-10-01 법령 대조 검토 반영」(줄 끝 금지어 규칙 문장 그대로), 실물 external-cert.html 주석 · 받는 근거 · 제공 dd를 v4 문장으로.
- `design-system-docs` + `system-md-compliance` + `docs-limits` 3 files / 179 tests passed. 계획의 grep 단언 전부 통과.

**Task 3 (TDD)**
- RED: 테스트를 v4 기대 전문으로 바꾼 뒤 `consent-notice.test.ts` → 3 failed | 5 passed. 실패: `판은 v4다`(`expected 'v3' to be 'v4'`), 현장 · 택배 변형 전문 `toEqual`. 금지어 0건 · 조문 열둘 케이스는 RED에서도 통과(수정 없음, 예외 없음).
- GREEN: `CERT_CONSENT_VERSION = "v4"`, 받는 근거 · 제공 두 본문을 정본 문장 그대로, 머리 주석 정리(`법무 확인 전 초안` 제거, v4 이력 한 줄). `consent-notice` 1 file / 8 tests passed, 통합 `cert-intake` 1 file / 23 tests passed, `pnpm lint` exit 0, `pnpm typecheck` exit 0.

## 최종 검증

- 바뀐 영역 단위 전체: `pnpm vitest run --project unit test/unit/certs test/unit/docs-limits.test.ts test/unit/design-system-docs.test.ts test/unit/ui/system-md-compliance.test.ts` → 25 files / 487 tests passed.
- `git diff --name-only 1640bb5 HEAD` = 계획 frontmatter files_modified 열 개(점검표 포함 — 계획 Task 2가 만든다)뿐. OPERATIONS.md · app/ · ui/ · repositories/ · db/ 변경 없음.
- 커밋 수: `git rev-list --count 1640bb5..HEAD` = 3.

## E2E 생략 사유

`grep -rn -E '관할 세무서|받는 근거|동의를 받지' test/e2e` 0건 — 바뀐 문장을 단언하는 E2E가 없다. 수령자 E2E는 dt/dd 개수와 1절만 단언하고 판은 `CERT_CONSENT_VERSION` 상수나 응답 `terms.consentVersion`을 쓴다. 그래서 E2E는 돌리지 않았다. 전체 통합 · E2E · build는 CLAUDE.md §5 작업 단계 규칙대로 CI가 한 번 돈다.

## 「제공」 문구

「제공」은 사용자 결정 2026-10-02 채팅(「세무 신고 대상이면 관할 세무서에 제출합니다 …」)을 따른다 — 5942919192 문구 대신 적용했고, SYSTEM §6-5 수령자 금지어 규칙(원천징수 · 지급명세서 · 등록한 이름 · 당첨자로 등록)은 예외 없이 그대로다. 두 변형 요약 · 전문 8절에 금지어 0건(단위 케이스가 고정).

## Deviations from Plan

None - plan executed exactly as written. (Task 1 첫 커밋 시도는 훅이 `verification-before-completion` 스킬 미호출로 막았다. 스킬을 호출하고 새로 검증한 뒤 같은 내용으로 커밋했다.)

## Known Stubs

None.

## Threat Flags

None. 새 네트워크 · 인증 · 파일 접근 · 스키마 표면 없음(문장과 날짜 상수만 변경).

## Self-Check: PASSED

- 세 커밋(0e777e1 · a532e04 · 5da5430) `git log`에서 확인.
- 만든 점검표 `docs/design/checks/2026-10-01-수집-안내-v4.md` 존재, 변경 파일 열 개 모두 diff에 있음.
