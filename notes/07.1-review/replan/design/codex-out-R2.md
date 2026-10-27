048abcb 기준 읽기 전용 검토입니다. 변경 줄과 원본을 대조했으며, DOM·E2E는 실행하지 않았습니다.

| 항목 | 판정 | 근거 |
|---|---|---|
| B-R1 | **RESOLVED** | [18-PLAN:214](/home/user/wt-r2/.planning/phases/07.1-carryover-followup/07.1-18-PLAN.md:214)에 메모의 `secondaryLine`·`secondaryText` 이동과 시트 상태 줄 추가가 명시됨. 폰 픽스처·데스크톱 회귀(:189–190), 수정 허용(:236–238)도 반영됨. |
| B-R3 | **RESOLVED** | [18-PLAN:209](/home/user/wt-r2/.planning/phases/07.1-carryover-followup/07.1-18-PLAN.md:209)가 감싸개 추가와 감싸개에만 폭·말줄임 적용을 명시함. `/projects` CSS 수정(:279)과 금지 목록 예외(:238·349)도 일치함. |
| B-R2 | **RESOLVED** | [18-PLAN:277](/home/user/wt-r2/.planning/phases/07.1-carryover-followup/07.1-18-PLAN.md:277)이 `onRowTap`과 해당 행의 `secondaryText`가 모두 없을 때만 `aria-hidden`을 유지하도록 지시함. 판독기 검증(:266)도 추가됨. |

소스 확인 결과:

- 현재 [Table.tsx:818](/home/user/wt-r2/ui/table/Table.tsx:818)은 아래 줄이 없으면 `primary`를 바로 반환합니다. **항상 존재하는 감싸개는 현재 구현이 아니라 계획이 추가하는 것**입니다. 숫자·`headerHidden` 열은 제외합니다.
- [projects-table.tsx:141](/home/user/wt-r2/app/(app)/projects/projects-table.tsx:141)의 `.nameCell`은 [CSS:301](/home/user/wt-r2/app/(app)/projects/projects.module.css:301)에서 block이고, 내부 Link의 `.link`(:134)는 display를 바꾸지 않습니다. CSS 세 속성으로 처리한다는 주장은 타당합니다.
- `quote-table.tsx`와 `projects.module.css`는 변경 허용 목록에 있습니다. 실행용 금지 목록에서도 후자는 명시적으로 제외됩니다.

**NOTE**

- [18-PLAN:209](/home/user/wt-r2/.planning/phases/07.1-carryover-followup/07.1-18-PLAN.md:209)의 `:not(:has(button))`은 실제 `<button>`만 제외합니다. 버튼 모양 `<Link>`는 `<a>`이므로 **제외하지 않고 포함**합니다([Button.tsx:44](/home/user/wt-r2/ui/button/Button.tsx:44)). 확인한 견적 행동 열은 `headerHidden`, 지급 표의 증빙 행동은 폰에서 반환하지 않아 확정된 위반은 없습니다. 계획의 DOM 확인은 유지해야 합니다.
- [18-PLAN:214](/home/user/wt-r2/.planning/phases/07.1-carryover-followup/07.1-18-PLAN.md:214)·:464의 “projects 폴더 `.css` 변경 0 그대로”는 낡은 표현입니다. 실제 게이트(:238)는 예외를 허용하므로 실행을 막지는 않습니다.
- 새 [검증 문장 :184](/home/user/wt-r2/.planning/phases/07.1-carryover-followup/07.1-18-PLAN.md:184)의 “td computed width가 main과 같음”은 모호합니다. 넘침 수정으로 실측 폭은 달라질 수 있으므로, td에 폭 규칙을 추가하지 않았다는 검사와 구분하는 편이 정확합니다.

01 픽스처 정정, 14 예정 발령 시 본부 칸 숨김, DECISIONS·UI-SPEC 우선순위 변경에서도 새 **BLOCKING** 근거는 찾지 못했습니다. 최소 문구·주 버튼 하나·44px·토큰·화면별 예외 금지의 새 확정 위반도 없습니다.

Recommendation: 진행 가능. NOTE 문구를 정리하고 실행 시 DOM 검증으로 확인.

막는 문제: 0건
