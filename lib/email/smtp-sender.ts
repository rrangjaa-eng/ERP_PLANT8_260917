import MailComposer from "nodemailer/lib/mail-composer";
import SMTPConnection, { type SMTPConnectionOptions } from "nodemailer/lib/smtp-connection";
import type { EmailSender, SendOutcome, SmtpConfig } from "@/lib/email/sender";

// nodemailer 저수준 SMTPConnection 어댑터. 고수준 transport는 어느 단계에서 끊겼는지
// 돌려주지 않아 쓰지 않는다(D-4216). 호출마다 짧은 연결 하나 — 풀·재연결 없음.

// 587 STARTTLS 필수. 세 시간 제한은 유휴 한도일 뿐 — 한 통의 상한은 호출자의 signal이다.
export function smtpConnectionOptions(config: SmtpConfig): SMTPConnectionOptions {
  return {
    host: config.host,
    port: 587,
    secure: false,
    requireTLS: true,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  };
}

// 결과 code는 이 목록 안의 값만 — 예외 메시지·서버 응답(주소·호스트·사용자를 담을 수
// 있다)은 결과 밖으로 나가지 않는다. 어댑터는 로그를 남기지 않는다(Codex #5).
const EMAIL_ERROR_CODES = new Set([
  "EAUTH",
  "ECONNECTION",
  "ETIMEDOUT",
  "ESOCKET",
  "EENVELOPE",
  "EMESSAGE",
  "ETLS",
  "EDNS",
  "DEADLINE",
]);

function field(err: unknown, key: "code" | "command" | "responseCode"): unknown {
  return typeof err === "object" && err !== null && key in err ? (err as Record<string, unknown>)[key] : undefined;
}

export function emailErrorCode(err: unknown): string {
  const code = field(err, "code");
  return typeof code === "string" && EMAIL_ERROR_CODES.has(code) ? code : "UNKNOWN";
}

type Stage = "connect" | "login" | "send";

// D-4216: 연결·로그인 단계 오류는 늘 rejected. 발송 단계는 서버 응답 코드가 있거나
// 로컬 검사 오류(command "API")면 rejected, 둘 다 없으면 서버가 받았을 수 있어 indeterminate.
function classify(stage: Stage, err: unknown): SendOutcome {
  const code = emailErrorCode(err);
  if (stage !== "send") return { outcome: "rejected", code };
  if (typeof field(err, "responseCode") === "number" || field(err, "command") === "API") {
    return { outcome: "rejected", code };
  }
  return { outcome: "indeterminate", code };
}

// 재시도·재연결은 없다(D-4213) — 두 실패 결과 모두 자동 재발송 대상이 아니다.
export function createSmtpSender(
  config: SmtpConfig,
  deps: { connectionOptions?: Partial<SMTPConnectionOptions> } = {},
): EmailSender {
  return {
    send(message, { signal }) {
      if (signal.aborted) return Promise.resolve({ outcome: "rejected", code: "DEADLINE" });
      return new Promise<SendOutcome>((resolve) => {
        const connection = new SMTPConnection({ ...smtpConnectionOptions(config), ...deps.connectionOptions });
        let stage: Stage = "connect";

        // 결과는 한 번만 정한다 — 콜백·error·end·마감 중 먼저 온 것. 늦게 온 것은 버린다.
        let settled = false;
        const settle = (outcome: SendOutcome) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", onAbort);
          resolve(outcome);
        };
        const fail = (err: unknown) => {
          settle(classify(stage, err));
          connection.close();
        };
        // 벽시계 마감(Codex 2차 #6): socketTimeout은 유휴 한도라 조금씩 오는 응답을 끊지
        // 못한다. 콜백을 기다리지 않고 닫고 끝낸다.
        function onAbort() {
          settle(
            stage === "send" ? { outcome: "indeterminate", code: "DEADLINE" } : { outcome: "rejected", code: "DEADLINE" },
          );
          connection.close();
        }
        signal.addEventListener("abort", onAbort, { once: true });

        // 소켓이 끊기면 nodemailer는 send 콜백 대신 error 이벤트만 낼 수 있다.
        connection.on("error", fail);
        connection.on("end", () => fail({ code: "ECONNECTION" }));

        connection.connect((connectError) => {
          if (connectError) return fail(connectError);
          stage = "login";
          connection.login({ user: config.user, pass: config.password }, (loginError) => {
            if (loginError) return fail(loginError);
            const composer = new MailComposer({
              from: config.from,
              to: message.to,
              subject: message.subject,
              text: message.text,
            });
            composer
              .compile()
              .build()
              .then((raw) => {
                stage = "send";
                connection.send({ from: config.from, to: [message.to] }, raw, (sendError) => {
                  if (sendError) return fail(sendError);
                  settle({ outcome: "sent" });
                  connection.quit();
                });
              }, fail);
          });
        });
      });
    },
  };
}
