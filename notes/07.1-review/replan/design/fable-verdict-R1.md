# Fable 판정 R1 — 07.1-18-PLAN 견적 표 `상태` 칸 (읽기 전용)

- 저장소: /home/user/ERP_PLANT8_260917 @ 41a5fe2
- 질문: 18-PLAN이 그대로 실행되면 막히는가(실행 불가 또는 화면 규칙 위반)?
- 쟁점: Claude 검토자 B-R1 「견적 표 `상태` 칸 메모 2줄」 vs Codex 「막는 문제 0건(언급 없음)」

## 판정: **막음** (화면 규칙 위반이 확정이고, 실행자가 규칙대로 픽스처를 넣으면 실행 불가로 바뀐다)

## (1) 줄 근거 — 사실

| 주장 | 확인 | 근거 |
|---|---|---|
| `상태` 칸이 `secondaryLine` 없이 셀 안에서 메모를 그린다 | 사실 | `app/(app)/projects/[id]/quote-table.tsx:2318-2338` — `priority: "p1"`, `cell`이 `<span className={styles.statusLine}>{tag}<span className={styles.lineStatusNote}>{notes.join(" · ")}</span></span>` 반환. `secondaryLine` 없음 |
| `.statusLine` inline-flex + flex-wrap: wrap, `.lineStatusNote` flex-basis: 100% | 사실 | `app/(app)/projects/[id]/project-detail.module.css:9-14, 21-26` |
| 시트 `상태` 줄에 메모 없음 | 사실 | `quote-table.tsx:3271` `{ label: "상태", value: <StatusTag … lineStatusWord(openSheetRow)/> }` — 경과·초과 메모 없음 |
| 18-PLAN 대조 표에 견적 표는 `단가` P2만 | 사실 | `07.1-18-PLAN.md:136` — 상태 칸 줄 없음 |
| :172 「모든 데이터 행에서 주 행 각 셀 줄 수 ≤ 1」 단언 · 견적 표가 트레이서 대상 | 사실 | `:155` task name, `:172` behavior 첫 줄(견적 표 포함, E-P1-12) |
| :220-221 quote-table.tsx 변경 0 · projects 폴더 .css 변경 0 | 사실 | `:220` `git diff … quote-table.tsx`가 빈 출력, `:221` `app/(app)/projects/` 아래 `.css` diff 0 |

## (2) 공용 말줄임 규칙(:195 (나))이 이 칸을 한 줄로 만드는가 — **아니다**

- (나)가 칸에 주는 것은 `width: 0` · `min-width: max(100%, 5em)` · 글자 상자에 `overflow: hidden` · `text-overflow: ellipsis` · `white-space: nowrap`이다.
- `white-space: nowrap`은 인라인 서식 문맥의 줄바꿈만 막는다. `.statusLine`은 `display: inline-flex; flex-wrap: wrap`이고 `.lineStatusNote`는 `flex-basis: 100%`라 flex 줄바꿈으로 둘째 줄에 놓인다 — 이 줄바꿈은 `white-space`와 무관하다. 칸 폭이 어떻든(0 + min 100% / max-content 어느 쪽이든) 태그 옆에 「컨테이너 폭 100%」 항목이 들어갈 수 없으므로 메모는 항상 둘째 flex 줄이다.
- 따라서 :172 측정법(`Range.getClientRects()` 서로 다른 top 수)으로 이 칸은 메모가 있으면 2이고, (다)의 `.cellSecondary` 숨김도 닿지 않는다(그 클래스가 아니다).
- 계획이 허용한 수정 자리로는 고칠 수 없다: `Table.module.css`에서 다른 모듈의 해시 클래스 `.statusLine`을 고를 수 없고, `quote-table.tsx`(:220) · `project-detail.module.css`(:221)는 변경 금지다. :201 (아)의 「멈춤」 갈래는 「대조 표 밖의 `secondaryLine` P1 열」에만 열려 있어 이 칸(secondaryLine 아님)은 그 갈래에도 들지 않는다.
- 결과: (가) 실행자가 경과·초과 줄 픽스처를 넣으면 :172 단언 실패 + 허용된 수정 없음 → 실행 불가. (나) 넣지 않으면 시험은 통과하지만 W1 계약(폰 주 행 한 줄 · 행 2줄 — UI-SPEC :7-8)이 실제 데이터(선결제 기한 경과 · 실행가 초과 줄)에서 깨진 채 「견적 표가 공용 규칙의 증명(E-P1-12)」으로 기록된다 → 화면 규칙 위반.
- 참고: 이 판정은 CSS 의미론으로 한 것이고 DOM 실측은 하지 않았다(읽기 전용 지시). 다만 flex-basis: 100% + wrap의 줄바꿈은 폭과 무관하므로 실측 결과가 달라질 여지는 없다.

## (3) 견적 표 E2E 픽스처에 경과·초과 줄이 들어가는가 — **계획에 없다**

- `:172`는 `/pnl/reserves`(외화 금액 줄 픽스처) · `/cards/purchases`(외화 · 구매 완료 · 취소 줄 픽스처)에는 픽스처를 명시하지만 「프로젝트 상세 견적 표」에는 픽스처 지정이 없다.
- 기존 `mobile-*.spec.ts` 중 `prepaidOverdueDays` · `executionOverKrw` · 「일 경과」 · 「실행가 초과」를 심는 것은 0개(grep). 이 줄을 심는 시험은 데스크톱 전용 `test/e2e/quote-line-status.spec.ts:336-348, 376-396`뿐이라 `--project=mobile-375 --no-deps` 전체 실행(Task 1 ⑥ · Task 3 ⑤)도 이 칸을 재지 않는다.
- 따라서 그대로 실행하면 (2)의 「(나) 측정 누락 → 규칙 위반이 통과로 기록」 갈래가 기본이다.

## (4) UI-SPEC · SYSTEM.md에 이 칸 예외가 있는가 — **없다**

- `07.1-UI-SPEC.md` W1(:152-167): 주 행 P1 셀 한 줄 계약(:8) · `secondaryLine` 셀 포함(:15, :166). 견적 표 `상태` 칸 · `.statusLine` · 경과 메모 언급 0(grep). 「시트에 없는 아래 줄을 가진 표가 나오면 멈추고 SUMMARY」(:166)는 `secondaryLine` 셀 문맥이다.
- `docs/design/SYSTEM.md`: :448 PC 와이어프레임에 `증빙 14일 경과`가 상태 칸 2행으로 있고, :878 「P1 셀 안의 2행(외화·오류 이유)은 폰에서 숨긴다 — 같은 정보를 두 번 보이지 않는다」가 숨김 원칙이다(같은 정보가 접힌 줄·시트에 있어야 함). 폰에서 이 칸을 2줄로 두는 예외 문장 0(grep `statusLine` · `lineStatusNote` · `실행가 초과` → 0, `경과`는 :206 · :386 · :407 · :448 · :1368 · :1430 문구 예시뿐).
- 즉 예외는 없고, 오히려 SYSTEM :878 원칙상 메모를 폰 주 행에서 빼면 시트(:3271 — 메모 없음)에 같은 정보를 두어야 한다.

## 최소 수정 방향(한 줄)

대조 표(:136)에 견적 표 `상태` P1 줄을 더하고 option-a에서 메모를 `secondaryText`(접힌 줄 앞 글자)로 올리며 시트 `상태` 줄(:3271)에 같은 메모를 붙이도록 `quote-table.tsx` 변경을 :220 금지 목록에서 빼고(.css는 그대로 금지 — `.statusLine` 자체는 PC용이라 안 건드리고 폰에서는 `cell`이 태그만, 메모는 `secondaryLine`+`secondaryText`로 옮기면 (다) 숨김 · (라) 접힌 줄이 그대로 먹는다), `mobile-table-two-line.spec.ts` 견적 표 픽스처에 `quote-line-status.spec.ts:336-348`과 같은 기한 경과 · 실행가 초과 줄을 명시한다. 데스크톱 회귀 `quote-line-status.spec.ts:344-346, 393-395`(글자 · `--status-warning` · `--fw-regular`)는 `.cellSecondary`로 옮겨도 색 · 굵기를 `.lineStatusNote`로 유지하면 깨지지 않는다.

## Codex 「0건」에 대해

Codex는 이 칸을 언급하지 않았을 뿐 반대 근거를 내지 않았다. 위 (1)-(4)의 파일:줄 근거가 모두 사실이므로 Claude 검토자 B-R1의 지적이 선다.
