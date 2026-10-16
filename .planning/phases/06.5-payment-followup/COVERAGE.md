# Phase 06.5 — API Coverage

No external API integration: 06.5 uses only internal domain modules and the SheetJS library (local xlsx write, no network call)

탐지기가 잡은 신호는 06.5-03 · 06.5-06 · 06.5-09 플랜의 「`SidePanel` API」 · 「`Table` 선택 API」 · 「고정 대기 API 이름」 같은 문장이다. 모두 이 저장소 안 컴포넌트 prop이나 테스트 함수 이름이고 외부 서비스 · SDK가 아니다. 신한 대량이체 파일(06.5-06)은 서버가 SheetJS로 xlsx를 만들어 내려주는 파일 형식이고, 은행 API를 부르지 않는다(업로드는 사람이 은행 사이트에서 한다). 직원 계좌 암호화는 Phase 4의 `lib/crypto` 경로를 부르기만 한다.
