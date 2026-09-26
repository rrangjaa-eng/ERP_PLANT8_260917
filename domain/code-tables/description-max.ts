// 04-10(D-93): 코드표 설명 40자 상한. 이 파일에 다른 import를 두지 않는다 —
// domain/code-tables/index.ts는 repositories(→ db/client.ts → pg)를 거쳐가는
// 무거운 서버 전용 의존 체인을 갖고 있어, 클라이언트 컴포넌트
// (code-item-form.tsx의 CodeItemDescriptionInput 글자 수 표시)가 그 파일에서
// 상수 하나만 import해도 클라이언트 번들에 pg가 딸려 들어간다
// (domain/action-log/filter-keys.ts와 같은 이유로 분리한 잎(leaf) 모듈).
export const CODE_ITEM_DESCRIPTION_MAX = 40;
