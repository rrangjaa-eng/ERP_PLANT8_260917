---
phase: quick-261026-4xy
plan: 01
status: complete
subsystem: evidence-import
tags: [C-86, xlsx-zip-guard, card-bc, card-shinhan-accounting, hometax]
requirements: [QUICK-261026-4xy, C-86]
commits: 7
plan_head_before: 346ca3aea706c19f9cd4b6a8a93798bc6c0ab883
completed: 2026-10-26
key-files:
  modified:
    - lib/xlsx-server.ts
    - domain/evidence-import/formats/card-bc.ts
    - domain/evidence-import/formats/hometax-tax-invoice.ts
    - domain/evidence-import/formats/hometax-invoice.ts
    - domain/evidence-import/registry.ts
    - domain/evidence-import/types.ts
    - test/fixtures/evidence-import/build.ts
    - test/unit/evidence-import/pipeline.test.ts
    - test/unit/evidence-import/formats.test.ts
    - test/unit/evidence-import/samples.test.ts
  created:
    - domain/evidence-import/formats/card-shinhan-accounting.ts
actuals:
  tasks: 3
  commits: 7
---

# Quick 261026-4xy: C-86 실물 견본 4건 실패 수정 Summary

비씨 스트리밍 xlsx(zip 데이터 서술자) 허용 + 비씨 28칸 외화 칸 선택 + 신한 회계양식 새 서식 + 홈택스 승인번호 소문자 영숫자로, 실물 견본 6종이 전부 거절 없이 읽힌다(6/6 녹색).

## 커밋 (7)

| # | sha | 제목 |
|---|-----|------|
| 1 | e06917b | fix: accept data-descriptor deflate entries in xlsx zip guard |
| 2 | 5219dbe | fix: make BC foreign-amount column optional |
| 3 | fe941d3 | test: find xlsx samples and recount BC real sample |
| 4 | 44d7d78 | fix: allow lowercase alphanumeric approval number serial for hometax invoices |
| 5 | 8ea1e0b | test: recount tax invoice and Lotte real samples |
| 6 | 28db9bd | feat: add Shinhan corporate accounting-form card format |
| 7 | 4c9f1a1 | test: assert Shinhan accounting-form real sample counts |

## RED 기록 (값 없이)

- zip: 「데이터 서술자 xlsx(C-86) > 스트리밍 꼴 롯데 xlsx …」 — zipEntryStats null(not-excel). 새 위조 3종(descriptor-local-size · descriptor-stored · descriptor-understated)은 옛 규칙에서도 null이라 RED가 아니라 방어 유지 시험(새 규칙에서 계속 녹색).
- 비씨: 「비씨 28칸 .xls」 · 「비씨 28칸 해외」 — unknown-format 거절. 「비씨 28칸 xlsx 스트리밍」 — zip 고침 뒤엔 unknown-format(zip 고침 전엔 not-excel).
- 홈택스: 「세 번째 묶음이 소문자 영숫자 8자」(세금계산서) · 「세 번째 묶음 소문자 영숫자」(계산서) — line-errors 「승인번호 읽지 못함」. 대문자 · 두 번째 묶음 글자 거절 시험은 처음부터 녹색(가정을 고정하는 시험).
- 신한 회계양식: 기본 줄 · 빈 칸 · 해외 · 부가세 0 · 공급가액 미사용 · 부가세 부호 · 날짜/금액 글자 시험 7건 + 등록 배열 일곱 + 교차 표 행 — unknown-format 등으로 실패.

## 실물 측정표 (건수만)

| 서식 | 원자료 | parse lines | offsetPairs | 단언 |
|------|--------|-------------|-------------|------|
| card-bc (xlsx) | 데이터 9 + 합계 1줄 | 9 | 0 | 9 · 부가세 0 6 · needsCheck 0 · 빈 승인번호 0(원자료도 0) |
| card-lotte (xls) | 115 (취소일자 있는 7) | 113 | 1 | lines + 2×pairs = 115, 음수 6 + pairs 1 = 7 — 원자료와 일치 |
| card-shinhan-accounting (xls) | 162 · 25칸 | 158 | 2 | 162 · 빈 승인번호 4 · 음수 2(lines 0 + pairs 2) · 해외 2 · 시각 없음 6 |
| hometax-tax-invoice | 머리줄 아래 비빈 254 | 254 | 0 | 254 · 승인번호 26자 · 고유 열쇠 254 |
| hometax-invoice | 3 | 3 | 0 | 기존 그대로(3 · 음수 1) |
| hometax-cash-receipt | 1 | 1 | 0 | 기존 그대로 |

- 세금계산서: 원자료 비빈 254줄 = 고유 승인번호 254 = lines 254. 차이 없음(계획이 걱정한 품목 줄 · 총계 줄 중복 없음).
- 신한 시각 없음: 원자료 8줄(계획 단언 8)이지만 그중 2줄이 취소 줄이라 상쇄 쌍으로 빠져 읽힌 줄은 6. 두 음수 모두 짝 양수 1건씩 확인(카드 · 승인번호 · 금액 일치).

## 가정

1. 신한 회계양식은 공급가액(원화) 칸을 읽지 않는다 — 공급가 = 합계 − 부가세. 실물 진단: 공급가액 ≠ 합계 − 부가세인 줄 2줄(162줄 중).
2. 홈택스 승인번호 세 번째 묶음은 소문자 영숫자만 허용, 대문자 · 두 번째 묶음 글자는 거절(소문자만 관측).
3. 데이터 서술자 + stored(method 0)는 거절 — SheetJS가 로컬 크기로 전진한다. 서술자 deflate는 로컬 크기 0 또는 중앙과 같을 때만, 상한은 중앙 값 + inflatesToDeclared로 유지.
4. 해외 판정(신한 회계양식): 사용구분 ≠ 국내 또는 승인금액(외화) ≠ 0. 외화거래국가코드 `-`는 안 쓴다.

## 열린 질문

옛 신한 양식(card-shinhan)과 회계양식(card-shinhan-accounting)을 같은 기간 겹쳐 올리면 서식 키 접두어가 달라 열쇠가 갈려 중복으로 안 잡힌다(T-C86-05, 계획 범위 밖으로 열쇠 체계 미변경). 열쇠 체계(두 양식 공유 접두어 여부) 결정 필요한지 오케스트레이터 판단 요청.

## 260907 대조 (PR 본문용)

- zip: 260907은 SheetJS로 바로 읽어 데이터 서술자 xlsx를 허용(zip 가드 없음). 이번 고침은 허용하되 /cso B1 가드를 유지.
- 신한: 260907은 이용일시 + 이용카드 양식만(260907:A/domain/receiptImport.ts:408, 519-566) — 회계양식은 260907에도 없는 새 서식.
- 비씨: 260907은 감지를 수신정보구분코드 · 금액SIGN코드만으로(404), 열을 이름으로 읽어 외화 칸이 없어도 된다(582-642) — 이번 고침과 같은 결론.
- 홈택스 세금계산서: 260907 731-842행, 승인번호 정규식 언급 없음.

## 게이트 권고

lib/xlsx-server.ts는 외부 입력 압축 폭탄 방어(/cso B1) 변경 — 묶음 게이트 `/review`에 더해 `/cso` 권고. 위험 경로(db/ · 인증 · 권한 · 암호화) 변경 없음. 서식 키는 DB `text` 칸이라 마이그레이션 불요(`grep card-shinhan db repositories app` 0건 확인).

## 편차 / 메모

- [Rule 3] 계획 외 변경 없음. 픽스처의 옛 `data-descriptor` 위조는 새 규칙에서 정상 통과라 계획대로 위험 변형 3종으로 대체.
- 커밋 6에 비씨 스트리밍 시험 줄 타입(`FixtureRow[]`) 지정 한 줄 포함(typecheck 수정, 커밋 2의 시험에서 나온 오류).
- `pnpm lint`는 기본 힙(2GB)에서 OOM(exit 134) — 이 환경에선 `NODE_OPTIONS=--max-old-space-size=8192`로 통과. 코드 문제 아님(기존 환경 한계).
- 개인정보 관문: 견본 6개의 숫자 8자리 이상 값 · 이름 칸 값 1,453건을 `git diff 346ca3a..HEAD` 추가 줄과 커밋 메시지에 대조 — 커밋 메시지 0건, diff 2건은 모두 우연 일치 오탐(이미 저장소에 있던 가짜 마스크 카드 번호 `5531-52**-****-1278` 숫자 정규화, 한도 상수 `20_000_000`). 견본 파일 저장소 0(`git status --porcelain` xls/xlsx 0). 스크래치 시험 파일 삭제.

## 검증 결과

- `pnpm lint`(힙 8GB) exit 0 · `pnpm typecheck` exit 0
- `pnpm vitest run --project unit test/unit/evidence-import test/unit/domain/evidence-import lib`: 14 파일 통과 · 1 skip(samples) · 378 통과 · 6 skip(견본 시험, 폴더 없을 때)
- `EVIDENCE_SAMPLES_DIR=/mnt/project-files/06.1-prep/samples-private/ pnpm vitest run --project unit test/unit/evidence-import/samples.test.ts`: 6/6 통과, skip 0
- DB 통합 · E2E는 돌리지 않음(CLAUDE.md §5 — PR ready 시 CI)

## Known Stubs

없음.

## Self-Check: PASSED

커밋 7개(`git log --oneline` 확인) · 신규 파일 domain/evidence-import/formats/card-shinhan-accounting.ts 존재.
