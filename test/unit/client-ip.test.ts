import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { clientIp, CLIENT_IP_HEADER } from "@/lib/client-ip";
import { proxy } from "@/proxy";

describe("lib/client-ip", () => {
  it("여러 항목이면 마지막 항목을 반환한다(클라이언트가 끼워 넣은 첫 항목은 무시)", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 198.51.100.9" });
    expect(clientIp(headers)).toBe("198.51.100.9");
  });

  it("항목이 하나면 그대로 반환한다", () => {
    const headers = new Headers({ "x-forwarded-for": "198.51.100.9" });
    expect(clientIp(headers)).toBe("198.51.100.9");
  });

  it("공백·빈 항목을 걸러내고 마지막 비어있지 않은 항목을 반환한다", () => {
    const headers = new Headers({ "x-forwarded-for": "1.1.1.1, , 2.2.2.2 " });
    expect(clientIp(headers)).toBe("2.2.2.2");
  });

  it("헤더가 없으면 null을 반환한다", () => {
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe("proxy.ts", () => {
  it("x-forwarded-for 마지막 항목을 x-client-ip로 설정하고 클라이언트가 보낸 x-client-ip는 무시한다", () => {
    const request = new NextRequest("http://127.0.0.1:3000/api/auth/sign-in/email", {
      headers: {
        "x-forwarded-for": "203.0.113.7, 198.51.100.9",
        [CLIENT_IP_HEADER]: "9.9.9.9",
      },
    });

    const response = proxy(request);

    expect(response.headers.get("x-middleware-request-" + CLIENT_IP_HEADER)).toBe("198.51.100.9");
  });

  it("x-forwarded-for가 없으면 x-client-ip를 127.0.0.1로 설정한다(로컬 개발: 프록시 없음)", () => {
    const request = new NextRequest("http://127.0.0.1:3000/api/auth/sign-in/email");

    const response = proxy(request);

    expect(response.headers.get("x-middleware-request-" + CLIENT_IP_HEADER)).toBe("127.0.0.1");
  });
});
