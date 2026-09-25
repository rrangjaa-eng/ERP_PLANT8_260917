import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { composeDigest } from "@/domain/notify/digest";
import { emailSenderFromEnv, smtpConfigFromEnv, type SmtpConfig } from "@/lib/email/sender";
import { createSmtpSender, smtpConnectionOptions } from "@/lib/email/smtp-sender";

// 실제 SMTP에 연결하지 않는다 — 127.0.0.1 임의 포트의 가짜 서버(node:net)만 쓴다.
// 주소는 모두 @test.invalid, 비밀번호는 테스트 문자열이다.

type SmtpStep = "greeting" | "AUTH" | "MAIL" | "RCPT" | "DATA" | "END";
type FakeScript = Partial<Record<SmtpStep, string>>;

type FakeSmtp = {
  port: number;
  messages: string[];
  authUsers: string[];
  close(): Promise<void>;
};

const DEFAULT_REPLIES: Record<SmtpStep, string> = {
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

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
    socket.setEncoding("utf8");

    let buffer = "";
    let inData = false;
    let dataLines: string[] = [];
    let awaitingAuth = false;

    const reply = (text: string) => socket.write(`${text}\r\n`);

    const onLine = (line: string) => {
      if (inData) {
        if (line === ".") {
          inData = false;
          messages.push(dataLines.join("\r\n"));
          dataLines = [];
          reply(replies.END);
        } else {
          dataLines.push(line.startsWith("..") ? line.slice(1) : line);
        }
        return;
      }
      if (awaitingAuth) {
        awaitingAuth = false;
        authUsers.push(decodePlainAuth(line));
        reply(replies.AUTH);
        return;
      }
      const upper = line.toUpperCase();
      if (upper.startsWith("EHLO")) {
        reply("250-fake.test.invalid\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME");
      } else if (upper.startsWith("HELO")) {
        reply("250 fake.test.invalid");
      } else if (upper.startsWith("AUTH PLAIN ")) {
        authUsers.push(decodePlainAuth(line.slice("AUTH PLAIN ".length)));
        reply(replies.AUTH);
      } else if (upper.startsWith("AUTH PLAIN")) {
        awaitingAuth = true;
        reply("334 ");
      } else if (upper.startsWith("MAIL FROM")) {
        reply(replies.MAIL);
      } else if (upper.startsWith("RCPT TO")) {
        reply(replies.RCPT);
      } else if (upper === "DATA") {
        inData = true;
        reply(replies.DATA);
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

    reply(replies.greeting);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("fake smtp: no port");

  return {
    port: address.port,
    messages,
    authUsers,
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
