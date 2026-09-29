// 04.3-08 — Next.js 기동 훅. 요청을 받기 전에 한 번, Node 런타임에서만 KMS로 감싼
// 데이터 키를 풀어 프로세스 전역 칸에 둔다(lib/crypto.ts loadDataKeys). 실패는 삼키지
// 않는다 — 서버가 기동을 마치지 못해 배포 스모크(scripts/deploy.sh smoke)가 잡는다.
// 감싼 변수가 없는 로컬 · 테스트는 아무것도 부르지 않는다.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadDataKeys } = await import("@/lib/crypto");
    await loadDataKeys();
  }
}
