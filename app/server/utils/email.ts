// Resend wrapper. The ONLY place that instantiates the Resend client.
// Handlers call sendEmail(); they never import `resend` directly.
import { Resend } from 'resend';
import { env } from './env';

let client: Resend | null = null;

function getClient(): Resend {
  if (!client) client = new Resend(env.RESEND_API_KEY);
  return client;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export type SendEmailResult = { id: string } | { error: string };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const { data, error } = await getClient().emails.send({
    from: env.EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo,
  });
  if (error) {
    // Log the cause only — never the recipient, never the body.
    console.warn('resend_send_failed', { name: error.name });
    return { error: error.name };
  }
  return { id: data?.id ?? '' };
}
