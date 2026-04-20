// Mapping-ready email — fired from the scheduler once a job's mapping is ready
// for user review. Copy: docs/emails-copy.md §1. Fire-and-forget from the caller.
import { env } from '../utils/env';
import { sendEmail } from '../utils/email';

function render(jobId: string): { subject: string; html: string; text: string } {
  const idShort = jobId.slice(0, 8);
  const mappingUrl = `${env.APP_URL}/job/${jobId}/mapping`;
  const subject = `Migrarea #${idShort} — maparea câmpurilor e gata pentru verificare`;

  const text = [
    'Bună,',
    '',
    `Maparea automată pentru migrarea #${idShort} e gata. Vă rugăm să o verificați și să o confirmați înainte de plată.`,
    '',
    `Verificați maparea: ${mappingUrl}`,
    '',
    'Pentru o experiență optimă, folosiți un laptop sau desktop.',
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0A0A0A; max-width: 480px; margin: 0 auto;">
      <p style="font-size: 16px; line-height: 1.5;">Bună,</p>
      <p style="font-size: 16px; line-height: 1.5;">Maparea automată pentru migrarea <strong>#${idShort}</strong> e gata. Vă rugăm să o verificați și să o confirmați înainte de plată.</p>
      <p style="font-size: 14px; line-height: 1.5;"><a href="${mappingUrl}" style="color: #C72E49; text-decoration: none;">Verificați maparea →</a></p>
      <p style="font-size: 13px; line-height: 1.5; color: #666;">Pentru o experiență optimă, folosiți un laptop sau desktop.</p>
      <hr style="border: none; border-top: 1px solid #E5E5E5; margin: 32px 0;">
      <p style="font-size: 12px; color: #999;">Rapidport — portare WinMentor ⇄ SAGA, în ambele direcții</p>
    </div>
  `;

  return { subject, html, text };
}

export async function sendMappingReadyEmail(jobId: string, to: string): Promise<void> {
  const { subject, html, text } = render(jobId);
  try {
    await sendEmail({ to, subject, html, text });
  } catch {
    console.warn('mapping_ready_email_send_failed');
  }
}
