// 04.3-08 — Next.js 기동 훅. Node 런타임에서만 KMS로 감싼 데이터 키를 풀어 프로세스 전역
// 칸에 둔다(lib/crypto.ts loadDataKeys). 프로덕션에서 Next 16은 첫 요청의 준비 단계에서
// 이 훅을 부르고 실패를 캐시한다(다시 부르지 않아 그 인스턴스는 계속 500) — 그래서 끝내
// 못 풀면 오류 이름만 남기고 프로세스를 끝내 Cloud Run이 인스턴스를 바꾸게 한다(검토 반영
// H1). 배포 스모크(scripts/deploy.sh smoke)의 첫 요청이 그 실패를 잡는다.
// 감싼 변수가 없는 로컬 · 테스트는 아무것도 부르지 않는다.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadDataKeys } = await import("@/lib/crypto");
    try {
      await loadDataKeys();
    } catch (error) {
      const { log } = await import("@/lib/log");
      log.error("instrumentation.data_key_load_failed", {
        name: error instanceof Error ? error.constructor.name : typeof error,
      });
      process.exit(1);
    }
  }
}
