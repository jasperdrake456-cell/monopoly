'use strict';
const { Resend } = require('resend');

async function sendPasswordEmail(newPassword) {
  const to = process.env.EMAIL_TO;
  if (!to) {
    console.warn('[email] EMAIL_TO not set — skipping email send');
    return;
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — skipping email send');
    return;
  }

  const resend = new Resend(apiKey);
  const appUrl = process.env.APP_URL || '';
  const from = process.env.EMAIL_FROM || 'Game Hub <onboarding@resend.dev>';

  const { error } = await resend.emails.send({
    from,
    to: to.split(',').map(e => e.trim()),
    subject: `🎮 Game Hub — Today's Password`,
    text: [
      `Today's Game Hub password is:`,
      ``,
      `    ${newPassword}`,
      ``,
      appUrl ? `Play here: ${appUrl}` : '',
      ``,
      `This password changes every day at 7:30 AM.`,
    ].join('\n'),
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="color:#0f0f1a;margin-bottom:4px;">🎮 Game Hub</h2>
        <p style="color:#555;margin-top:0;">Today's password</p>
        <div style="background:#0f0f1a;border-radius:12px;padding:20px 28px;margin:20px 0;text-align:center;">
          <span style="font-size:2rem;font-weight:900;letter-spacing:4px;color:#ffd700;">${newPassword}</span>
        </div>
        ${appUrl ? `<p style="text-align:center;"><a href="${appUrl}" style="background:#5865f2;color:#fff;text-decoration:none;padding:10px 28px;border-radius:8px;font-weight:700;">Play Now →</a></p>` : ''}
        <p style="color:#aaa;font-size:0.8rem;margin-top:24px;">This password changes every day at 7:30 AM.</p>
      </div>
    `,
  });

  if (error) throw new Error(error.message);
  console.log(`[email] Password email sent to ${to}`);
}

module.exports = { sendPasswordEmail };
