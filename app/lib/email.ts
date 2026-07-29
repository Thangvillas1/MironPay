import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = 'MironPay <payroll@mironpay.xyz>'

// Change this one value to re-theme every email — header bar, price info-card
// accent, and the CTA button all derive their color from it.
const PRIMARY_COLOR = '#6366f1'

export async function sendPayrollClaimEmail(params: {
  to: string
  amount: number
  period: string
  note?: string | null
}) {
  const { to, amount, period, note } = params
  const inboxUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://mironpay.xyz'}/payroll/claim/inbox`
  const noteSentence = note?.trim() ? ` Note: ${note.trim()}.` : ''

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Bạn có ${amount.toFixed(2)} USDC lương chờ nhận — kỳ ${period}`,
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
    Your company sent a USDC payroll payment — sign in with this email to claim it.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f6;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e3e7ef;">

          <!-- Header -->
          <tr>
            <td bgcolor="${PRIMARY_COLOR}" style="background:${PRIMARY_COLOR};padding:28px 32px;" mso-line-height-rule="exactly">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.2px;">
                    MironPay
                  </td>
                  <td align="right" style="font-family:Arial,Helvetica,sans-serif;color:#dbe6ff;font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;">
                    Payroll
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 8px;">
              <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;color:#667085;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">
                Pay period: ${period}
              </p>
              <p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;color:#0d1526;font-size:34px;font-weight:700;letter-spacing:-0.6px;">
                ${amount.toFixed(2)} USDC
              </p>
              <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;color:#344054;font-size:14px;line-height:1.7;">
                Your employer has sent this payment through MironPay.${noteSentence}
              </p>
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
            <td style="padding:0 32px 32px;">
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
                This email contains no secret code and no direct claim link — you must always sign in with Google using ${to} to access these funds. If you weren't expecting this email, it's safe to ignore.
              </p>
            </td>
          </tr>
        </table>

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td align="center" style="padding:20px 8px 0;">
              <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;color:#98a2b3;font-size:12px;">
                © MironPay · Sent to ${to}
              </p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;color:#b0b7c3;font-size:11px;">
                MironPay · This is a transactional payroll notification, not marketing.
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
