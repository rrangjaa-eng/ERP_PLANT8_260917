# Phase 6 — API Coverage

No external API integration: GCS upload path is Phase 5's (A-608); Phase 6 uses only internal domain modules

탐지기가 잡은 신호는 06-02의 "Canvas API · Web Crypto(`crypto.subtle.digest`)" 문장 하나다. 둘 다 브라우저 내장 기능이고 외부 서비스·SDK가 아니다. GCS 서명 URL 발급과 업로드 경로는 Phase 5가 만든다(A-608). Phase 6는 그 경로를 부르기만 하고, 새 패키지를 더하지 않는다.
