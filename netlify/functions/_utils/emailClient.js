// netlify/functions/_utils/emailClient.js
// Transactional approval emails via Brevo (free tier works with a single
// verified sender — no domain required). Hit the REST API with fetch so we add
// no npm dependency to the functions bundle.
//
// Env:
//   BREVO_API_KEY   — Brevo dashboard > SMTP & API > API Keys (starts "xkeysib-")
//   EMAIL_FROM      — a Brevo-VERIFIED sender address (Senders & IP > Senders)
//   EMAIL_FROM_NAME — display name shown in the inbox (default "VISTA")

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

/** True only when both the key and a verified sender are configured. */
export function emailConfigured() {
  return Boolean(process.env.BREVO_API_KEY && process.env.EMAIL_FROM);
}

export async function sendApprovalEmail({ to, postText, scheduledAt, imageUrl, approveUrl, rejectUrl, ttlHours }) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.EMAIL_FROM;
  if (!apiKey || !fromEmail) throw new Error('BREVO_API_KEY / EMAIL_FROM not set');

  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: process.env.EMAIL_FROM_NAME || 'VISTA', email: fromEmail },
      to: [{ email: to }],
      subject: 'VISTA — approve your LinkedIn post',
      htmlContent: buildHtml({ postText, scheduledAt, imageUrl, approveUrl, rejectUrl, ttlHours }),
    }),
  });

  if (!res.ok) {
    // Surface Brevo's own message (e.g. "sender not verified") for fast triage.
    throw new Error(`Brevo send failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

// Inline styles only — email clients strip <style> blocks and external CSS.
function buildHtml({ postText, scheduledAt, imageUrl, approveUrl, rejectUrl, ttlHours }) {
  const when = scheduledAt instanceof Date
    ? scheduledAt.toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
      }) + ' IST'
    : String(scheduledAt);

  const preview = esc(postText || '').replace(/\n/g, '<br>');

  return `<!DOCTYPE html><html><body style="margin:0;background:#0a0a14;padding:24px;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:540px;margin:0 auto;background:#11111f;border:1px solid rgba(255,255,255,.1);border-radius:16px;overflow:hidden">
    <div style="padding:22px 24px;border-bottom:1px solid rgba(255,255,255,.08)">
      <div style="font-size:13px;font-weight:bold;letter-spacing:.14em;color:#a78bfa">VISTA</div>
      <div style="font-size:18px;font-weight:bold;color:#f1f5f9;margin-top:6px">Approve your LinkedIn post</div>
    </div>
    <div style="padding:22px 24px">
      <p style="font-size:13px;color:#8b93a7;margin:0 0 14px">Here's the post VISTA drafted. It publishes to LinkedIn at the scheduled time <b style="color:#f1f5f9">only after you approve</b>.</p>
      ${imageUrl ? `<img src="${esc(imageUrl)}" alt="Certificate" style="width:100%;border-radius:10px;margin-bottom:14px" />` : ''}
      <div style="background:#181829;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px;font-size:14px;line-height:1.6;color:#e8ecf4;white-space:pre-wrap">${preview}</div>
      <p style="font-size:12px;color:#8b93a7;margin:14px 0 18px">🗓 Scheduled for <b style="color:#f1f5f9">${esc(when)}</b></p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%"><tr>
        <td style="padding-right:6px;width:50%">
          <a href="${esc(approveUrl)}" style="display:block;text-align:center;background:#10b981;color:#04130d;font-weight:bold;font-size:14px;text-decoration:none;padding:13px 0;border-radius:10px">✅ Approve &amp; publish</a>
        </td>
        <td style="padding-left:6px;width:50%">
          <a href="${esc(rejectUrl)}" style="display:block;text-align:center;background:#181829;color:#ef4444;font-weight:bold;font-size:14px;text-decoration:none;padding:13px 0;border-radius:10px;border:1px solid rgba(239,68,68,.4)">✕ Reject</a>
        </td>
      </tr></table>
      <p style="font-size:11px;color:#475069;margin:18px 0 0;text-align:center">These links work once and expire in ${Number(ttlHours) || 24} hours.</p>
    </div>
  </div>
  <div style="text-align:center;font-size:11px;color:#475069;margin-top:16px;letter-spacing:.1em">POWERED BY VISTA</div>
</body></html>`;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
