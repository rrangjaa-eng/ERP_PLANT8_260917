import { describe, expect, it } from "vitest";
import { buildBootstrapSql } from "@/scripts/db-bootstrap";

describe("buildBootstrapSql", () => {
  it("첫 그룹은 database=postgres이고 GRANT ... TO CURRENT_USER, OWNER를 포함한다", () => {
    const groups = buildBootstrapSql({ dbName: "erp", iamUser: "erp-staging-runtime@proj.iam" });
    const firstGroup = groups[0];
    expect(firstGroup).toBeDefined();
    expect(firstGroup?.database).toBe("postgres");
    const joined = firstGroup?.statements.join("\n") ?? "";
    expect(joined).toContain('GRANT "erp-staging-runtime@proj.iam" TO CURRENT_USER');
    expect(joined).toContain("OWNER");
  });

  it("둘째 그룹은 database=dbName이고 ALTER SCHEMA public OWNER TO를 포함한다", () => {
    const groups = buildBootstrapSql({ dbName: "erp", iamUser: "erp-staging-runtime@proj.iam" });
    const secondGroup = groups[1];
    expect(secondGroup).toBeDefined();
    expect(secondGroup?.database).toBe("erp");
    const joined = secondGroup?.statements.join("\n") ?? "";
    expect(joined).toContain('ALTER SCHEMA public OWNER TO "erp-staging-runtime@proj.iam"');
  });

  it("iamUser에 큰따옴표가 들어오면 이스케이프된다", () => {
    const groups = buildBootstrapSql({ dbName: "erp", iamUser: 'a"b' });
    const joined = groups.flatMap((g) => g.statements).join("\n");
    expect(joined).toContain('"a""b"');
  });
});
