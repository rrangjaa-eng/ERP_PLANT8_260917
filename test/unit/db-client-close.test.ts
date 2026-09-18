import { describe, expect, it, vi, beforeEach } from "vitest";

// 2026-09-18 스테이징 실행 plant8-staging-account-txfcr: account Job이 계정
// 생성·임시 비밀번호 출력까지 전부 성공(16:48:26)했는데도 프로세스가 끝나지
// 않아 task-timeout 900초를 다 쓰고 "The configured timeout was reached"로
// 실패 처리됐다. 원인은 db/client.ts의 createPool()이 Cloud SQL 커넥터
// 경로에서 `new Connector()`를 만들고 **아무도 닫지 않는** 것 — 커넥터가
// 인증서·토큰 갱신 타이머를 들고 있어 pool.end()만으로는 이벤트 루프가
// 비지 않는다. migrate-runner/db-bootstrap은 process.exit()를 명시적으로
// 불러서 이 문제가 가려져 있었다.
//
// 로컬(DATABASE_URL) 경로는 커넥터를 안 쓰므로 통합 테스트로는 재현되지
// 않는다 — 커넥터 모듈을 모킹해 closeDb()가 커넥터도 닫는지 단언한다.

const poolEnd = vi.fn<() => Promise<void>>(() => Promise.resolve());
const connectorClose = vi.fn();
const getOptions = vi.fn(() => Promise.resolve({ stream: () => undefined }));

vi.mock("pg", () => ({
  Pool: class {
    end = poolEnd;
  },
}));

vi.mock("@google-cloud/cloud-sql-connector", () => ({
  Connector: class {
    getOptions = getOptions;
    close = connectorClose;
  },
  AuthTypes: { IAM: "IAM" },
  IpAddressTypes: { PRIVATE: "PRIVATE" },
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn(() => ({})),
}));

vi.mock("@/lib/env", () => ({
  env: {
    CLOUD_SQL_CONNECTION_NAME: "proj:asia-northeast3:plant8-staging-db",
    DB_IAM_USER: "plant8-staging-runtime@proj.iam",
    DB_NAME: "plant8",
    DB_POOL_MAX: 5,
    DATABASE_URL: undefined,
  },
}));

describe("db/client closeDb — Cloud SQL 커넥터 경로", () => {
  beforeEach(() => {
    poolEnd.mockClear();
    connectorClose.mockClear();
    // db/client는 모듈 수준에 커넥터를 들고 있고 closeDb()가 그걸 null로
    // 되돌린다 — 모듈 캐시를 비워야 각 테스트가 새 커넥터로 시작한다.
    vi.resetModules();
  });

  it("closeDb()가 풀과 커넥터를 모두 닫는다(Cloud Run Job이 스스로 종료되도록)", async () => {
    const { closeDb } = await import("@/db/client");

    await closeDb();

    expect(poolEnd).toHaveBeenCalledOnce();
    // 이 단언이 없으면 커넥터의 갱신 타이머가 살아남아 Job이 task-timeout까지 매달린다.
    expect(connectorClose).toHaveBeenCalledOnce();
  });

  it("pool.end()가 거부해도 커넥터는 닫는다(누수 재발 방지)", async () => {
    const { closeDb } = await import("@/db/client");
    poolEnd.mockRejectedValueOnce(new Error("pool already ended"));

    await expect(closeDb()).rejects.toThrow("pool already ended");

    // finally가 아니면 여기서 0번 — 풀 종료 실패 한 번에 타이머가 살아남는다.
    expect(connectorClose).toHaveBeenCalledOnce();
  });
});
