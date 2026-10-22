---
phase: 07-schedule-notify-audit
plan: 27
subsystem: evidence-visibility
status: complete
tags: [R20, C-65, D-726, AQ-15, private-files]
requires: ["07-11"]
provides:
  - 비공개 증빙 종류 업로드 때 files.private_to_owner 찍기
  - 파일 보임 판정 = 파일 칸 OR 지금 문서 종류
key-files:
  modified:
    - domain/evidence/private-files.ts
    - domain/evidence/index.ts
  created:
    - test/integration/evidence/private-file-flag.test.ts
key-decisions:
  - "종류 코드표 읽기는 tx 밖(전역 풀 교착 방지), tx 안에서 잠근 문서의 종류가 읽은 종류와 같은지 재확인 — 다르면 기존 restart 거부"
  - "잠김 줄: 종류 공개 + 칸으로 숨김이면 PRIVATE_EVIDENCE_SHEET_NOTICE (새 문구 없음)"
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
plan_head_before: 7d5eb19c
---

# Phase 07 Plan 27: R20 증빙 숨김 코드 Summary

비공개 증빙 종류로 올린 파일을 업로드 완료 때 `files.private_to_owner = true`로 찍고, 보임 판정을 `파일 칸 OR 지금 문서 종류`로 바꿔 문서 종류를 공개로 바꿔도 남에게 드러나지 않게 했다.

## 변경
- `domain/evidence/private-files.ts`: `FileVisibility.visible` 입력에 선택 `privateToOwner`. `fileVisibilityFor`는 지출결의 주인이면 종류가 공개여도 칸이 true인 파일을 `privateFileVisible`(올린 사람 · 전사 범위) 한 벌로 거름. 지출결의가 아닌 주인은 그대로 다 보임.
- `domain/evidence/index.ts`: `completeEvidenceUpload`가 `insertFile`에 `privateToOwner`를 찍음. `privateEvidenceNotice`는 종류가 공개인데 칸으로 숨긴 파일이 있으면 `PRIVATE_EVIDENCE_SHEET_NOTICE`.
- `repositories/files.ts`: 변경 없음(모든 select가 `select()` 전체 칸이라 `FileRow`가 칸을 자동으로 실음). `domain/expenses/` · `domain/evidence-records/` · `app/` · `ui/` 변경 0.

## 판정 호출처와 덮는 시험
| 자리 | 덮는 시험 |
|---|---|
| `evidence/index.ts` removeEvidence · voidEvidence · createEvidenceViewUrl · listEvidence · privateEvidenceNotice · getEvidenceActions (`visibilityOf` 한 길) | private-file-flag: 종류 바꿔도 숨김(목록) · 열기 URL null · 잠김 줄 · 분할 틈 / evidence-private-files(06.1-14) 전부 |
| `domain/expenses/index.ts:453` 결재 시트 | private-file-flag: 「종류가 공개로 바뀐 뒤에도 결재 시트에는 숨긴 파일 이름이 없고 잠김 한 줄만 있다」(코드 무변경으로 통과) |
| 다른 주인 종류 | private-file-flag: 「지출결의가 아닌 주인 파일은 칸 값과 상관없이 다 보인다」 |

## 검증 (실제 실행)
- RED: private-file-flag 8건 중 4건 실패(칸 미찍힘 · 숨김 풀림 · 잠김 줄 null) 확인 후 구현, GREEN 8/8.
- `vitest --project integration test/integration/evidence*` (evidence 폴더 + evidence-* 전체 + leak-scan): 29 파일 5581 테스트 통과.
- `pnpm typecheck` 0, `pnpm lint` 0 (boundaries 플러그인 경고만, 기존).
- `git diff --name-only origin/claude/07-pr-s-schema...HEAD`: 이 플랜 파일뿐, `db/` · `domain/auth/` · `domain/permissions/` 변경 0.
- DB: erp_w0727_test. 로그: /home/user/wt/logs/07-27/. 화면 파일 변경 없음 → E2E · design-gate 해당 없음.

## 호출한 스킬
`superpowers:test-driven-development`, `superpowers:verification-before-completion`. `systematic-debugging` · `plant8:design-gate`는 해당 상황(실패 추적 · 화면 변경)이 없어 호출하지 않음 — 첫 RED의 제출 게이트 실패(쓰지 않는 증빙 종류)는 시험 설정 문제로 원인이 바로 읽혀 시험 순서를 고쳤다.

## Deviations
- [Rule 3] 시험 설정: 비공개 종류(개인카드 전표)는 사용이 꺼져 있어 제출 게이트가 고르지 못하게 한다. 그래서 비공개 종류로 파일을 올린 뒤 공개 종류로 `submitReadyDraft` 제출하고 종류를 다시 정했다(공개 파일 하나가 더 붙는다).
- 계획 Task 2 acceptance의 `grep -c PRIVATE_EVIDENCE_SHEET_NOTICE domain/evidence/index.ts >= 1` 충족(import + 사용).

## 열린 질문 / 추천안 (진행함)
1. 업로드 찍기의 종류 판정을 tx 전에 읽고 tx 안에서 종류 불일치면 `restart`로 거부했다. 대안은 `repositories/code-tables.ts`에 tx 인자를 더하는 것(계획 files_modified 밖이라 안 함). 추천: 현행 유지.
2. `privateEvidenceNotice`가 모든 주인 종류에서 파일 목록 쿼리를 한 번 더 읽는다(전엔 비공개 종류일 때만). 추천: 수용(소량).

## Self-Check: PASSED
