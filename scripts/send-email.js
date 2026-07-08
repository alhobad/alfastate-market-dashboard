const RESEND_API_KEY = process.env.RESEND_API_KEY;
const PR_URL = process.env.PR_URL || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';

const TO_EMAIL = 'info@alfaestate.ca';
const CC_EMAIL = 'alhousainy.bader@gmail.com';
const DASHBOARD_URL = 'https://alfastate-market-dashboard.pages.dev/';

if (!RESEND_API_KEY) {
  console.error('❌ RESEND_API_KEY not set');
  process.exit(1);
}

const prLink = PR_URL
  ? `<p>Pull request: <a href="${PR_URL}">${PR_URL}</a></p>`
  : '';

const html = `
  <p>Today's dashboard update is ready for review.</p>
  <p>Dashboard: <a href="${DASHBOARD_URL}">${DASHBOARD_URL}</a></p>
  ${prLink}
`;

async function main() {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      cc: [CC_EMAIL],
      subject: 'Alfastate dashboard update ready',
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`❌ Resend API error ${res.status}: ${body}`);
    process.exit(1);
  }

  const data = await res.json();
  console.log(`✅ Email sent (id: ${data.id})`);
}

main().catch(err => {
  console.error(`❌ Email send failed: ${err.message}`);
  process.exit(1);
});
