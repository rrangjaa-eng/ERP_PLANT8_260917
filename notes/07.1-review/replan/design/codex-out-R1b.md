**BLOCKING 1건.** HEAD `41a5fe2`에서 grep/sed로 확인했습니다. 파일 수정·E2E 실행은 하지 않았습니다.

계획의 실제 D-E7 대상은 **8개**입니다: `phoneRowLink` 6개 + 자체 행 링크 2개(계획 :58). 아래 검토는 요청하신 6개만 대상으로 했습니다.

| 표 | P1 셀·추가 내용 확인 | 정보·터치 판정 |
|---|---|---|
| 지급 완료 | 제목·이체액. `차이`는 `secondaryLine`(:148)이라 계획의 숨김·`secondaryText` 적용 가능 | 상세 `payment-section.tsx:494`에도 차이 존재. 폰 행 전체 링크 유지 |
| 발행 요청 | 희망일·프로젝트·금액. `합계`는 `secondaryLine`(:71). 프로젝트 내부 `.clip` 존재 | **합계의 폰 접근 경로 결함 — 아래 BLOCKING** |
| 지급 대상 | 제목·증빙·지급 총액. 제목의 직접 삽입 `titleSecondLine`(:1066)은 기존 `.wideSecondLine` 폰 숨김으로 처리됨 | `.evidenceCell`은 `flex-wrap`이지만 폰에서 내부 행동을 반환하지 않음(:986). 이체액은 P3라 변경 불필요 |
| 프로젝트 목록 | 이름·견적 금액·상태. 직접 삽입 `.statusSecondLine`(:185)은 기존 폰 CSS(:340)로 숨김 | 같은 내용이 기간 P2 `summary`(:167)에 있음. 강제 추가 줄 미발견 |
| 결재함 | 문서·수치·상태. 직접 삽입 `.overdraw`(:138)는 기존 폰 CSS(:106)로 숨김 | 시트 행은 접힌 줄에도 초과 정보 유지(:153). 주 대상 44px·자체 행 덮개 유지 |
| 휴가 목록 | 종류·기간·일수·상태. 별도 아래 줄 없음 | 상세에 종류·기간 존재. `.rowLink` 44px와 접힌 줄 자체 링크 유지 |

**BLOCKING — 발행 요청 `합계`가 폰 판독기에서 사라집니다.**

- 계획은 합계를 `secondaryText`로 옮기고, 판독기의 전체 정보는 상세 화면에 있다고 명시합니다([계획 :257](/home/user/ERP_PLANT8_260917/.planning/phases/07.1-carryover-followup/07.1-18-PLAN.md:257)).
- 목록 접힌 줄은 [Table.tsx:1168](/home/user/ERP_PLANT8_260917/ui/table/Table.tsx:1168)의 `aria-hidden`으로 읽히지 않습니다.
- 도착하는 상세의 합계도 [issue-request-table.tsx:225](/home/user/ERP_PLANT8_260917/app/(app)/projects/[id]/issue-request-table.tsx:225)의 `.pcSecondary` 안에 있고, [project-detail.module.css:308](/home/user/ERP_PLANT8_260917/app/(app)/projects/[id]/project-detail.module.css:308)에서 폰 `display:none`입니다. 상세 P2 요약에도 합계가 없습니다.
- 따라서 **07.1-15 SP-71-1의 ‘전체 글자는 상세 화면·접근 이름’ 계약을 충족하지 못합니다**(:162·167; frontend.md의 SYSTEM 준수 기준). 계획 :150의 대체 지시도 ‘그 표 RowSheet items 추가’인데 이 목록에는 RowSheet가 없어 실행할 수 없습니다.

수정은 이 합계의 **폰 상세·판독기 접근 경로를 계획에 명시**하는 것으로 한정하면 됩니다.

**NOTE — 검증·문서 보완**

- Task 2의 기존 E2E 파일은 모두 존재합니다. `mobile-table-two-line.spec.ts`는 계획이 새로 만드는 파일이므로 현재 부재는 결함이 아닙니다.
- 기존 fixture만으로는 부족합니다. 휴가는 반차 하루(:33), 프로젝트는 상태 둘째 줄(:63), 발행 요청은 오류 복귀·합계 데이터(:34–37)를 만듭니다. 지급 완료의 **비영 차이** fixture는 지정된 기존 스펙에서 확인되지 않았습니다. 새 스펙에 긴 P1·비영 차이·합계·상세 접근 단언을 실제로 생성해야 합니다.
- :275–278의 acceptance grep은 셸 문법상 실행 가능합니다. 다만 속성·문자열 개수만 확인하므로 한 줄·44px·행 덮개 충돌의 증거는 아닙니다.
- UI-SPEC W1(:158·161), SP-71-1(:566)은 아직 ‘행 시트 없는 표 제외’ 문구입니다. 계획 15 :167이 D-E7에 맞게 좁혀 옮기도록 지시하므로 실행 불능은 아니지만, 문서 간 불일치는 남습니다.

Recommendation: 발행 요청 합계의 폰 접근 경로와 RowSheet 없는 표의 대체 지시를 수정한 뒤 진행.

막는 문제: 1건
