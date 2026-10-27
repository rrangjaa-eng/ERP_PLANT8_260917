# 07.1 계획 디자인 검토 — F1~F5 수정 확인 (b6b9635)

판정: **통과 보류 — 막는 문제 2건(B1·B2), 둘 다 계획 몇 줄 수정이면 끝.**
Codex(GPT-6.1 Sol · medium · 읽기 전용) 원문: codex-out-F.md · 프롬프트: prompt-F.md · 대상 diff: f-fix.patch(2a334ea..b6b9635). Claude가 아래 근거를 직접 다시 확인함.

| 지적 | 판정 | 근거 |
|---|---|---|
| F1 Codex 건너뜀=통과 | 해결 | 01:484 등 화면 플랜 10개, UI-SPEC:627, VALIDATION:98 — 건너뜀이면 게이트 미통과·중단·CODEX_AUTH_JSON_B64 갱신 요청, 4폭 캡처·DOM 표는 별개로 남김 |
| F2 행 시트 없는 표 예외 | 해결 | 15:159·164, UI-SPEC:562·601 |
| F3 ±d/2 경계 | **미해결(B1)** | 아래 |
| F4 바뀐 상태 캡처 | 해결 | 02:256, 09:261, 14:247, 16:235. 새 스펙은 test/e2e/에 두고 기본 설정 `--project=desktop`으로 돌림 — desktop testIgnore(playwright.config.ts:122-124)에 걸리지 않음, 전용 설정(testMatch capture.spec.ts)과 충돌 없음 |
| F5 지출결의 보관 저장값 | **미해결(B2)** | 아래 |

실행 전 미확인 2건 확인 결과:
- `/admin/people?new=1`: 리다이렉트 없음, `newParam === "1" && canWrite`면 등록 패널(app/(app)/admin/people/page.tsx:24·87). 쓰기 권한 계정이면 됨.
- `/expenses/new`: 세션만 요구, 쓰기 권한 없으면 404(app/(app)/expenses/new/page.tsx:20-22). 기안자 계정은 `evidence-author-pick` 시드(scripts/codex-design-review/seeds.ts:732·743-745·774)로 닿음.

## 막는 문제
- **B1 (18:216, UI-SPEC:496)** 중심 간격 d<44 인 링크 둘 fixture에서 「각 링크 중심 ±(d/2−1)이 그 링크」와 「각 링크 연속 누름 구간 ≥ 44」를 함께 요구 — 물리적으로 불가. 위 링크가 받을 수 있는 최대 구간은 22 + d/2 < 44이고, 나중 DOM 링크의 ::after가 위 링크 +(d−22) 지점부터 덮어 d<42면 ±(d/2−1)도 깨짐. UI-SPEC:496은 같은 fixture에 「실제 누름 영역 44 미만 배치 없음」까지 걸어 fixture 자체가 항상 실패.
  고칠 방향: 둘을 나눈다 — (가) 겹침 fixture(d<44)는 「겹친 구간은 나중 DOM 링크가 받는다 · 경계점 한 번」만 단언, (나) 실제 화면(KvList·blockedLink·배너·시트 본문)은 이웃 링크 중심 간격 ≥ 44(또는 각 링크 연속 구간 ≥ 44)를 단언하고, 못 맞추면 간격·배치로 고친다.
- **B2 (14:201, UI-SPEC:521)** 「optionsOf가 더하는 옵션에 disabled: true 한 줄뿐」대로 하면 typecheck 실패: page.tsx:204의 `options`가 `{value,label,description}[]`로 추론돼 push 객체의 `disabled`가 TS2353(초과 속성). 고칠 방향: `const options: SelectOption[] = …` 타입 지정을 허용 범위에 넣는다(두 줄).

## 참고(막지 않음)
- UI-SPEC:525 부근 `Copywriting Contract` 제목이 빠져 문구 표가 W22 아래로 붙음 — 제목 복원.

## d0a29a0 재확인 — **최종 통과**
- B1 해결: 18:216·225, UI-SPEC:485·496 — 겹침 fixture는 겹친 구간·경계점을 나중 DOM 링크가 받는지만, 실제 화면은 이웃 링크 중심 간격(또는 연속 구간) ≥ 44, 못 띄우면 멈춤.
- B2 해결: 14:201·211 — `const options: SelectOption[]` 타입 지정 + `disabled: true`, 인수 기준에 `pnpm typecheck` 0. `SelectOption`은 page.tsx:24에 이미 import, `description?: string | null`(ui/select/Select.tsx:13).
- Copywriting Contract 제목 복원(UI-SPEC:527).
- Codex(GPT-6.1 Sol · medium) 원문 codex-out-B2.md: B1·B2 해결, 새 막음·참고 없음. Claude 직접 확인과 일치.
