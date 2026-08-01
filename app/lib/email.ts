import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = 'Miron Payroll <payroll@mironpay.xyz>'

// Change this one value to re-theme every email — header bar, price info-card
// accent, and the CTA button all derive their color from it.
const PRIMARY_COLOR = '#6366f1'

export async function sendPayrollClaimEmail(params: {
  to: string
  amount: number
  period: string
  note?: string | null
  companyName?: string | null
  companyVerified?: boolean
  referenceCode?: string | null
}) {
  const { to, amount, period, note, companyName, companyVerified, referenceCode } = params
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mironpay.xyz'
  const inboxUrl = `${appUrl}/payroll/claim/inbox`
  // Absolute URL — email clients render this in a completely different
  // context than the app itself, so a relative /logo/... path (which works
  // fine everywhere in-app) would just be a broken image here.
  const logoUrl = `${appUrl}/logo/miron-logo-lockup-horizontal-light.png`
  const noteSentence = note?.trim() ? ` Note: ${note.trim()}.` : ''
  // Literal hex, not CSS custom properties — email clients can't resolve
  // var(--c-*). Small and unobtrusive by design: a company that isn't
  // verified gets the exact same email with no tick and no "unverified"
  // label — never seed doubt in an employee opening this for the first time.
  const verifiedTickHtml = companyVerified
    ? `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${PRIMARY_COLOR};text-align:center;line-height:14px;margin-left:5px;" title="Verified business">
         <span style="color:#ffffff;font-size:9px;font-weight:700;">&#10003;</span>
       </span>`
    : ''
  const paidByHtml = companyName
    ? `<p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;color:#475467;font-size:14px;">
         You&rsquo;ve been paid by <strong style="color:#0d1526;">${companyName}</strong>${verifiedTickHtml}
       </p>`
    : ''

  await resend.emails.send({
    from: FROM,
    to,
    subject: `You have ${amount.toFixed(2)} USDC payroll payment for period ${period} on MironPay`,
    html: `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>You have USDC payroll waiting</title>
<!--[if mso]>
<style type="text/css">
  table, td { font-family: Arial, Helvetica, sans-serif !important; }
</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background:#eef1f6;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#eef1f6;opacity:0;">
    Your employer sent a USDC payroll payment — sign in with this email to claim it.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f6;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e3e7ef;">

          <!-- Header -->
          <tr>
            <td bgcolor="#ffffff" style="background:#ffffff;padding:22px 32px;border-bottom:1px solid #e3e7ef;" mso-line-height-rule="exactly">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle">
                    <img src="${logoUrl}" alt="MironPay" height="40" style="display:block;height:40px;width:auto;border:0;outline:none;text-decoration:none;" />
                  </td>
                  <td valign="middle" align="right" style="font-family:Arial,Helvetica,sans-serif;color:#667085;font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;background:#f5f7fb;border-radius:999px;padding:4px 10px;white-space:nowrap;">
                    Payroll
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 8px;">
              ${paidByHtml}
              <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;color:#667085;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">
                Pay period: ${period}
              </p>
              <p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;color:#0d1526;font-size:34px;font-weight:700;letter-spacing:-0.6px;">
                ${amount.toFixed(2)} USDC
              </p>
              <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;color:#344054;font-size:14px;line-height:1.7;">
                Your employer has funded this payment on-chain and it's being held safely for you — only your signature can release it, and no one else can move it once it's sent.${noteSentence}
              </p>
              ${referenceCode ? `<p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;color:#98a2b3;font-size:12px;">
                Payment reference: <span style="font-family:'Courier New',monospace;color:#667085;font-weight:700;letter-spacing:0.3px;">${referenceCode}</span>
              </p>` : ''}
            </td>
          </tr>

          <!-- Info card -->
          <tr>
            <td style="padding:0 32px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="#f5f7fb" style="background:#f5f7fb;border:1px solid #e3e7ef;border-radius:12px;padding:16px 18px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;color:#475467;font-size:13px;line-height:1.7;">
                      To claim your funds, sign in to MironPay using <strong style="color:#0d1526;">this exact email address</strong> (${to}). No code and no existing wallet required — your account is created automatically the first time you sign in.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA button -->
          <tr>
            <td style="padding:0 32px 14px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="${PRIMARY_COLOR}" style="background:${PRIMARY_COLOR};border-radius:12px;">
                    <a href="${inboxUrl}" target="_blank" style="display:block;padding:14px 0;font-family:Arial,Helvetica,sans-serif;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">
                      Claim your funds
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Plain-text fallback link, in case the button above doesn't render in a given client -->
          <tr>
            <td style="padding:0 32px 32px;text-align:center;">
              <a href="${inboxUrl}" target="_blank" style="font-family:Arial,Helvetica,sans-serif;color:${PRIMARY_COLOR};font-size:12.5px;text-decoration:underline;word-break:break-all;">
                ${inboxUrl}
              </a>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid #e3e7ef;font-size:1px;line-height:1px;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- Security note -->
          <tr>
            <td style="padding:20px 32px 28px;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;color:#98a2b3;font-size:12px;line-height:1.7;">
                This email contains no secret code and no direct claim link — always sign in with Google using ${to} to access these funds. If you weren't expecting this, it's safe to ignore.
              </p>
            </td>
          </tr>
        </table>

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td align="center" style="padding:20px 8px 0;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;color:#98a2b3;font-size:12px;">
                © MironPay · Sent to ${to}
              </p>
              <p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;color:#b0b7c3;font-size:11px;">
                Automated payroll notification — not marketing, no unsubscribe needed.
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body></html>`,
  })
}
