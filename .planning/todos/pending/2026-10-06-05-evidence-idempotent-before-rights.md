---
created: 2026-10-05T21:27:41.000Z
title: 증빙 업로드 완료의 멱등 갈래가 권리 확인보다 먼저 DTO를 돌려준다 (E-46)
area: general
severity: minor
files:
  - domain/evidence/index.ts:269-280 (completeEvidenceUpload — A10 멱등 갈래)
  - domain/evidence/index.ts:311-312 (rule.load · rule.canSee · adderOf)
  - .planning/phases/06-payment-evidence-cards/eng-review-replan.md (E-46 — L66@b77fe3f6)
---

## Problem

`completeEvidenceUpload`(05 PR #162 `e739cb37`, `domain/evidence/index.ts:258`)는 응답 유실 재시도를 위해
「내 의도가 이미 완료됐으면 그 의도가 만든 살아 있는 파일로 성공」하는 멱등 갈래(05 A10, `:269-280`)를 둔다.
이 갈래는 `intent.createdBy === viewer.id`만 보고 `findAliveFileOfIntent` → DTO를 돌려주며, 주인 문서를 볼 권리
(`rule.load` → `rule.canSee` → `adderOf`, `:311-312`)는 그 **뒤**에서만 확인한다.

그래서 의도를 만든 뒤 권리를 잃은 사람(문서가 남의 범위로 옮겨짐 · 권한 회수)도 재시도로 파일 DTO를 받는다.
06은 주인 종류를 늘린다(`quote_revision` · `reserve_entry` · `corp_card_usage` — 06-16 · 06-25) — 새 종류에도
같은 갈래가 열린다(eng-review E-46, P3). 새는 것은 자기가 올린 파일의 메타데이터라 피해는 작다.

06은 고치지 않는다(eng-review 「NOT in scope」). eng-review는 06-16 · 06-25에 회귀 한 줄
(「보관 뒤 완료 재시도 = 같은 파일 · 새 행 0」)을 권했다 — 들어갔는지는 그 두 플랜 확정본을 본다.

## Solution

별도 fix PR. `domain/evidence`는 훅의 돈 경로 표 밖이지만 외부 입력(업로드) 경계라 `/review`가 `/cso` 추가를
판단한다(CLAUDE.md §4).

1. **재현 테스트 먼저**(`test/integration/evidence-upload.test.ts`): 의도 완료 → 업로더의 그 문서 열람 권리 회수 →
   같은 의도로 완료 재시도 → 지금은 DTO 성공, 고친 뒤 `EvidenceUploadRefusedError`(또는 권리 없음 오류).
2. 멱등 갈래에서도 `rule.load` · `rule.canSee`를 먼저 부른다 — 갈래 순서만 바꾸고 응답 모양은 그대로.
3. 기존 회귀 「응답 유실 재시도 = 같은 파일 · 새 행 0」(05 A10)과 06 「보관 뒤 완료 재시도」가 그대로 초록인지 본다.
