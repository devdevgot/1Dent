import { Resend } from "resend";
import { logger } from "./logger";

const apiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL ?? "1Dent <onboarding@resend.dev>";
const frontendUrl = process.env.FRONTEND_URL ?? "https://app.1dent.kz";

const resend = apiKey ? new Resend(apiKey) : null;

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

/**
 * Generic email sending function using Resend
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const toStr = Array.isArray(options.to) ? options.to.join(", ") : options.to;

  if (!resend) {
    logger.warn(
      { to: toStr, subject: options.subject },
      "Resend API key is not configured. Email logged to console instead of sending."
    );
    console.log(
      `\n================= [EMAIL SENT (DEV MODE / NO API KEY)] =================\n` +
      `From: ${fromEmail}\n` +
      `To: ${toStr}\n` +
      `Subject: ${options.subject}\n` +
      `Text Body:\n${options.text ?? "(No plain text version)"}\n` +
      `HTML Body:\n${options.html}\n` +
      `========================================================================\n`
    );
    return true;
  }

  try {
    const response = await resend.emails.send({
      from: fromEmail,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    if (response.error) {
      logger.error(
        { error: response.error, to: toStr, subject: options.subject },
        "Failed to send email via Resend"
      );
      return false;
    }

    logger.info(
      { id: response.data?.id, to: toStr, subject: options.subject },
      "Email sent successfully via Resend"
    );
    return true;
  } catch (error) {
    logger.error(
      { error, to: toStr, subject: options.subject },
      "Unhandled error sending email via Resend"
    );
    return false;
  }
}

/**
 * Wraps content in the standard 1Dent styled email template
 */
function wrapInTemplate(subject: string, contentHtml: string): string {
  const currentYear = new Date().getFullYear();
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f4f6f9;
      color: #334155;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #f4f6f9;
      padding: 40px 0;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
    }
    .header {
      background: linear-gradient(135deg, #1f75fe 0%, #0053d6 100%);
      padding: 32px;
      text-align: center;
    }
    .header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .content {
      padding: 40px 32px;
    }
    .content h2 {
      font-size: 20px;
      font-weight: 600;
      color: #1e293b;
      margin-top: 0;
      margin-bottom: 16px;
    }
    .content p {
      font-size: 16px;
      line-height: 24px;
      color: #475569;
      margin-top: 0;
      margin-bottom: 24px;
    }
    .card {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .card-row {
      margin-bottom: 12px;
    }
    .card-row:last-child {
      margin-bottom: 0;
    }
    .card-label {
      font-weight: 600;
      color: #64748b;
      font-size: 14px;
      margin-bottom: 4px;
    }
    .card-value {
      color: #1e293b;
      font-size: 16px;
      font-family: monospace;
      background: #e2e8f0;
      padding: 4px 8px;
      border-radius: 4px;
      display: inline-block;
    }
    .btn-container {
      text-align: center;
      margin: 32px 0 16px 0;
    }
    .btn {
      display: inline-block;
      background-color: #1f75fe;
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 28px;
      font-size: 16px;
      font-weight: 600;
      border-radius: 10px;
      box-shadow: 0 4px 6px -1px rgba(31, 117, 254, 0.2), 0 2px 4px -1px rgba(31, 117, 254, 0.1);
      transition: background-color 0.2s ease;
    }
    .btn:hover {
      background-color: #0053d6;
    }
    .footer {
      padding: 24px 32px;
      background-color: #f8fafc;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 14px;
      color: #64748b;
      line-height: 20px;
    }
    .footer a {
      color: #1f75fe;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>1Dent</h1>
      </div>
      <div class="content">
        ${contentHtml}
      </div>
      <div class="footer">
        <p>Вы получили это письмо от автоматической системы уведомлений 1Dent.</p>
        <p>&copy; ${currentYear} 1Dent. Все права защищены.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Sends a password reset link to the user
 */
export async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  const subject = "Сброс пароля в 1Dent";
  const resetLink = `${frontendUrl}/reset-password?token=${token}`;

  const html = wrapInTemplate(
    subject,
    `
    <h2>Сброс пароля</h2>
    <p>Здравствуйте!</p>
    <p>Вы получили это письмо, потому что был сделан запрос на сброс пароля для вашей учетной записи в системе управления стоматологией <strong>1Dent</strong>.</p>
    <p>Чтобы установить новый пароль, нажмите кнопку ниже:</p>
    <div class="btn-container">
      <a href="${resetLink}" class="btn" target="_blank">Сбросить пароль</a>
    </div>
    <p>Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо. Ссылка действительна в течение 1 часа.</p>
    `
  );

  const text = 
    `Сброс пароля в 1Dent\n\n` +
    `Здравствуйте!\n\n` +
    `Вы получили это письмо, потому что был сделан запрос на сброс пароля для вашей учетной записи в системе 1Dent.\n\n` +
    `Перейдите по ссылке ниже, чтобы сбросить пароль:\n` +
    `${resetLink}\n\n` +
    `Если вы не запрашивали сброс пароля, проигнорируйте это письмо.`;

  return sendEmail({ to: email, subject, html, text });
}

/**
 * Sends a staff invitation with temporary password
 */
export async function sendStaffInvitationEmail(
  email: string,
  name: string,
  tempPassword: string,
  clinicName: string
): Promise<boolean> {
  const subject = `Приглашение в команду ${clinicName}`;
  const loginLink = frontendUrl;

  const html = wrapInTemplate(
    subject,
    `
    <h2>Добро пожаловать в команду!</h2>
    <p>Здравствуйте, ${name}!</p>
    <p>Вы были приглашены в качестве сотрудника клиники <strong>${clinicName}</strong> в систему управления стоматологией <strong>1Dent</strong>.</p>
    <p>Ниже указаны ваши данные для входа:</p>
    
    <div class="card">
      <div class="card-row">
        <div class="card-label">Логин (Email)</div>
        <div><strong>${email}</strong></div>
      </div>
      <div class="card-row" style="margin-top: 10px;">
        <div class="card-label">Временный пароль</div>
        <div class="card-value">${tempPassword}</div>
      </div>
    </div>

    <p>Рекомендуем сменить пароль в личном кабинете сразу после первого входа в систему в целях безопасности.</p>

    <div class="btn-container">
      <a href="${loginLink}" class="btn" target="_blank">Войти в систему</a>
    </div>
    `
  );

  const text =
    `Приглашение в команду ${clinicName}\n\n` +
    `Здравствуйте, ${name}!\n\n` +
    `Вы были приглашены в качестве сотрудника клиники ${clinicName} в систему 1Dent.\n\n` +
    `Ваши данные для входа:\n` +
    `Логин: ${email}\n` +
    `Временный пароль: ${tempPassword}\n\n` +
    `Вход в систему:\n` +
    `${loginLink}\n\n` +
    `Пожалуйста, измените временный пароль после первого входа.`;

  return sendEmail({ to: email, subject, html, text });
}
