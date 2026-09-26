import { env } from "@/lib/env";
import { createSmtpSender } from "@/lib/email/smtp-sender";

export { emailErrorCode } from "@/lib/email/smtp-sender";

// 이메일 포트(NOTI-02). send는 SMTP 오류로 던지지 않고 결과 셋 중 하나를 돌려준다
// (D-4216) — rejected는 확실히 가지 않음, indeterminate는 갔는지 알 수 없음(RFC 5321
// §4.5.3.2.6). 두 실패 모두 자동 재발송 대상이 아니다(D-4213).
export type EmailMessage = { to: string; subject: string; text: string };

export type SendOutcome =
  | { outcome: "sent" }
  | { outcome: "rejected"; code: string }
  | { outcome: "indeterminate"; code: string };

export type EmailSender = {
  send(message: EmailMessage, opts: { signal: AbortSignal }): Promise<SendOutcome>;
};

export type SmtpConfig = { host: string; user: string; password: string; from: string };

type SmtpSource = {
  SMTP_HOST?: string | undefined;
  SMTP_USER?: string | undefined;
  SMTP_PASSWORD?: string | undefined;
  SMTP_FROM?: string | undefined;
};

// D-711: 네 값이 모두 채워졌을 때만 이메일 채널이 켜진다.
export function smtpConfigFromEnv(source: SmtpSource = env): SmtpConfig | null {
  const { SMTP_HOST: host, SMTP_USER: user, SMTP_PASSWORD: password, SMTP_FROM: from } = source;
  if (!host || !user || !password || !from) return null;
  return { host, user, password, from };
}

// 연결 옵션 덮어쓰기(deps)는 넘기지 않는다 — 운영 연결은 늘 587 STARTTLS 필수다.
export function emailSenderFromEnv(source: SmtpSource = env): EmailSender | null {
  const config = smtpConfigFromEnv(source);
  return config === null ? null : createSmtpSender(config);
}
