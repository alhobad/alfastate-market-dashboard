// Daily digest notification — parses index.html data-fields so the email
// always matches the live dashboard. Sent via Resend by the GitHub Actions
// notify job (.github/workflows/daily-market-update.yml).
import { readFileSync } from 'fs';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const EMAIL_SUBJECT_OVERRIDE = process.env.EMAIL_SUBJECT || '';
// Comma-separated recipient list; override with a TO_EMAILS secret without code changes.
const TO_EMAILS = (process.env.TO_EMAILS || 'alhousainy.bader@gmail.com,info@alfastate.ca')
  .split(',').map(s => s.trim()).filter(Boolean);

const DASHBOARD_URL = 'https://alfastate-market-dashboard.pages.dev/';

if (!RESEND_API_KEY) {
  console.error('RESEND_API_KEY not set');
  process.exit(1);
}

// ---- extract data-field values from the checked-out index.html ----
function loadFields() {
  const html = readFileSync('index.html', 'utf-8');
  const get = (name) => {
    const m = html.match(new RegExp(`data-field="${name}"[^>]*>`));
    if (!m) return '';
    const rest = html.slice(m.index + m[0].length);
    return rest.slice(0, rest.indexOf('</')).replace(/\s+/g, ' ').replace(/&amp;/g, '&').trim();
  };
  return {
    date: get('header-date'),
    headline: get('headline'),
    lede: get('lede'),
    boc: get('boc-rate'), bocStatus: get('boc-status'), bocNext: get('boc-next'),
    variable: get('variable-rate'), fixed: get('fixed-rate'),
    us30: get('us-30yr-rate'), us30Change: get('us-30yr-change'),
    tipTopic: get('tip-topic-today').replace(/^Today:\s*/, ''),
    gtaMonth: get('gta-latest-month'),
  };
}

const f = loadFields();
const stamp = new Date().toISOString().slice(0, 10);
const subject = EMAIL_SUBJECT_OVERRIDE ||
  `AlfaEstate Daily Market Pulse — ${f.headline || stamp}`;

const rateRow = (label, value, note) => `
  <tr>
    <td style="padding:10px 14px;border-bottom:1px solid #eee5d5;font-size:13px;color:#5C6670;">${label}</td>
    <td style="padding:10px 14px;border-bottom:1px solid #eee5d5;font-size:15px;font-weight:600;color:#0B2540;white-space:nowrap;">${value}</td>
    <td style="padding:10px 14px;border-bottom:1px solid #eee5d5;font-size:12px;color:#9AA3AC;">${note || ''}</td>
  </tr>`;

const html = `
<div style="background:#F7F5F1;padding:32px 16px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;">
    <div style="background:#0B2540;padding:26px 30px;">
      <div style="color:#C9A24B;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;font-weight:600;">AlfaEstate · Daily Market Pulse</div>
      <div style="color:#ffffff;opacity:0.75;font-size:12px;margin-top:6px;">${f.date}</div>
    </div>
    <div style="padding:28px 30px 8px;">
      <h1 style="margin:0 0 12px;font-size:21px;line-height:1.35;color:#15202B;">${f.headline}</h1>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#5C6670;">${f.lede}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      ${rateRow('Bank of Canada', f.boc, f.bocStatus + ' · ' + f.bocNext)}
      ${rateRow('Best 5-yr variable', f.variable, '')}
      ${rateRow('Best 5-yr fixed', f.fixed, '')}
      ${rateRow('US 30-yr mortgage', f.us30, f.us30Change)}
    </table>
    <div style="padding:20px 30px 4px;font-size:13px;color:#5C6670;">
      Today&rsquo;s educational tip: <strong style="color:#0B2540;">${f.tipTopic}</strong>
      &nbsp;·&nbsp; GTA snapshot: <strong style="color:#0B2540;">${f.gtaMonth}</strong> (TRREB)
    </div>
    <div style="padding:22px 30px 30px;">
      <a href="${DASHBOARD_URL}" style="display:inline-block;background:#C9A24B;color:#0B2540;font-weight:600;font-size:14px;text-decoration:none;padding:12px 26px;border-radius:8px;">Open the full dashboard →</a>
    </div>
    <div style="padding:18px 30px;border-top:1px solid #eee5d5;font-size:11.5px;color:#9AA3AC;line-height:1.6;">
      Automated daily briefing generated at 7:00 AM ET. Sources: Bank of Canada, Ratehub/WOWA, Freddie Mac, TRREB, and daily Canadian market coverage — all linked on the dashboard.<br>
      Prepared by The North Wind Inc. for AlfaEstate.
    </div>
  </div>
</div>`;

// Preview mode: write the rendered email to a file instead of sending.
if (process.env.EMAIL_PREVIEW_FILE) {
  const { writeFileSync } = await import('fs');
  writeFileSync(process.env.EMAIL_PREVIEW_FILE, `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${subject}</title></head><body style="margin:0">${html}</body></html>`);
  console.log(`Preview written to ${process.env.EMAIL_PREVIEW_FILE} — subject: ${subject}`);
  process.exit(0);
}

async function main() {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: TO_EMAILS, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Resend API error ${res.status}: ${body}`);
    process.exit(1);
  }

  const data = await res.json();
  console.log(`Digest sent to ${TO_EMAILS.length} recipient(s) (id: ${data.id})`);
}

main().catch(err => {
  console.error(`Email send failed: ${err.message}`);
  process.exit(1);
});
