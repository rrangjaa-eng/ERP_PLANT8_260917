---
phase: quick-260929-opt
plan: 01
status: complete
subsystem: projects-ui
tags: [ui, focus, table, numeric-column, e2e]
key-files:
  modified:
    - .planning/phases/04-project-quote-ledger/04-UI-SPEC.md
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/previous-revision.tsx
    - app/(app)/projects/project-form.tsx
    - test/e2e/quote-revisions.spec.ts
    - test/e2e/project-register.spec.ts
  created:
    - docs/design/checks/2026-09-29-04-ui-가나다.md
metrics:
  tasks: 3
  commits: 3
---

# Quick 260929-opt: PR #104 UI (가)(나)(다) Summary

명사형 등록 오류 문구를 UI-SPEC에 맞추고, 견적 표 「번호」 열에 숫자 규칙을, 등록 폼 거부 시 첫 오류 칸 포커스를 적용했다.

## Commits
- 10049e03 docs: align registration submit error copy in 04-UI-SPEC with code ((가): 385·1126행, 2추가·2삭제)
- 9d64bd38 test: pin quote row-number numeric rule and registration focus-to-first-error (RED)
- 0aaa91a7 fix: numeric rule for quote row-number column and focus first error on registration reject (GREEN + 점검표)

## RED (수정 전, CI=true, 47 passed / 3 failed)
- (나) 1280 「번호」: toEqual 실패 — 머리글·칸 textAlign left/start · whiteSpace normal · fontVariantNumeric normal
- (다) f1: `#clientId` toBeFocused 실패(inactive) · f2: `#endDate` toBeFocused 실패(inactive)
- 기존 47개 통과

## GREEN
- lint 0 · typecheck 0 · `CI=true pnpm build` 0
- quote-revisions + project-register (desktop, CI=true, workers=1): 50 passed

## Deviations from Plan
- 04-UI-SPEC 1126행도 385행과 같은 결정으로 맞춤(오케스트레이터 추가 지시 그대로).
- 그 외 계획대로.

## 범위 밖 관찰
- UI-SPEC 59행(개정 이력 표)에 옛 문구 `등록하지 못했습니다 · 클라이언트 1칸`이 남아 있다(역사 기록이라 유지).
- 04-UI-REVIEW 「사용자 판단 필요」 1~3은 PR #104 [지시]로 정해졌지만 그 문서는 고치지 않았다.

## 오케스트레이터 확인 · 독립 DOM 감사
- 직접 확인: diff 검토(align 2줄 + project-form effect 7줄) · app 3파일을 9d64bd38로 되돌려 CI=true E2E `-g "PR #104"` → 3 failed(toBeFocused #clientId · #endDate, toEqual 번호 열) 재현 → 복원 → quote-revisions + project-register CI=true desktop 50 passed · lint 0 · typecheck 0.
- 독립 DOM 감사(별도 Sonnet, CI=true 프로덕션 빌드, 1280·1024·375·320): FAIL 0. 1280 두 표 「번호」 th·td 전부 right·nowrap·tabular-nums, 이웃 금액 열 그대로·항목/소분류 왼쪽 그대로 · 1024·375·320 번호 열 접힘 그대로 · 가로 넘침 0 · 등록 폼 빈 제출(클릭·Ctrl+Enter) → #clientId, 종료일 역전 → #endDate(문구 `등록 실패 · 종료일 1칸`), 입력 중 포커스 뺏김 없음, 정상 제출 이동·콘솔 오류 0. 스크래치 스펙: 세션 scratchpad/dom-audit/(저장소 밖).

## Self-Check: PASSED
