// Payment-confirmed email — triggered by app/server/api/webhooks/stripe.post.ts
// after Stripe confirms payment_intent.succeeded for a job.
//
// Copy is the source-of-truth approved by Dani 2026-04-20 — see docs/emails-copy.md.
// Inline rendering follows the same pattern as auth/magic-link.post.ts:renderEmail().
//
// Failure to send is non-fatal — the caller logs and continues. The payment is
// already captured and the convert job already enqueued; missing this email
// degrades UX but does not block the user.
import { env } from '../utils/env';
import { sendEmail } from '../utils/email';

function render(jobId: string): { subject: string; html: string; text: string } {
  const idShort = jobId.slice(0, 8);
  const statusUrl = `${env.APP_URL}/job/${jobId}/status`;
  const subject = `Plata pentru migrarea #${idShort} — confirmată`;

  const text = [
    'Bună,',
    '',
    `Am primit plata pentru migrarea #${idShort}. Începem conversia — durează 3–15 minute.`,
    '',
    'Vă trimitem fișierele de import SAGA imediat ce sunt gata.',
    '',
    `Detalii: ${statusUrl}`,
    '',
    'Factura va fi emisă de Gamerina SRL și va sosi separat prin SmartBill.',
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0A0A0A; max-width: 480px; margin: 0 auto;">
      <p style="font-size: 16px; line-height: 1.5;">Bună,</p>
      <p style="font-size: 16px; line-height: 1.5;">Am primit plata pentru migrarea <strong>#${idShort}</strong>. Începem conversia — durează 3–15 minute.</p>
      <p style="font-size: 16px; line-height: 1.5;">Vă trimitem fișierele de import SAGA imediat ce sunt gata.</p>
      <p style="font-size: 14px; line-height: 1.5;"><a href="${statusUrl}" style="color: #C72E49; text-decoration: none;">Vedeți statusul migrării →</a></p>
      <p style="font-size: 14px; line-height: 1.5; color: #666;">Factura va fi emisă de <strong>Gamerina SRL</strong> și va sosi separat prin SmartBill.</p>
      <hr style="border: none; border-top: 1px solid #E5E5E5; margin: 32px 0;">
      <p style="font-size: 12px; color: #999;">Rapidport — portare WinMentor ⇄ SAGA, în ambele direcții</p>
    </div>
  `;

  return { subject, html, text };
}

export async function sendPaymentConfirmedEmail(
  jobId: string,
  to: string,
): Promise<void> {
  const { subject, html, text } = render(jobId);
  try {
    await sendEmail({ to, subject, html, text });
  } catch {
    // Cause-only log; never recipient or body. Non-fatal.
    console.warn('payment_confirmed_email_send_failed');
  }
}
