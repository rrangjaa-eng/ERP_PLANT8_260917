# Phase 04 — /plan-ceo-review 심층 검토 산출물

**모드:** HOLD SCOPE · **구현 구조:** A(현행 13플랜) · **검토일:** 2026-09-22
**대상:** `04-01-PLAN.md` ~ `04-13-PLAN.md`(13플랜 · 6웨이브 · 37태스크)
**권위:** `04-CONTEXT.md` D-41~D-82(사용자 확정) · `ROADMAP.md` §Phase 4 · `04-UI-SPEC.md`(approved) · `CLAUDE.md`
**성격:** 검토 전용. 이 문서는 플랜을 고치지 않는다. 각 발견은 오케스트레이터가 사용자에게 개별 승인을 받는다.

> **이 문서의 판정 기준.** 잠긴 결정(D-41~D-82)과 어긋나는 지적은 발견이 아니다.
> 발견으로 올린 것은 전부 ① 잠긴 결정·요구사항이 요구하는데 ② 플랜에 **강제 지점이 없고**
> ③ 어느 게이트도 잡지 못하는 것이다. `docs/HANDOFF.md` §함정 10의 실측 결론이 그 기준이다 —
> 「컴포넌트가 된 계약은 지켜졌고 산문으로 남은 계약은 전부 어긋났다. 예외가 없다.」

---

## 총평

품질 점수 **8.5 / 10**.

이 13플랜은 이 프로젝트가 지금까지 만든 계획 중 가장 촘촘하다. 근거를 대는 방식이
일관되게 **파일:행 실측**이고, 잠긴 결정을 받아 적을 뿐 다시 고르지 않으며(D-78이 그 모범),
「계약을 컴포넌트·순수 모듈·정규식 게이트로 내린다」는 함정 10의 결론을 37태스크 전체에서
기계적으로 적용했다. 웨이브마다 게이트를 이름으로 박아 Phase 3의 실패(게이트 몰아치기)를
구조적으로 막았고, RTL 부재라는 제약을 숨기지 않고 **설계를 밀어** 계약 무게를
`column-fold.ts` · `grid-keys.ts` · `tsv.ts`로 옮긴 판단은 훌륭하다.

점수를 1.5점 깎은 이유는 **금액 집계·정수 연산·동시성 세 곳에서 같은 양식의 구멍**이
남았기 때문이다. 셋 다 (1) 값이 조용히 틀리고 (2) 플랜이 단언하는 속성은 그대로 통과하며
(3) 그 틀림이 이 페이즈가 없애려고 만들어진 「인트라넷 차익 불일치 66줄」과 **같은 부류**다.
특히 B1(차수 중복 집계)은 이 페이즈의 가장 눈에 띄는 숫자를 배수로 틀리게 만들 수 있는데
37태스크의 어느 단언도 그것을 보지 않는다.

---

## "NOT in scope" — 고려했고 명시적으로 미룬 것

| 항목 | 미루는 이유 | 행선지 |
|---|---|---|
| 지출결의 문서 자체 | 게이트·번호·금액 정본이 먼저 서야 그 위에 올라간다 | Phase 5 |
| 지급·증빙 | 지출결의가 없으면 증빙이 붙을 대상이 없다 | Phase 6 |
| 손익 계산 · 네 숫자 줄(PNL-01) | 확정 비용·수익이 없는 자리를 0·`—`로 채우는 것이 §7-3·§7-7 위반 | Phase 9 |
| 리저브 → 매출 충당(RSV-02) | 매출 기준(PNL-03)이 없다 | Phase 9 |
| 인트라넷 적재(load)·검증·델타·전환 | 이 페이즈는 extract·transform까지. 적재가 Cloud Run Job을 요구하는 시점이 Phase 8 | Phase 8 |
| 관리자 읽기 표 6개 · 폼 8개의 `ui/table`·`ui/form` 이관 | 폼 이관이 이미 Phase 7 성공 기준 5. 표도 같은 자리에서 한 번에(D-47) | Phase 7 |
| 03-OPEN-ITEMS DOM 감사 2·6·7(관리자 표 375px) | D-47에 묶여 있다 | Phase 7 |
| 번호 서식 설정 키 5종(지출결의·일반관리비·구매요청·법인카드·연차) | 그 문서를 만드는 페이즈가 등록(D-52) | Phase 5·6 |
| `field_definitions` 실제 정의 행 | 기계만 세우고 정의는 0건(D-82). 아무도 안 물은 회사 필드를 지어내지 않는다 | Phase 10 |
| PROJ-06 완료 시 미결 점검 | 지출결의가 생긴 뒤 | Phase 6 |
| `SYSTEM.md:404` `--success 500` 오탈자 정정 | 발견 사실만 기록. 정정은 이 페이즈 범위 밖(D-69) | 미정 |
| `04-UI-SPEC.md` D-77 정정(3차 버튼 `바꾸기`) | 승인된 계약 문서를 실행이 고치면 감사 흔적이 흐려진다 | 04-02 SUMMARY → 후속 |
| 지출결의 → 견적 줄 FK RESTRICT 실제 부착 | 참조하는 표가 아직 없다. 계약만 주석으로 남긴다 | Phase 5 |
| 목록 인덱스 부족분 추가 | `db/migrations/`를 건드리는 플랜은 04-05 하나(04-VALIDATION:99) | SUMMARY → 후속 |

---

## "What already exists" — 부분적으로 문제를 이미 푸는 것과 재사용 여부

| 기존 자산 | 무엇을 이미 푸는가 | 플랜이 재사용하는가 |
|---|---|---|
| `eslint/rules/money-boundary.mjs` + 그 테스트 | 금액 산술 경계. **규칙만 서 있고 모듈이 비어 있다** | ✅ 04-03이 모듈을 만드는 순간 리포 전체가 경계 안으로. 실제 타입 픽스처로 규칙이 반응함까지 증명 |
| `db/schema/document-counters.ts` · `repositories/document-counters.ts` | 카운터 표·복합 PK·읽기·upsert | ✅ 04-04가 원자적 증가만 얹는다. 스키마 변경 0(D-49) |
| `test/integration/document-counters.test.ts:40-43` | **의도된 방화벽** — 증가 함수의 부재를 단언 | ✅ 04-04가 같은 커밋에서 새 계약으로 교체 |
| `domain/settings/` 세율 키 11종(`readBy: phase 4`) | 세율·절사·기준일 기본값까지 입력됨 | ✅ 04-03 `applyTaxRule`이 소비. `registry-coverage` 예외 목록이 줄어드는 것이 증거 |
| `domain/code-tables/tax-rule.ts` | 세금 규칙 4종 유니언·zod 스키마·「세율은 여기 담지 않는다」 주석 | ✅ 04-03이 그대로 읽는다 |
| `domain/permissions/` `can`/`visible`/`scopeFor` + `ENTITY_MENUS` + `project()` DTO 투영 | 권한·정보 노출·행 필터·Row 탈출 금지 | ✅ 04-09가 세 줄 추가 + DTO 명세 파생 등록 |
| `ui/input/TextField.tsx` | §6-3 라벨 96px·`aria-invalid`·`aria-describedby`를 **맞게** 구현한 유일한 컴포넌트 | ✅ 04-07 `Select`가 구조를 그대로 복제 |
| `ui/shell/MoreSheet.tsx` | 네이티브 `<dialog>.showModal()` 포커스 트랩 패턴 | ✅ 04-08 `ui/confirm`이 **패턴만** 가져온다(재사용 불가 — 단일 목적) |
| `ui/permission-grid/PermissionGrid.tsx` + `resyncCells` 테스트 | 무관한 리렌더에 셀 상태가 지워지지 않게 하는 문제 | ✅ 04-10 오류 셀 고정이 같은 문제·같은 기법 |
| `ui/button/Button.tsx:34-39` dev warn | 「이유 없는 비활성 금지」를 코드가 막는 선례 | ✅ 04-08 `assertColumnContract`가 같은 형태 |
| `lib/actions/handle-server-error.ts` | allowlist 오류 처리 — `UserFacingError`만 화면에, 나머지는 `log.error` | ⚠️ 형태는 재사용하지만 **로깅 쪽은 아무 플랜도 쓰지 않는다**(N3) |
| `lib/log.ts` | Cloud Logging용 한 줄 JSON 로거 | ❌ 13플랜에 호출 0건(N3) |
| `test/unit/settings/registry-coverage.test.ts` · `leak-scan-coverage.test.ts` | 「두 정본의 어긋남을 정규식으로 잡는」 메타 테스트 형태 | ✅ D-58·D-61·D-76·D-78 검사가 전부 이 형태를 따른다 |
| `test/integration/custom-fields.test.ts` | `custom_fields` 미등록 키 거부 — **`vendor` entity에 대해서만** | ⚠️ 새 표(projects·quote_lines)에는 해당 테스트가 없다(B6) |
| `repositories/settings.ts:134` | 리포 유일의 `db.transaction` 선례. **`tx`를 인자로 받지 않는다** | ⚠️ 04-04·04-09가 요구하는 「같은 트랜잭션」에 이 선례로는 도달할 수 없다(B5) |
| `scripts/settings-import.ts:6-13` | 로컬 운영자 스크립트 ↔ 배포 번들의 구분 주석 | ✅ 04-06이 인용해 `scripts/migrate/`를 번들 밖에 둔다 |
| `백업 저장소 분석도구/parse_dump.js` | mysqldump `INSERT … VALUES` 파서(46표 검증됨) | ✅ 접근 방식만 가져와 TypeScript로 재작성(의존성 아님) |
| `playwright.config.ts` `MOBILE_SPEC_PATTERN` | `mobile-*.spec.ts` 파일명으로 폰 375 프로젝트 자동 편입 | ✅ 04-11·04-12·04-13이 그 패턴을 지킨다 |

---

## "Dream state delta" — 12개월 이상과의 거리

이 페이즈가 서면 **돈 뼈대의 정본이 전부 한 곳씩** 생긴다: 금액은 `domain/money`,
판정은 `domain/rules.gate` 레지스트리, 번호는 `document_counters` 행 잠금, 표시 계약은
`ui/table`·`ui/grid`·`column-fold.ts`. Phase 5·6·9·11은 **참조만** 하면 되고, 새 규칙 추가는
레지스트리 한 줄이다. 그것이 이상 상태의 핵심이고 이 계획은 거기에 도달한다.

남는 거리 넷:

1. **관측성이 이상 상태에서 가장 멀다.** 정본이 하나로 모였는데 그 하나가 거절할 때
   로그가 0줄이다(N3). 「판정이 한 곳을 지난다」의 배당금(모든 거절을 한 줄로 셀 수 있다)을
   이 페이즈가 받지 않고 넘긴다.
2. **스테이징이 없다.** 사용자가 Phase 3에서 결함 3건을 스테이징에서 먼저 찾았는데,
   13플랜의 검증 경로에 스테이징이 한 번도 나오지 않는다(N4).
3. **차수 모델의 대가를 아직 지불하지 않았다.** D-55의 「차수마다 줄 한 벌 통째로」는
   이력 보존에 옳지만, 그 대가는 **모든 집계가 차수를 명시해야 한다**는 것이다.
   이 페이즈는 그 대가를 집계 한 곳에서 지불하지 않았다(B1). Phase 9의 손익 집계가
   같은 함정을 다시 만난다.
4. **`custom_fields`가 기계만 서고 증거가 없다.** D-82가 요구한 「미등록 키 거부가
   테스트로 증명된다」가 새 표에 없어서, 기계가 실제로 섰는지 아무도 모른 채 Phase 10이
   그 위에 관리 UI를 올린다(B6).

12개월 뒤의 이상 상태는 「금액·판정·번호·표시의 정본이 하나이고, 각 정본이 자기 거절을
셀 수 있고, 모든 집계가 차수를 명시한다」다. 이 계획은 앞 절반을 완성하고 뒤 절반을 연다.

---

## 시스템 아키텍처 (Required diagram 1)

```
                         ┌──────────────────────── app/ (화면·서버 액션) ────────────────────────┐
                         │                                                                        │
  W4 04-11  app/(app)/projects/page.tsx ── project-form.tsx ── actions.ts ─┐                     │
  W5 04-12  app/(app)/projects/[id]/page.tsx ── quote-grid-section.tsx ────┤                     │
  W6 04-13  app/(app)/pnl/reserve/... ── reserve-form.tsx ─────────────────┤                     │
                         │                        │                        │                     │
                         └────────────────────────┼────────────────────────┼─────────────────────┘
                                                  │ authedActionClient      │ (lib/actions/client.ts)
                                                  ▼                        ▼
  ┌───────────────────────────────────── domain/ (판정·계산) ──────────────────────────────────┐
  │                                                                                            │
  │  W3 04-09  projects/ · quotes/ · quote-lines/ · exchange-rates/    W6 04-13 reserve/       │
  │      │            │             │                  │                       │               │
  │      ├────────────┴─────────────┴──────────────────┴───────────────────────┤               │
  │      ▼                                                                     ▼               │
  │  W2 04-04  rules/gate.ts ◄── GATE_RULES 레지스트리        W2 04-03  money/index.ts         │
  │      │      {allowed, reason, ruleKey}                        │   Money<Scale> 브랜디드    │
  │      │      GateDeniedError : UserFacingError                 │   round · toKrw            │
  │      │      ProjectStatus 유니언(D-78) ─────┐                 │   grossFromTotal           │
  │      │                                      │                 │   splitWithRemainder       │
  │  W2 04-04  document-numbers/                │                 │   applyTaxRule             │
  │      index.ts · format.ts                   │                 └──┬─── money-boundary 린트  │
  │      │                                      │                    │     (이미 서 있다)       │
  │  W2 04-04  permissions/{can,visible,scopeFor}·ENTITY_MENUS+3     │                         │
  └──────┼──────────────────────────────────────┼────────────────────┼─────────────────────────┘
         ▼                                      │                    ▼
  ┌──────────────────────── repositories/ (viewer 필수 · Row 탈출 금지) ───────────────────────┐
  │  document-counters.ts +incrementDocumentCounter   projects · quotes · quote-lines          │
  │  code-tables.ts +findCodeItemByTableKeyAndValue   exchange-rates · reserve-ledger          │
  └──────┬───────────────────────────────────────┼────────────────────────────────────────────┘
         ▼                                       ▼
  ┌──────────────────────────── db/ (제약이 정본) ─────────────────────────────────────────────┐
  │  W2 04-05  projects(status CHECK 4값 ◄─── 같은 집합이어야 한다 ─── ProjectStatus)          │
  │            quotes(projectId,round UNIQUE) · quote_lines(차수 FK, D-55) · exchange_rates    │
  │            reserve_ledger(balance CHECK >= 0) · document_counters(기존)                     │
  └────────────────────────────────────────────────────────────────────────────────────────────┘

  ┌──── ui/ (계약을 강제하는 컴포넌트 — 화면보다 먼저) ────┐   ┌──── scripts/migrate/ (독립) ────┐
  │ W2 04-02  kbd/format-shortcut.ts · button 수선(F4·F5)  │   │ W2 04-06  parse-dump · extract  │
  │ W3 04-07  form/{Form,FormRow,SubmitRow} · select        │   │           transform             │
  │ W3 04-08  table/column-fold.ts ── table/Table · confirm │   │  ALLOWED_TABLES 7표(D-57a)     │
  │ W4 04-10  grid/{Grid,grid-keys,tsv,ShortcutHints}       │   │  번들에 넣지 않는다             │
  │           └── column-fold.ts를 공유(D-46: 유일한 공유)   │   └─────────────────────────────────┘
  │ ❌ 자유 입력 자동완성(`<input list>`)의 소유 컴포넌트가 없다 → B8                             │
  └────────────────────────────────────────────────────────┘

  웨이브 의존: W1(04-01) → W2(02·03·04·05·06) → W3(07·08·09) → W4(10·11) → W5(12) → W6(13)
```

---

## 데이터 흐름 + 그림자 경로 (Required diagram 2)

### 흐름 1 — 프로젝트 등록 (04-11 → 04-09 → 04-04 → 04-05)

```
  INPUT ──────▶ VALIDATION ──────▶ TRANSFORM ──────▶ PERSIST ──────▶ OUTPUT
  폼 7칸         zod + can()        번호 부여         같은 TX?         DTO 투영
    │               │                  │                │                │
    ▼               ▼                  ▼                ▼                ▼
 [nil?]         [권한 없음?]      [자릿수 초과?]   [번호 UNIQUE      [차익 항목
  필수 NOT NULL   ForbiddenError    → throw(04-04)    충돌?]           숨김 계급?]
  → zod 거부      (기존 계약)       ✅ 테스트 있음     ✅ 이중 방어선    ✅ project()가
  ✅              ✅                                                     필드 제거 ✅
 [empty?]       [상태가 목록      [카운터 행 없음?] [TX 롤백?]       [Row 유출?]
  빈 문자열       밖?]              onConflictDo      ⚠️ B5 — 번호는    ✅ no-row-type
  → zod 거부      CHECK + 게이트     Nothing 후 증가   별 TX라 살아       -escape 린트
  ✅              ✅                ✅                남는다. 두 플랜이
                                                     반대로 적었다
 [wrong type?]  [번호 입력칸을    [동시 두 요청?]                    [번호 없음?]
  → zod 거부      끼워 보냄?]       행 잠금 직렬화                      발생 불가
  ✅              화면에 칸 없음    ✅ Promise.all                      (등록 시 부여)
                  ⚠️ 서버가 그 필드  통합 테스트
                  를 버리는지 단언
                  이 없다(경미)
```

### 흐름 2 — 견적 줄 일괄 저장 (04-12 → 04-09 → 04-05)

```
  INPUT ─────────▶ VALIDATION ─────────▶ TRANSFORM ─────────▶ PERSIST ─────────▶ OUTPUT
  N행 + updatedAt   zod → IDOR 재확인     차익 서버 계산       행별 조건부 UPDATE   성공/충돌
    │                  │                     │                    │                  │
    ▼                  ▼                     ▼                    ▼                  ▼
 [남의 줄 id?]     [게이트 거부?]       [브라우저 차익?]     [updated_at 불일치?] [부분 저장?]
  scopeFor 재확인    GateDeniedError       버린다 ✅            throw → 전체 롤백   불가 ✅
  ✅ 단언 있음       ✅ 16조합 표          ✅ 단언 있음         ✅ 핵심 단언         (핵심 단언)
 [빈 배열?]        [완료 잠김?]         [환율 null?]         [동시 같은 줄?]      [바뀐 값?]
  ⚠️ 0행 저장 요청   ✅ 게이트            ⚠️ B3 — krw=null이   ✅ D-48 조건부       ✅ current 반환
  의 기대 동작이                          저장되고 SUM이       UPDATE가 기법        ✅
  플랜에 없다(경미)                       조용히 건너뛴다
```

### 흐름 3 — 목록 합계 (04-11 → 04-09) ← **B1이 여기 있다**

```
  프로젝트 125건
       │
       ▼
  aggregateProjectTotals(viewer, opts)   "집계 쿼리 1회 — sql 템플릿으로 SUM"
       │
       ├── projects ──JOIN── quotes ──JOIN── quote_lines ── SUM(견적가·실행가·차익)
       │                        ▲
       │                        └── ❌ 차수 조건이 없다
       │
       ▼
  프로젝트 A가 3차수 = 줄 3벌(D-55: 새 차수는 줄 전부의 복사본)
       │
       ▼
  화면: 견적 36,000,000  ← 실제 12,000,000의 3배
  합계 행: 전 프로젝트의 배수 합
       │
       ▼
  그림자 경로 전부 조용하다:
   [nil?] 없음  [empty?] 0행은 0  [conflict?] 없음  [stale?] 없음
   → 실패가 아니라 **틀린 값**이라 어느 예외 경로도 타지 않는다
   → 04-09 통합 테스트는 1차수 픽스처로 통과
   → 04-11 E2E는 합계 행의 **존재**만 단언
```

### 흐름 4 — 환율 → 원화 환산 (04-09 → 04-03)

```
  통화 선택 ──▶ latestRateFor(currency) ──▶ toKrw({amount, rate}) ──▶ krwAmount 컬럼 ──▶ 셀/합계
                      │                          │                        │              │
                      ▼                          ▼                        ▼              ▼
                 [기록 0건?]                 [rate null?]            [null 저장]    [SUM(krw)]
                  null ✅                     null 반환 ✅            nullable        ⚠️ B3
                  화면 「계산 불가             (예외 아님 —            (암시)          NULL을
                  · 환율 없음」 ✅            §7-7 PARTIAL)                          조용히 건너뜀
                                                                                     → 합계가 낮다
                 [KRW?]                      [사람이 고쳐 적음?]
                  환율 1 ✅                    새 행 + 행동 로그 ✅
```

---

## 상태 기계 (Required diagram 3)

```
  projects.status — 값 집합의 정본은 CHECK 제약(04-05), 전이 정본은 gate(04-04)

                      ┌──────────────────┐
         등록 ───────▶│  pitching 수주중 │◀────── 되돌리기 불가(전이 없음)
        (D-42)        └────────┬─────────┘
                               │
                 ┌─────────────┴─────────────┐
                 ▼ 수주 성공                  ▼ 수주 실패
       ┌──────────────────┐         ┌──────────────────┐
       │ in_progress 진행 │◀────────│    lost 미수주   │   D-44 되살리기
       └────────┬─────────┘  뒤늦은 └──────────────────┘   (비용이 팀 손익의
                │             수주                          미수주 비용에서
                ▼ 정산                                      프로젝트 비용으로
       ┌──────────────────┐                                 자동 복귀)
       │ settled 완료(정산)│  ← 견적 줄 잠김 · 새 지출 거부(게이트 경유)
       └──────────────────┘     되돌리는 전이 없음 = 사실상 종단 상태

  허용 전이 정확히 넷. 나머지 12쌍(자기 자신 포함)은 거부 + reason(원인 · 다음 행동).
  강제: gate의 16쌍 it.each 표(04-04) + CHECK 제약(04-05)
      + ProjectStatus ↔ CHECK 집합 동일성 검사(04-09 project-status-parity)

  ⚠️ settled가 종단인데 되돌릴 경로가 없다 — 오입력 정산을 되돌리는 요구가 나오면
     Phase 5의 「정산 결재 문서」가 그 자리다. 이 페이즈의 결정으로 옳다(D-41).

  ────────────────────────────────────────────────────────────────────

  quote_lines.status (04-05)                    quotes 승인 (04-05·04-09)

   정상 ──▶ 취소(견적가 0, 이력 유지)            미승인 ──▶ 승인(approvedAt)
     │        ▲                                    │           │
     └── 보관? └── 연결 문서 있으면 보관 대신       │           └─ 되돌리기? 플랜에 없음
         (연결 문서 없을 때만)  취소만 허용         │              (경미 — 새 차수가 답)
                                                   └─ 승인 전 지출결의 거부
   ⚠️ 연결 문서 조회가 Phase 4에서 **빈 배열 스텁**이다(04-09).
      → 이 전이 제약은 Phase 4에서 실질적으로 강제되지 않는다. 스텁을
        Phase 5가 채우도록 강제하는 장치가 없다(N7).
```

---

## 오류 흐름 (Required diagram 4)

```
  domain/repositories 예외
        │
        ├── UserFacingError 계열 ──────────────▶ handleServerError ──▶ e.message ──▶ 화면
        │     GateDeniedError(reason, ruleKey)        │                (§8-3 형식)
        │     ArchivedVendorError                     │
        │     QuoteLineConflictError(충돌 목록)        └──▶ ❌ 로그 0줄 ← N3
        │     ReserveNegativeBalanceError                    (allowlist 설계상
        │     ForbiddenError                                  의도적으로 로그 안 함)
        │
        ├── ZodError ──────────────────────────▶ koreanZodErrorMessage ──▶ 화면
        │                                              └──▶ 로그 0줄
        │
        └── 그 외 모든 Error ──────────────────▶ log.error("action.unhandled_error")
              (DrizzleQueryError · CHECK 위반 ·        └──▶ 화면엔 일반 문구
               pool 고갈 · 예상 못 한 것)                    GENERIC_ERROR_MESSAGE

  결과: 이 페이즈가 새로 만드는 **모든 업무 규칙 거절**이 로그에 남지 않는다.
        게이트가 단일 진입점인데 그 진입점이 자기 거절을 세지 않는다 → N3
```

---

## 배포 순서 (Required diagram 5)

```
  1. git merge → CI(free tests → gate tier) 초록
  2. 이미지 빌드   Dockerfile runtime: ENV APP_ENV=prod (04-01, fail-closed)
  3. migrate Job   0009_… : CREATE TABLE ×5 + CHECK + GIN + 인덱스
                   한 파일 = 한 트랜잭션 + SET LOCAL lock_timeout 1s / statement_timeout 5s
                   → 전부 신규 표라 기존 행 잠금 0, 되돌릴 필요가 낮다(가산적)
  4. seed Job      project_status 코드표 재시드 — 기존 5행 중 겹치지 않는 4행 처리
                   (삭제/보관/방치 중 04-05 Task 1이 고른다)
                   ⚠️ 유일한 **비가산적** 단계. 롤백 시 구코드 seed가 5행을 되살린다
  5. Cloud Run 새 리비전 배포(롤링)
                   구/신 리비전 공존 창: 신규 표는 구코드가 모르므로 무해
                   코드표 4행 변화는 구코드의 코드표 화면에 라벨로만 보인다 — 무해
  6. ❌ 배포 후 검증 절차가 13플랜에 없다 → N4
```

## 롤백 흐름도 (Required diagram 6)

```
                     ship 직후 장애
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
     화면·계산만 깨졌다        데이터가 잘못 쌓인다
              │                       │
              ▼                       ▼
   Cloud Run 이전 리비전으로    표 5개는 **남긴다**(가산적, 구코드가 안 본다)
   트래픽 되돌리기 (~1분)       잘못 쌓인 행만 골라 처리
   마이그레이션 되돌림 불필요            │
              │                       ▼
              │              project_status 코드표만 확인
              │              (재시드가 4행을 지웠다면 구코드 seed가
              │               다시 넣으므로 자동 복구 — 단 중복 없음을 확인)
              ▼
     04-01만 되돌리려면?
     F1·F2가 각자 커밋이라 단독 revert 가능(D-59의 이유가 이것)
              │
              ▼
     되돌릴 수 없는 것: document_counters.value (단조 증가)
     → 결번이 남는다. ROADMAP 기준 1이 명시적으로 허용 ✅

  롤백 소요: 트래픽 전환 ~1분 · 마이그레이션 되돌림 불필요 · 데이터 정리는 건수 비례
  ⚠️ 이 절차가 어느 플랜에도 적혀 있지 않다 → N4
```

---

## Error & Rescue Registry (Section 2)

### 어디서 무엇이 실패할 수 있는가

| METHOD / CODEPATH | 무엇이 잘못될 수 있나 | 예외 클래스 |
|---|---|---|
| `domain/money.money()` | 정수 아닌 값 입력 | `Error`(throw) |
| `domain/money.round()` | 음수 × `round` 반쪽 경계 — 기대값 미정 | 없음(조용히 한 쪽) ← **GAP N1** |
| `domain/money.grossFromTotal()` | 부동소수 나눗셈으로 공급가 1원 낮음 | 없음(항등식은 성립) ← **GAP B2** |
| `domain/money.toKrw()` | 환율 없음 | 없음 — `null` 반환(의도) |
| `domain/money.toKrw()` → `krwAmount` 컬럼 | `null`이 저장되고 `SUM`이 건너뜀 | 없음 ← **GAP B3** |
| `domain/money.applyTaxRule()` | 미등록 증빙 종류 문자열 | `Error`(throw) ✅ |
| `domain/money.applyTaxRule()` | 코드표 `tax_rule` JSONB 부정 | `ZodError`(`taxRuleSchema.parse`) ✅ |
| `repositories.incrementDocumentCounter()` | 카운터 행 없음 | `Error`(throw) ✅ |
| `repositories.incrementDocumentCounter()` | 동시 두 요청 | 없음 — 행 잠금으로 직렬화 ✅ |
| `incrementDocumentCounter()` ↔ 호출자 TX | 별 트랜잭션이라 롤백 시 번호 생존 | 없음 ← **GAP B5**(두 플랜이 반대로 기술) |
| `domain/document-numbers.formatDocumentNumber()` | 순번 자릿수 초과 | `Error`(throw) ✅ |
| `domain/document-numbers.formatDocumentNumber()` | `per_project`인데 프로젝트 번호 없음 | `Error`(throw) ✅ |
| `domain/rules.gate()` | 알 수 없는 규칙 키 | `Error`(throw) ✅ 허용으로 떨어지지 않음 |
| `domain/rules.gate()` | 규칙 거부 | `GateDeniedError : UserFacingError` ✅ |
| `domain/projects.createProject()` | 번호 UNIQUE 충돌 | `DrizzleQueryError` → 일반 문구 ⚠️ |
| `domain/projects.transitionProjectStatus()` | 금지된 전이 | `GateDeniedError` ✅ |
| `domain/projects.transitionProjectStatus()` | 현재 상태가 예상과 다름(전이 경쟁) | 조건부 UPDATE 0행 → ? ← **GAP(경미)** |
| `domain/quote-lines.saveQuoteLines()` | 남의 프로젝트 줄 id(IDOR) | 거부 예외 ✅ 재확인 명시 |
| `domain/quote-lines.saveQuoteLines()` | 행 충돌(`updated_at` 불일치) | 충돌 전용 예외(`UserFacingError` 계열) ✅ |
| `domain/quote-lines.saveQuoteLines()` | 0행 요청 | 미정 ← **GAP(경미)** |
| `domain/quote-lines.cancelQuoteLine()` | 연결 문서 조회가 스텁(빈 배열) | 없음 — 항상 통과 ← **GAP N7** |
| `domain/exchange-rates.latestRateFor()` | 그 통화 기록 0건 | 없음 — `null` ✅ |
| `domain/reserve.addReserveEntry()` | 잔액 음수(단일 요청) | 도메인 거부 예외(§8-3 문구) ✅ |
| `domain/reserve.addReserveEntry()` | 잔액 음수(동시 두 요청) | 없음 — 두 층 다 통과 ← **GAP B4** |
| `domain/reserve.recomputeBalancesFrom()` | 과거 날짜 삽입 중 경쟁 | 없음 ← **GAP B4** |
| `aggregateProjectTotals()` | 다차수 프로젝트 중복 합산 | 없음 — 틀린 값 ← **GAP B1** |
| `scripts/migrate/extract` | 허용목록 밖 표·DB | `Error`(throw, 건너뛰기 옵션 없음) ✅ |
| `scripts/migrate/transform.parseMoneyText()` | 숫자 없는 자유 텍스트 | 없음 — `null` + `unknown` ✅ |
| `scripts/migrate/transform.parseMoneyText()` | `basis` 판정에 필요한 입력이 시그니처에 없음 | 없음 ← **GAP N2** |
| `ui/kbd.formatShortcut()` | 플랫폼 이름 박힌 선언(`cmd+S`) | `Error`(throw) ✅ |
| `ui/kbd.detectPlatform()` | 서버 렌더(`navigator` 없음) | 없음 — `"windows"` 기본값 ✅ |
| `TopBar` 첫 렌더 ↔ hydration | 서버 `Ctrl+K` / Mac 클라이언트 `⌘K` | 없음 — React 텍스트 불일치 ← **GAP B7** |
| `ui/table.assertColumnContract()` | P1 4열 이상 | dev `console.warn`(의도) ✅ |
| 화면 저장 경로(공통) | 예상 못 한 `Error` | `log.error` + 일반 문구 ✅ |
| **업무 규칙 거절 전부** | 왜 막혔는지 사후 추적 | 로그 0줄 ← **GAP N3** |

### 구조된 오류의 처리

| EXCEPTION CLASS | RESCUED? | RESCUE ACTION | USER SEES |
|---|---|---|---|
| `GateDeniedError` | Y | `handleServerError`가 message 통과 | reason(원인 · 다음 행동) ✅ |
| 견적 줄 충돌 예외 | Y | 전체 롤백 + 충돌 목록 보존 | 합계 행 `오류 1칸 · 전부 거부` + 셀별 이유 ✅ |
| `ReserveNegativeBalance` | Y | 도메인이 DB보다 먼저 판정 | `잔액이 음수가 됩니다 · 출금액을 줄이거나…` ✅ |
| `ArchivedVendorError`(04-01) | Y | 기록·복호화 전에 거부 | 원인 + 보관함 복원 안내 ✅ |
| `ForbiddenError` | Y | 기존 계약 | 권한 문구 ✅ |
| `ZodError` | Y | `koreanZodErrorMessage` | 한글 필드 오류 ✅ |
| `Error`(자릿수 초과·미등록 키·알 수 없는 규칙) | N ← **GAP** | — | 일반 문구 `처리 중 오류가…` ← 이유가 소실된다 |
| `DrizzleQueryError`(번호 UNIQUE·CHECK 위반) | N ← **GAP** | — | 일반 문구. 내부 SQL은 안 새지만 사용자가 재시도 여부를 모른다 |
| `toKrw` → `null` | N/A | 예외가 아니다 | 셀은 `계산 불가 · 환율 없음` ✅ / **합계는 조용히 낮다** ← B3 |
| pool 고갈(B5가 악화) | N ← **GAP** | — | 일반 문구 |
| 다차수 중복 합산 | — | 예외가 아니다 | **틀린 숫자** ← B1(가장 나쁜 칸) |
| 동시 리저브 음수 | — | 예외가 아니다 | **틀린 잔액** ← B4 |
| hydration 불일치 | N | React가 클라이언트 값으로 교체 | 깜빡임 + 콘솔 오류. 게이트 0 ← B7 |

**catch-all 없음** — `handleServerError`의 allowlist 설계가 「분류되지 않은 Error는 화면에
안 내보내고 로그에 남긴다」로 이미 옳다. 이 페이즈가 그 설계를 깨지 않는다.
문제는 반대 방향이다: **분류된 것(UserFacingError)이 로그에 안 남는다**(N3).

---

## Failure Modes Registry

`RESCUED=N` + `TEST=N` + `USER SEES=Silent` → **CRITICAL GAP**

| CODEPATH | FAILURE MODE | RESCUED? | TEST? | USER SEES? | LOGGED? |
|---|---|---|---|---|---|
| `aggregateProjectTotals` | 다차수 중복 합산 | N | **N** | **틀린 숫자(Silent)** | N | **← CRITICAL GAP (B1)** |
| `grossFromTotal` | 부동소수 나눗셈 1원 오차 | N | **N**(항등식만) | **틀린 공급가(Silent)** | N | **← CRITICAL GAP (B2)** |
| `SUM(krwAmount)` | NULL 행을 건너뛴 합계 | N | **N** | **낮은 합계(Silent)** | N | **← CRITICAL GAP (B3)** |
| `addReserveEntry` 동시 | 잔액이 실제로 음수 | N | **N** | **틀린 잔액(Silent)** | N | **← CRITICAL GAP (B4)** |
| `incrementDocumentCounter` ↔ 호출자 TX | 롤백 후 번호 생존 / pool 2연결 | N | **N** | 결번(허용) / 지연 | N | **← GAP (B5)** |
| `custom_fields` 저장(새 표) | 미등록 키가 통과할 수 있음 | ?(코드에 있음) | **N** | Silent | N | **← CRITICAL GAP (B6)** |
| `TopBar` hydration | 서버/클라이언트 문자열 불일치 | N | **N** | 깜빡임 + 콘솔 | N(콘솔만) | **← GAP (B7)** |
| `<input list>` 4곳 중복 구현 | 라벨·aria 배선이 화면마다 갈림 | N | **N** | 접근성 저하 | N | **← GAP (B8)** |
| `round` 음수 반쪽 | 방향이 구현자 재량 | N | 표는 있으나 값 미정 | 1원 차 | N | ← GAP (N1) |
| `parseMoneyText` basis | 시그니처로 구현 불가 | N | N | 이전 데이터 오분류 | 표준출력 요약 | ← GAP (N2) |
| 게이트 거부 전부 | 사후 추적 불가 | Y(사용자에겐) | Y | reason ✅ | **N** | ← GAP (N3) |
| 배포 직후 회귀 | 스테이징 없이 프로덕션 | N | N | 사용자가 먼저 발견 | 기존 로그만 | ← GAP (N4) |
| `.planning/**` SUMMARY | 인트라넷 수치 커밋 | N | **N** | public 노출 | N | ← GAP (N5) |
| 375px 넘침 | 실행자 자작 단언만 | Y(E2E) | Y | 가로 스크롤 | N | ← GAP (N6, 독립성) |
| `cancelQuoteLine` 스텁 | 연결 문서 확인이 무조건 통과 | N | N(통과 불가) | 잘못된 보관 허용 | N | ← GAP (N7) |
| 매출 칸 저장 방식 미정 | 중복 저장·입력 유실 | ? | N | 값 유실 가능 | N | ← GAP (N8) |
| 이전 번호 예약 범위 | Phase 8 번호 충돌 | N | N | UNIQUE 위반 | 일반 문구 | ← GAP (N9) |
| 전이 경쟁(조건부 0행) | 기대 동작 미정 | ? | N | 미정 | N | ← GAP(경미) |
| 동시 채번 | 같은 번호 중복 | Y | **Y**(Promise.all) | — | — | ✅ |
| 일괄 저장 부분 반영 | 절반만 저장 | Y | **Y**(핵심 단언) | `오류 1칸 · 전부 거부` | N | ✅ |
| IDOR(남의 줄 id) | 다른 프로젝트 줄 수정 | Y | Y | 거부 | N | ✅ |
| 보관 거래처 계좌 평문 | 정보 노출 | Y | **Y**(4케이스) | 원인+다음 행동 | N | ✅ |
| `APP_ENV` 미설정 이미지 | 시크릿 검사 건너뜀 | Y | **Y**(2게이트) | 부팅 거부 | 기동 로그 | ✅ |
| 허용목록 밖 표 추출 | 개인정보 유출 | Y | **Y** | 실패 | 표준오류 | ✅ |
| `ProjectStatus` ↔ CHECK 갈림 | PROJ-04 전멸 | Y | **Y**(3중 검사) | — | — | ✅ |
| `Money` 이름 우회 | 린트 탐지 구멍 | Y | **Y**(실제 타입 픽스처) | — | — | ✅ |
| `⌘` 리터럴 잔존 | Windows 사용자 오표기 | Y | **Y**(리포 전역) | — | — | ✅ |

**합계: 27행 · CRITICAL GAP 6 · GAP 12 · 정상 9**

---

## 발견 목록 요약 (전체 상세는 검토 보고서 본문)

### BLOCKING (8)

| # | 플랜·태스크 | 차원 | 한 줄 |
|---|---|---|---|
| B1 | 04-09 T1 · 04-11 T2 | Data Flow / Perf | `aggregateProjectTotals`에 차수 조건이 없어 다차수 프로젝트의 견적 합계가 배수가 된다 |
| B2 | 04-03 T2 | Code Quality / Test | `grossFromTotal`의 부동소수 나눗셈이 플랜 자신의 기대값(12,400,000)을 만들지 못한다(표본 4%에서 1원 낮음) |
| B3 | 04-09 T2·T3 · 04-11 | Errors | `toKrw`의 `null`이 `SUM`에서 조용히 빠져 합계가 낮아진다. 「계산 불가」가 셀에만 있고 합계에 없다 |
| B4 | 04-13 T1 · 04-05 T2 | Data Flow(async) | 리저브 잔액에 직렬화 장치가 없어 동시 출금 둘이 두 층을 다 통과하며 실제 잔액이 음수가 된다 |
| B5 | 04-04 T1 · 04-09 T1 | Architecture | `incrementDocumentCounter`가 자기 트랜잭션을 열고 `tx`를 받지 않아 「같은 트랜잭션」 계약이 구조적으로 불가능하고, 두 플랜이 반대로 기술했다 |
| B6 | 04-09 T2 | Test / 잠긴 결정 | D-82의 「미등록 키 거부가 테스트로 증명돼야 한다」가 새 표에 없고, 04-09의 「최소로」가 D-82의 「0건」과 어긋난다 |
| B7 | 04-02 T2 | Data Flow / Design | `"use client"`인 `TopBar`도 SSR된다 — `formatShortcut("mod+K")` 렌더 호출이 Mac에서 hydration 불일치. 콘솔 가드가 E2E에 0건이라 모든 게이트가 통과 |
| B8 | 04-07(미소유) · 04-11·04-12·04-13 | Design & UX | D-66의 `<input list>`가 4곳에서 쓰이는데 소유 컴포넌트가 없다 — 함정 10의 `.selectLabel` 6복제와 같은 양식 |
| B9 | 04-06 T2 (frontmatter) | Architecture / Sequencing | 04-06이 같은 웨이브의 04-05·04-03 산출물에 의존하는데 `depends_on`에 없고, 의존 대상(컬럼 모양)이 04-05 안에서 스스로 미정이다 — 상세는 § Outside Voice |

### 비차단 (11)

| # | 플랜 | 차원 | 한 줄 |
|---|---|---|---|
| N1 | 04-03 T1 | Test | 음수 × `method:"round"` 기대값이 미정인데 표 조합은 필수다 |
| N2 | 04-06 T2 | Code Quality | `parseMoneyText(text)` 시그니처로는 「표본 대조」 basis 판정이 불가능하다 |
| N3 | 13플랜 전체 | Observability | `lib/log.ts` 호출 0건. 모든 업무 규칙 거절이 `UserFacingError`라 설계상 로그에 안 남는다 |
| N4 | 13플랜 전체 | Deployment | 스테이징·배포 후 검증·롤백 절차가 어디에도 없다(Phase 3에서 사용자가 스테이징에서 3건을 먼저 찾았다) |
| N5 | 04-06 | Security(D-57) | 실데이터 수동 검증 결과가 들어가는 `04-06-SUMMARY.md`·`04-VERIFICATION.md`에 누출 게이트가 없다 |
| N6 | 04-11·04-12·04-13 | Process(CLAUDE.md) | 「독립 DOM 감사」가 13플랜에 0회 — 감사 단언을 실행자가 자기 스펙에 쓴다 |
| N7 | 04-09 T2 | Long-Term | `cancelQuoteLine`의 빈 배열 스텁을 Phase 5가 채우도록 강제하는 방화벽 테스트가 없다(선례는 있다) |
| N8 | 04-12 T1 | Data Flow | 매출 칸 저장 방식(blur 자동저장 vs 2차 버튼)이 미정인데 UX-04가 「중복 저장·입력값 유실 없음」을 요구한다 |
| N9 | 04-06 T2 | Long-Term | ROADMAP 기준 7의 「예약 범위」가 어느 산출물에도 없다 — Phase 8에서 번호 충돌 |
| N10 | 04-01 T1 | Observability | `APP_ENV=prod` 기본값이 `domain/system-status:58`의 환경 표시를 「prod」로 만든다(비배포 실행) |
| N11 | 04-06 T1↔T2 | Process | Task 1이 픽스처에 `fone_member`를 넣으라 하고 Task 2의 게이트가 그 이름을 금지한다 — 첫 실행에서 구조적으로 실패 |

---

## Stale Diagram Audit

이 페이즈가 건드리는 파일들의 ASCII 다이어그램 정확성.

| 위치 | 다이어그램 | 이 페이즈 뒤에도 정확한가 |
|---|---|---|
| `docs/design/SYSTEM.md` :269 상단 바 | `⌘K` 표기 | ⚠️ **부정확해진다** — 04-02가 §7-9에 「위 표기는 Mac 예시」 불릿을 넣어 읽는 법을 정하므로 도식 자체는 고치지 않는 것이 옳다(04-02의 명시적 판단). 다만 도식을 보는 사람이 §7-9까지 읽어야 한다 |
| `SYSTEM.md` :273 · :367 힌트 줄 | `⌘C/⌘V` `⌘↵` `⌘S` `⌘E` | ⚠️ 같은 이유로 Mac 예시로 남는다. **`⌘E`는 이 페이즈에 구현되지 않는다**(Phase 5) — 도식이 미래 상태를 보여 준다는 사실이 §7-9의 「그 화면에서 실제로 되는 것만」과 긴장한다. 04-10이 힌트 줄에서 `⌘E`를 빼도록 금지 항목으로 박아 실물은 정확하다 |
| `SYSTEM.md` :319 지출결의 목록 | `지출결의 464` 건수 | ✅ Phase 5 대상. 이 페이즈가 바꾸지 않는다 |
| `SYSTEM.md` :355 · :367 견적 줄 화면 | 상세 = 견적 원장 도식 | ✅ 04-12가 이 도식대로 만든다. 부제 `상세 견적 2차 · 진행 중` ↔ D-78의 `in_progress` 라벨 「진행」과 어긋난다(도식은 「진행 중」) — 라벨 정본은 코드표이므로 **도식이 약간 낡았다**(경미, 이 페이즈 범위 밖) |
| `SYSTEM.md` :386 · :391 첨부·제출 줄 | `⌘U` `⌘↵` | ✅ Phase 6 대상 |
| `SYSTEM.md` §7-3 :660-696 | 편집용 표 계약 | ⚠️ :673이 04-02 Task 1에서 **교체된다**(`--success` → `--g-800`). 교체 후 정확 |
| `SYSTEM.md` §7-7 :722-731 | 다섯 상태 표 | ✅ 04-02가 「색 토큰을 적지 않으므로 고칠 대상이 아니다」를 실측으로 확인했다 |
| `docs/HANDOFF.md` §함정 10 복제 실측 표 | `.table` 8파일 · `.select` 6파일 · `<form>` 9파일 · `--form-max` 사용처 0 | ⚠️ **이 페이즈 뒤 부분적으로 낡는다** — `--form-max`는 사용처 1(04-07), `ui/table`·`ui/select`·`ui/form`이 생긴다. 그러나 **이관은 Phase 7**(D-47)이므로 복제 수치(8·6·9)는 그대로다. 표를 고치지 않는 것이 옳고, 「메커니즘은 Phase 4 · 이관은 Phase 7」이 어딘가에 남아야 한다 |
| `docs/ARCHITECTURE.md` | 4계층 경계 서술 | ✅ 04-05 Task 3이 표 둘 + 1MB 한 줄을 더한다. 300행 상한 주의 |
| `04-CONTEXT.md` D-59 | 결함 위치 서술(`repositories/vendors.ts:47`) | ✅ 이미 정정 기록이 같은 문서에 있고 04-01이 인용한다 |
| `04-UI-SPEC.md` Copywriting 3차 버튼 | `바꾸기` — 이 페이즈에 사용처 0 | ⚠️ D-77이 정정을 요구. 04-02가 SUMMARY 후속 항목으로 남긴다(승인된 계약을 실행이 고치지 않는다) |
| `04-VALIDATION.md` Wave 0 목록 | 테스트 파일 경로 | ✅ 경로 정정 완료(`test/unit/money/*` · `test/unit/rules/*`). `nyquist_compliant: true` |

---

## TODOS.md 후보 (HOLD SCOPE — 수용된 범위의 정확성·운용성 갭만)

각 항목은 오케스트레이터가 개별 승인을 받는다. HOLD SCOPE이므로 **가정적 미래 역량·선택 기능은
올리지 않았다.**

1. **게이트 거절 로깅**(N3) — What: `domain/rules/gate.ts`의 거부 분기에서 `log.warn`
   한 줄(ruleKey · docId · viewerId · from→to). Why: 단일 진입점의 배당금을 받는다.
   Pros: 3주 뒤 「왜 막혔나」를 로그만으로 재구성. Cons: 거절이 잦으면 로그량.
   Effort: S→S. Priority: P2. Depends: 04-04.
2. **스테이징 배포 + 배포 후 검증 체크리스트**(N4) — What: 웨이브 6 뒤 `/ship` 전에 스테이징
   배포 + 5분/1시간 확인 목록. Why: Phase 3에서 사용자가 스테이징에서 3건을 먼저 찾았다.
   Pros: 발견 지점이 사용자 앞에서 앞당겨진다. Cons: 배포 1회 비용. Effort: M→S. P1.
3. **`.planning/**` 인트라넷 수치 누출 게이트**(N5) — What: SUMMARY·VERIFICATION에
   실데이터 유래 수치·이름이 없음을 단언하는 단위 테스트. Why: public 레포(D-57).
   Pros: 실데이터 수동 검증을 안전하게 반복. Cons: 무엇이 「실데이터 유래」인지 규칙 필요.
   Effort: S→S. P1. Depends: 04-06.
4. **`cancelQuoteLine` 스텁 방화벽 테스트**(N7) — What: 연결 문서 조회가 스텁임을 단언하는
   테스트(`document-counters`의 「부재 단언」과 같은 형태). Why: Phase 5가 채우도록 강제.
   Pros: 제약이 조용히 빈 채 남지 않는다. Cons: Phase 5가 한 테스트를 교체해야 한다(의도).
   Effort: S→S. P2. Depends: 04-09.
5. **이전 번호 예약 범위 계약 기록**(N9) — What: `deriveDocumentNumber` 주석 + ARCHITECTURE
   한 줄 + Phase 8이 카운터를 예약 범위 위로 올린다는 계약. Why: ROADMAP 기준 7의 「예약 범위」가
   어디에도 없다. Pros: Phase 8의 UNIQUE 충돌을 미리 막는다. Cons: 없음. Effort: S→S. P2.
6. **독립 DOM 감사 단계 명문화**(N6) — What: W4·W5·W6 게이트에 「실행자 아닌 에이전트가
   `CI=true`로 DOM 실측 판정」을 추가. Why: CLAUDE.md 프론트엔드 규칙의 명시 절차.
   Pros: 전체 게이트를 두 번 돌리지 않는다. Cons: 웨이브마다 에이전트 1회. Effort: S→S. P2.
7. **`round` 음수 반쪽 기대값 확정**(N1) — What: `round(-1235, {unit:10, method:"round"})`의
   기대값을 플랜에 박는다. Why: 표 조합은 필수인데 한 칸의 값이 재량이다.
   Pros: 구현자가 즉석 판단하지 않는다. Cons: 없음. Effort: S→S. P2. Depends: 04-03.

---

## Outside Voice — 독립 도전

**Preflight 결과: `CODEX_MODE: not_installed`** (`codex_reviews=enabled`, `codex` CLI 부재 실측).
스킬 지시대로 네이티브 Claude 서브에이전트로 대체해야 하지만, **이 검토 프로세스에
Agent/Task 도구가 없어 대체 디스패치도 불가능**했다.

> **outside_status: unavailable — 외부 커버리지 없음.** 아래 도전은 같은 모델의
> 자기 반박이고 **외부 커버리지가 아니다**(스킬 원문: "A native result never supplies
> outside coverage"). 이 페이즈는 독립 2차 의견 없이 진행된다는 사실을 기록한다.
> 복구: `npm install -g @openai/codex` 후 재실행.
> 기록: `codex-plan-review / status=unavailable / outside_status=unavailable` 저장 완료.

### 자기 반박에서 나온 것 — 섹션 1~11이 놓친 발견 하나

**B9 (BLOCKING) — 04-06이 같은 웨이브의 산출물에 의존하는데 그 의존이 선언되지 않았고,
의존 대상이 스스로 미정이다.**

`04-06-PLAN.md:6` `depends_on: ["04-01"]` · `wave: 2`. 그런데 같은 플랜 Task 2의 read_first가
둘을 요구한다:

- `04-06-PLAN.md:179` — 「04-05가 만드는 표 다섯의 컬럼 이름 — 변환 출력이 그 모양이어야 한다.
  **같은 웨이브이므로 04-05-PLAN.md의 Task 1·2를 읽어 맞춘다**」
- `04-06-PLAN.md:178` — 「`domain/money/index.ts`(04-03이 만든다) … **04-03과 같은 웨이브라
  파일이 아직 없으면** 04-03-PLAN.md의 Task 1을 읽어 시그니처를 맞추고, 그래도 막히면
  이 태스크의 금액 계산을 얇은 어댑터 뒤에 두어 나중에 갈아 끼울 수 있게 한다」

**플랜 마크다운을 읽는 것으로는 해결되지 않는다.** `04-05-PLAN.md:204`(Task 2)가 바로 그
컬럼 모양들을 **실행자 재량으로 남겼다**:

- 「**금액 공용 컬럼 묶음**을 견적가·실행가 각각에 대해 둘지, 아니면 통화·환율을 줄 단위로
  하나만 둘지 **판단한다** … **줄 단위 통화·환율 + 금액별 외화·원화 컬럼을 기본으로 고르고**」
- 「거래처(**FK 또는 값** — 위 판단과 같은 결로 고른다)」
- `04-05-PLAN.md:202` 「차수 정수(`round`, nullable **또는 별도 플래그**로 사전 견적 구분 —
  **둘 중 하나를 고르고**)」 · 「고객 승인 표시(`approvedAt`·`approvedBy` **또는 불리언** — 고른다)」

즉 04-06이 맞춰야 하는 대상이 **계획 시점에 존재하지 않고 계획서에도 없다.**

**위반하는 required_property:** ROADMAP 기준 7 — 「변환한 **결과가 개발·테스트 픽스처로
쓰인다**」. 출력 모양이 표 모양과 다르면 그 픽스처는 쓰일 수 없다. 그리고 웨이브 그래프의
불변식(「같은 웨이브 플랜은 서로의 산출물에 의존하지 않는다」)이 04-06에서만 깨져 있다.

**어느 게이트도 잡지 못하는 이유:** 04-06의 검증 전부가 합성 픽스처 위에서 닫힌다
(`parse → transform → 단언`). 변환 출력의 키를 `db/schema/*`와 **대조하는 검사가 없다.**
그리고 출력이 실제로 적재되는 시점은 Phase 8이므로, 어긋남은 **한 페이즈 뒤**에
원인과 떨어져 나타난다 — D-78이 막으려 했던 것과 정확히 같은 양식이고, 이번에는
페이즈 경계를 넘는다.

**예시 수정(비강제) 둘 중 하나:**
- ⒜ **04-06을 Wave 3으로 옮기고** `depends_on: ["04-03","04-05"]`로 바꾼다. 비용이 거의 없다 —
  04-06의 `files_modified`가 `scripts/migrate/**`·`test/**`·`docs/OPERATIONS.md`뿐이라 어느
  플랜과도 파일을 공유하지 않고, `04-VALIDATION.md:99`의 제약은 `db/migrations/`에만 걸린다.
  Wave 3은 이미 세 플랜(07·08·09)이라 넷이 되어도 웨이브 폭이 웨이브 2(다섯)를 넘지 않는다.
- ⒝ Wave 2에 두되 **변환 출력 키가 drizzle 스키마 컬럼 이름의 부분집합임을 단언하는
  메타 테스트**를 04-06에 둔다(`db/schema/*.ts`를 정규식으로 파싱 — `source-column-coverage`·
  `registry-coverage`와 같은 형태). 이 경우 04-06은 04-05 뒤에 실행돼야 하므로 사실상 ⒜가 된다.
  → **⒜를 권한다.** 이 페이즈에서 유일하게 「의존을 선언으로 옮기면 끝나는」 발견이다.

### 자기 반박이 기각한 것 — 발견이 아니다

| 도전 | 왜 발견이 아닌가 |
|---|---|
| 「`ui/grid` 자체 구현이 이 페이즈 토큰의 20%다. 라이브러리가 싸다」 | **D-45가 잠근 결정**이고 근거 셋 중 (2)가 실측으로 버틴다 — 폰 칸 접기·서버가 안 보내는 열·고정 오류 셀·외화 2행은 어느 라이브러리에도 없다. 잠긴 결정과 어긋나는 지적은 발견이 아니다 |
| 「13플랜·37태스크는 10~30명 시스템에 과하다. 프로젝트 등록·목록만 먼저 내보내라」 | 사용자가 **HOLD SCOPE + 구현 구조 A**를 이미 골랐고 대안 B(그리드 깎기)·C(별도 페이즈)가 UX-05·PROJ-02 본문을 어긴다는 판정이 CONTEXT에 기록돼 있다. 재론하지 않는다 |
| 「`Money`를 브랜디드 스칼라로 두면 통화를 잃는다」 | **D-80이 잠갔다.** `money-boundary.mjs`가 타입 문자열로 판정하므로 스칼라여야 모든 산술 지점에서 잡힌다는 근거가 실측이다 |
| 「settled(완료)에서 되돌아오는 전이가 없다」 | D-41이 전이 넷을 명시했고 되돌리기는 Phase 5의 정산 결재 문서다. 설계 의도 |
| 「`document_counters` 컬럼명을 ROADMAP 표기로 맞추는 마이그레이션이 없다」 | **D-49가 잠갔다** — 이름만 다르고 구조가 같다. 매핑을 문서에 적는 것이 결정 |
| 「모든 플랜이 `confidence: low`라 추정이 정보를 담지 않는다」 | 표기 관례 문제이고 요구사항 위반이 아니다. 다만 **04-12(96K·유일한 Wave 5·UX-05 E2E + PROJ-03 + PROJ-04)가 페이즈 꼬리를 한 플랜 폭으로 만든다**는 점은 실행 시 주의 사항으로만 남긴다 |

### Cross-model tension

```
CROSS-MODEL TENSION: 없음 — 외부 목소리가 실행되지 않았다.
  섹션 1~11의 발견과 대조할 독립 판정이 존재하지 않는다.
  두 모델의 합의라는 신호를 이 페이즈는 갖지 못했다.
  이것은 「합의했다」가 아니라 「검사하지 않았다」로 기록된다.
```

---

## 수정된 발견 총계

- **BLOCKING 9** (B1~B8 + Outside Voice 자기 반박의 B9)
- **비차단 11** (N1~N11)
- **CRITICAL GAP 6** (Failure Modes Registry 기준)
- **외부 커버리지: 없음**(unavailable — codex 미설치 + Agent 도구 부재)

---

*작성: /plan-ceo-review 심층 검토 · HOLD SCOPE · 검토 전용(플랜 미수정)*
*Outside Voice: unavailable — 외부 커버리지 없이 진행*
