# 07.1 재계획 디자인·Codex 재확인 — 1회차 (head 41a5fe2)

방식: /plan-design-review 스킬 호출 → Claude 독립 검토(Opus) + Codex 적대적 검토(GPT-6.1 Sol · medium · `codex exec --ephemeral -s read-only`, exit 0 두 번) → 갈린 막음은 Fable 판정. 계획 수정 없음. 캡처는 계획 검토라 생략(Fable B-R3 판정에 합성 HTML 320 재현만 — 실제 화면 DOM 아님).
범위: 재계획 화면 플랜 01·02·04·05·09·11·13·14·15·16·18·19 diff(b9acdd8..41a5fe2, screen-plans.patch) + 코디네이터 추가 요청 D-E7 행 링크 표(18 Task 2).

| 산출물 | 파일 |
|---|---|
| Codex 1차(바뀐 부분 전체) | codex-out-R1.md (프롬프트 prompt-R1.md, 로그 codex-err-R1.log) — 막음 0 |
| Codex 1b(행 링크 표) | codex-out-R1b.md (prompt-R1b.md) — 막음 1(B-R2) |
| Claude 1차 | claude-r1.md — 막음 1(B-R1) |
| Claude 1b | claude-r1b.md — 막음 1(B-R3) |
| Fable 판정 | fable-verdict-R1.md(B-R1 막음), fable-verdict-R1b.md(B-R2 참고 · B-R3 막음) |

## 막는 문제 2건
- **B-R1 (18:136·172·220-221)** 견적 표 `상태` 칸 메모(quote-table.tsx:2318-2338, `.lineStatusNote` flex-basis:100% project-detail.module.css:21-26)가 폰에서 늘 두 줄인데 대조 표에 없고 quote-table.tsx 변경 금지. 수정: 대조 표에 추가 → 메모를 secondaryLine+secondaryText, 시트 상태 줄에 붙임, quote-table.tsx를 :220 금지에서 뺌(.css 금지 유지), 폰 견적 픽스처에 경과·초과 줄.
- **B-R3 (18:195·255)** 「expenses.module.css:183-197 검증된 꼴」을 td에 옮김 — 원본은 td 안 block span(expenses.module.css:112-117·187-197, expenses-table.tsx:37). td에 걸면 320에서 넘침·5em 바닥 무효·발행 요청 격자 링크 칸 붕괴(합성 재현). /projects `.nameCell`은 감싸개로 옮겨도 「…」 없이 잘리고 projects-table.tsx·projects.module.css는 files_modified 밖·:221·:324 금지. 수정: 폭 규칙·세 속성을 Table.tsx 글자 칸 block 감싸개에(td 규칙 0), /projects는 projects-table.tsx(+.nameCell 폰 말줄임)를 범위·예외에 넣음.

## 참고
- B-R2 (18:257-258, Codex 막음 → Fable 참고): 발행 요청 `합계`는 상세 폰에서도 숨겨져(project-detail.module.css:306-311) 폰 판독기 경로 없음. :258 「전체 정보는 상세 화면」은 이 열에서 사실 아님 → 문장을 사실대로 고치거나 Table.tsx:1168 aria-hidden 조건을 secondaryText 있을 때 풀기. :150 대체 「RowSheet items」는 행 링크 표에 못 씀.
- 18:143 구매 요청 「실행가 초과」 경고색 빠짐(purchase-list.tsx:144) — DECISIONS 한 줄 권장.
- 19:49·199 /cards 접힌 줄 `등록` 320 잘림을 textContent로는 못 잡음 — Range 단언 권장.
- 18 행 링크 표 판정식 `scrollWidth > clientWidth`는 인라인 a·inline-flex·grid 링크에서 빈 단언 가능, 긴 글자·비영 `차이`·`합계` 픽스처 출처 없음, issue-requests.spec.ts:517 verify 누락.
- UI-SPEC :157-166·:342·:566·:605·:685·:697이 D-E7·D-E4·U-16 이전 문장 — 「D-E7이 대체」 한 줄 권장.
- 09 `후보 {N}` 검색 중 불변 · 04 `MM-DD → MM-DD` 해 넘김 · 14 `본부 없음` vs `배정 없음` · 02:170 `저장할 수 없음 —` 접두 반복.

## 지난 지적
F1~F5·B1·B2 회귀 없음(Codex·Claude 일치). 260907 대조: 결정 없이 어긋난 화면 동작 없음(Codex가 레거시 index.css:682·5685-5709 확인).

## 다음
재계획 수정본이 오면 2회차: B-R1·B-R3 해결 여부 + 바뀐 줄만. 승인 직전 Codex 전체 1회.
