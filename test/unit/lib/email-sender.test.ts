import net from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { composeDigest } from "@/domain/notify/digest";
import { emailErrorCode, emailSenderFromEnv, smtpConfigFromEnv, type SmtpConfig } from "@/lib/email/sender";
import { log } from "@/lib/log";
import { createSmtpSender, smtpConnectionOptions } from "@/lib/email/smtp-sender";

// 실제 SMTP에 연결하지 않는다 — 127.0.0.1 임의 포트의 가짜 서버(node:net)만 쓴다.
// 주소는 모두 @test.invalid, 비밀번호는 테스트 문자열이다.

type SmtpStep = "greeting" | "AUTH" | "MAIL" | "RCPT" | "DATA" | "END";
// 응답 대본: 문자열은 그 줄을 보낸다 · destroy는 응답 없이 소켓을 부순다 ·
// trickle은 줄바꿈 없이 50ms마다 한 바이트씩 끝없이 흘린다(유휴 한도에 걸리지 않음).
type Reply = string | { destroy: true } | { trickle: string };
type FakeScript = Partial<Record<SmtpStep, Reply>>;

type FakeSmtp = {
  port: number;
  messages: string[];
  authUsers: string[];
  readonly connections: number;
  openSockets(): number;
  close(): Promise<void>;
};

const DEFAULT_REPLIES: Record<SmtpStep, Reply> = {
  greeting: "220 fake.test.invalid ESMTP",
  AUTH: "235 2.7.0 Authentication successful",
  MAIL: "250 2.1.0 OK",
  RCPT: "250 2.1.5 OK",
  DATA: "354 Go ahead",
  END: "250 2.0.0 OK queued",
};

function decodePlainAuth(encoded: string): string {
  // AUTH PLAIN 값은 base64("\0user\0pass") — 사용자만 기록한다.
  const [, user = ""] = Buffer.from(encoded, "base64").toString("utf8").split("\0");
  return user;
}

async function startFakeSmtp(script: FakeScript = {}): Promise<FakeSmtp> {
  const replies = { ...DEFAULT_REPLIES, ...script };
  const messages: string[] = [];
  const authUsers: string[] = [];
  const sockets = new Set<net.Socket>();
  let connections = 0;

  const server = net.createServer((socket) => {
    connections += 1;
    sockets.add(socket);
    let trickleTimer: NodeJS.Timeout | undefined;
    socket.on("close", () => {
      clearInterval(trickleTimer);
      sockets.delete(socket);
    });
    socket.on("error", () => undefined);
    socket.setEncoding("utf8");

    let buffer = "";
    let inData = false;
    let dataLines: string[] = [];
    let awaitingAuth = false;

    const reply = (text: string) => socket.write(`${text}\r\n`);
    const respond = (step: SmtpStep) => {
      const planned = replies[step];
      if (typeof planned === "string") {
        reply(planned);
      } else if ("destroy" in planned) {
        socket.destroy();
      } else {
        let index = 0;
        trickleTimer = setInterval(() => {
          if (!socket.writable) return;
          socket.write(planned.trickle.charAt(index % planned.trickle.length));
          index += 1;
        }, 50);
      }
    };

    const onLine = (line: string) => {
      if (inData) {
        if (line === ".") {
          inData = false;
          messages.push(dataLines.join("\r\n"));
          dataLines = [];
          respond("END");
        } else {
          dataLines.push(line.startsWith("..") ? line.slice(1) : line);
        }
        return;
      }
      if (awaitingAuth) {
        awaitingAuth = false;
        authUsers.push(decodePlainAuth(line));
        respond("AUTH");
        return;
      }
      const upper = line.toUpperCase();
      if (upper.startsWith("EHLO")) {
        reply("250-fake.test.invalid\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME");
      } else if (upper.startsWith("HELO")) {
        reply("250 fake.test.invalid");
      } else if (upper.startsWith("AUTH PLAIN ")) {
        authUsers.push(decodePlainAuth(line.slice("AUTH PLAIN ".length)));
        respond("AUTH");
      } else if (upper.startsWith("AUTH PLAIN")) {
        awaitingAuth = true;
        reply("334 ");
      } else if (upper.startsWith("MAIL FROM")) {
        respond("MAIL");
      } else if (upper.startsWith("RCPT TO")) {
        respond("RCPT");
      } else if (upper === "DATA") {
        inData = true;
        respond("DATA");
      } else if (upper === "QUIT") {
        reply("221 2.0.0 Bye");
        socket.end();
      } else {
        reply("250 OK");
      }
    };

    socket.on("data", (chunk: string) => {
      buffer += chunk;
      let index = buffer.indexOf("\r\n");
      while (index !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        onLine(line);
        index = buffer.indexOf("\r\n");
      }
    });

    respond("greeting");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("fake smtp: no port");

  return {
    port: address.port,
    messages,
    authUsers,
    get connections() {
      return connections;
    },
    openSockets: () => sockets.size,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

// 원문에서 제목·본문을 꺼내는 최소 해석기(MailComposer가 고른 인코딩을 푼다).
function decodeEncodedWords(value: string): string {
  return value.replace(/=\?UTF-8\?([BQ])\?([^?]*)\?=\s*/gi, (_, kind: string, data: string) =>
    kind.toUpperCase() === "B"
      ? Buffer.from(data, "base64").toString("utf8")
      : Buffer.from(
          data.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (__, hex: string) =>
            String.fromCharCode(Number.parseInt(hex, 16)),
          ),
          "latin1",
        ).toString("utf8"),
  );
}

function parseRawMessage(raw: string): { headers: string; subject: string; body: string } {
  const split = raw.indexOf("\r\n\r\n");
  const headers = raw.slice(0, split);
  const encodedBody = raw.slice(split + 4);
  const unfolded = headers.replace(/\r\n[ \t]+/g, " ");
  const subjectLine = unfolded.split("\r\n").find((line) => line.startsWith("Subject: ")) ?? "";
  const encoding = /Content-Transfer-Encoding: (\S+)/i.exec(unfolded)?.[1]?.toLowerCase();
  const body =
    encoding === "base64"
      ? Buffer.from(encodedBody.replace(/\s/g, ""), "base64").toString("utf8")
      : encoding === "quoted-printable"
        ? Buffer.from(
            encodedBody
              .replace(/=\r\n/g, "")
              .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16))),
            "latin1",
          ).toString("utf8")
        : encodedBody;
  return { headers: unfolded, subject: decodeEncodedWords(subjectLine.slice("Subject: ".length)), body };
}

const config: SmtpConfig = {
  host: "smtp.test.invalid",
  user: "sender@test.invalid",
  password: "secret-password",
  from: "noreply@test.invalid",
};

const fullSource = {
  SMTP_HOST: "smtp.test.invalid",
  SMTP_USER: "sender@test.invalid",
  SMTP_PASSWORD: "secret-password",
  SMTP_FROM: "noreply@test.invalid",
};

let fake: FakeSmtp | null = null;

afterEach(async () => {
  await fake?.close();
  fake = null;
});

describe("smtpConfigFromEnv / emailSenderFromEnv", () => {
  it("네 값이 모두 있으면 설정을 돌려준다", () => {
    expect(smtpConfigFromEnv(fullSource)).toEqual({
      host: "smtp.test.invalid",
      user: "sender@test.invalid",
      password: "secret-password",
      from: "noreply@test.invalid",
    });
    expect(emailSenderFromEnv(fullSource)).not.toBeNull();
  });

  for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"] as const) {
    it(`${key}가 빈 문자열이거나 없으면 설정·발송기가 null이다`, () => {
      const empty = { ...fullSource, [key]: "" };
      const missing = { ...fullSource, [key]: undefined };

      expect(smtpConfigFromEnv(empty)).toBeNull();
      expect(smtpConfigFromEnv(missing)).toBeNull();
      expect(emailSenderFromEnv(empty)).toBeNull();
      expect(emailSenderFromEnv(missing)).toBeNull();
    });
  }
});

describe("smtpConnectionOptions", () => {
  it("587 STARTTLS 필수와 세 시간 제한을 담는다", () => {
    expect(smtpConnectionOptions(config)).toEqual({
      host: "smtp.test.invalid",
      port: 587,
      secure: false,
      requireTLS: true,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  });
});

describe("createSmtpSender — 트레이서", () => {
  it("묶음 메일 한 통이 가짜 SMTP 서버까지 가고 결과는 sent다", async () => {
    fake = await startFakeSmtp();
    const sender = createSmtpSender(config, {
      connectionOptions: { host: "127.0.0.1", port: fake.port, requireTLS: false, ignoreTLS: true },
    });
    const digest = composeDigest({
      kstDate: "2026-10-07",
      messages: ["가", "나", "다"],
      serviceUrl: "https://erp.test.invalid",
    });

    const result = await sender.send(
      { to: "member@test.invalid", ...digest },
      { signal: AbortSignal.timeout(5000) },
    );

    expect(result).toEqual({ outcome: "sent" });
    expect(fake.authUsers).toEqual(["sender@test.invalid"]);
    expect(fake.messages).toHaveLength(1);
    const raw = fake.messages[0] ?? "";
    const parsed = parseRawMessage(raw);
    expect(parsed.subject).toBe("PLANT8 알림 3건");
    expect(parsed.headers).toMatch(/Content-Type: text\/plain/i);
    expect(raw).not.toMatch(/text\/html/i);
    expect(parsed.body.split(/\r?\n/)).toContain("- 가");
  });
});

async function unusedPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (address === null || typeof address === "string") throw new Error("no port");
  return address.port;
}

function senderFor(port: number) {
  return createSmtpSender(config, {
    connectionOptions: { host: "127.0.0.1", port, requireTLS: false, ignoreTLS: true },
  });
}

const digestMessage = {
  to: "member@test.invalid",
  ...composeDigest({ kstDate: "2026-10-07", messages: ["가", "나", "다"], serviceUrl: "https://erp.test.invalid" }),
};

describe("createSmtpSender — 결과 분류", () => {
  it("아무도 듣지 않는 포트면 rejected·ECONNECTION이다", async () => {
    const port = await unusedPort();

    const result = await senderFor(port).send(digestMessage, { signal: AbortSignal.timeout(5000) });

    expect(result).toEqual({ outcome: "rejected", code: "ECONNECTION" });
  });

  it("AUTH에 535면 rejected·EAUTH다", async () => {
    fake = await startFakeSmtp({ AUTH: "535 5.7.8 bad user@test.invalid" });

    const result = await senderFor(fake.port).send(digestMessage, { signal: AbortSignal.timeout(5000) });

    expect(result).toEqual({ outcome: "rejected", code: "EAUTH" });
  });

  it("RCPT에 550이면 rejected·EENVELOPE다", async () => {
    fake = await startFakeSmtp({ RCPT: "550 5.1.1 no such user" });

    const result = await senderFor(fake.port).send(digestMessage, { signal: AbortSignal.timeout(5000) });

    expect(result).toEqual({ outcome: "rejected", code: "EENVELOPE" });
  });

  it("점 줄에 554면 rejected·EMESSAGE다", async () => {
    fake = await startFakeSmtp({ END: "554 5.7.1 rejected" });

    const result = await senderFor(fake.port).send(digestMessage, { signal: AbortSignal.timeout(5000) });

    expect(result).toEqual({ outcome: "rejected", code: "EMESSAGE" });
  });

  it("서버가 원문을 다 받은 뒤 확답 없이 끊으면 indeterminate·ECONNECTION이다", async () => {
    fake = await startFakeSmtp({ END: { destroy: true } });

    const result = await senderFor(fake.port).send(digestMessage, { signal: AbortSignal.timeout(5000) });

    expect(result).toEqual({ outcome: "indeterminate", code: "ECONNECTION" });
    expect(fake.messages).toHaveLength(1);
    expect(parseRawMessage(fake.messages[0] ?? "").body.split(/\r?\n/)).toContain("- 다");
  });
});

describe("createSmtpSender — 벽시계 마감", () => {
  it("점 줄 뒤 응답을 흘리는 서버면 마감에 indeterminate·DEADLINE으로 끝나고 연결을 닫는다", async () => {
    fake = await startFakeSmtp({ END: { trickle: "250 2.0.0 OK queued" } });
    const started = performance.now();

    const result = await senderFor(fake.port).send(digestMessage, { signal: AbortSignal.timeout(300) });

    expect(result).toEqual({ outcome: "indeterminate", code: "DEADLINE" });
    expect(performance.now() - started).toBeLessThan(800);
    expect(fake.messages).toHaveLength(1);
    const server = fake;
    await vi.waitFor(() => expect(server.openSockets()).toBe(0));
  });

  it("인사 줄을 흘리는 서버면 마감에 rejected·DEADLINE으로 끝난다", async () => {
    fake = await startFakeSmtp({ greeting: { trickle: "220 fake.test.invalid ESMTP" } });
    const started = performance.now();

    const result = await senderFor(fake.port).send(digestMessage, { signal: AbortSignal.timeout(300) });

    expect(result).toEqual({ outcome: "rejected", code: "DEADLINE" });
    expect(performance.now() - started).toBeLessThan(800);
    const server = fake;
    await vi.waitFor(() => expect(server.openSockets()).toBe(0));
  });

  it("이미 중단된 신호면 연결하지 않고 rejected·DEADLINE이다", async () => {
    fake = await startFakeSmtp();

    const result = await senderFor(fake.port).send(digestMessage, { signal: AbortSignal.abort() });

    expect(result).toEqual({ outcome: "rejected", code: "DEADLINE" });
    expect(fake.connections).toBe(0);
  });

  it("마감 뒤 늦게 온 콜백·error 이벤트가 결과를 바꾸지 않고 처리되지 않은 거부를 남기지 않는다", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      fake = await startFakeSmtp({ END: { trickle: "250 2.0.0 OK queued" } });
      const pending = senderFor(fake.port).send(digestMessage, { signal: AbortSignal.timeout(300) });

      const first = await pending;
      const server = fake;
      await vi.waitFor(() => expect(server.openSockets()).toBe(0));
      await new Promise((resolve) => setImmediate(resolve));

      expect(first).toEqual({ outcome: "indeterminate", code: "DEADLINE" });
      expect(await pending).toEqual(first);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});

describe("emailErrorCode", () => {
  it("허용 목록 안의 code만 그대로, 나머지는 UNKNOWN이다", () => {
    expect(emailErrorCode({ code: "EAUTH" })).toBe("EAUTH");
    expect(emailErrorCode({ code: "DEADLINE" })).toBe("DEADLINE");
    expect(emailErrorCode({ code: "535 5.7.8 user@x" })).toBe("UNKNOWN");
    expect(emailErrorCode(new Error("x"))).toBe("UNKNOWN");
    expect(emailErrorCode(null)).toBe("UNKNOWN");
  });
});

describe("createSmtpSender — 비노출", () => {
  it("주소·사용자·비밀번호가 담긴 거부 응답도 결과에 나오지 않고 어댑터는 로그를 남기지 않는다", async () => {
    const logSpies = (Object.keys(log) as (keyof typeof log)[]).map((method) =>
      vi.spyOn(log, method).mockImplementation(() => undefined),
    );
    try {
      const scripts: FakeScript[] = [
        { AUTH: "535 5.7.8 sender@test.invalid secret-password" },
        { RCPT: "550 5.1.1 member@test.invalid unknown" },
        { END: "554 5.7.1 secret-password sender@test.invalid member@test.invalid" },
      ];
      for (const script of scripts) {
        await fake?.close();
        fake = await startFakeSmtp(script);

        const result = await senderFor(fake.port).send(digestMessage, { signal: AbortSignal.timeout(5000) });
        const serialized = JSON.stringify(result);

        expect(result.outcome).toBe("rejected");
        for (const secret of ["member@test.invalid", "sender@test.invalid", "secret-password"]) {
          expect(serialized).not.toContain(secret);
        }
      }
      for (const spy of logSpies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of logSpies) spy.mockRestore();
    }
  });
});
