// Conversion-ready email — fired from the scheduler once a job has succeeded
// and bundle_output() has materialised output.zip. Copy: docs/emails-copy.md §3.
// Fire-and-forget from the caller.
import { env } from '../utils/env';
import { sendEmail } from '../utils/email';

function render(jobId: string): { subject: string; html: string; text: string } {
  const idShort = jobId.slice(0, 8);
  const downloadUrl = `${env.APP_URL}/api/jobs/${jobId}/download`;
  const guideUrl = `${env.APP_URL}/guide/saga-import.pdf`;
  const subject = `Migrarea #${idShort} — fișierele SAGA sunt gata`;

  const text = [
    'Bună,',
    '',
    `Conversia migrării #${idShort} s-a încheiat. Pachetul cu fișierele de import SAGA e gata.`,
    '',
    `Descărcați: ${downloadUrl}`,
    `Ghid de import în SAGA: ${guideUrl}`,
    '',
    'Pachetul rămâne disponibil 30 de zile.',
    '',
    'Aveți 3 sincronizări delta incluse pentru a aduce datele noi din WinMentor în SAGA pe parcursul tranziției.',
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0A0A0A; max-width: 480px; margin: 0 auto;">
      <p style="font-size: 16px; line-height: 1.5;">Bună,</p>
      <p style="font-size: 16px; line-height: 1.5;">Conversia migrării <strong>#${idShort}</strong> s-a încheiat. Pachetul cu fișierele de import SAGA e gata.</p>
      <p style="font-size: 14px; line-height: 1.5;">
        <a href="${downloadUrl}" style="color: #C72E49; text-decoration: none;">Descărcați pachetul →</a><br>
        <a href="${guideUrl}" style="color: #666; text-decoration: none;">Ghid de import în SAGA (PDF)</a>
      </p>
      <p style="font-size: 13px; line-height: 1.5; color: #666;">Pachetul rămâne disponibil 30 de zile.</p>
      <p style="font-size: 13px; line-height: 1.5; color: #666;">Aveți 3 sincronizări delta incluse pentru a aduce datele noi din WinMentor în SAGA pe parcursul tranziției.</p>
      <hr style="border: none; border-top: 1px solid #E5E5E5; margin: 32px 0;">
      <p style="font-size: 12px; color: #999;">Rapidport — portare WinMentor ⇄ SAGA, în ambele direcții</p>
    </div>
  `;

  return { subject, html, text };
}

export async function sendConversionReadyEmail(jobId: string, to: string): Promise<void> {
  const { subject, html, text } = render(jobId);
  try {
    await sendEmail({ to, subject, html, text });
  } catch {
    console.warn('conversion_ready_email_send_failed');
  }
}
