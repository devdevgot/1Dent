import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createRequire } from "module";
import path from "path";
import { ContractsRepository } from "../modules/contracts/contracts.repository";
import { CONTRACT_TABLE_CSS, htmlToPdfmakeContent } from "../modules/contracts/contract-render";
import { sendToPatient } from "../shared/messaging";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const repo = new ContractsRepository();

// ── PDF generation setup ───────────────────────────────────────────────────
// pdfmake 0.3.x exports a singleton instance (not a constructor).
// Fonts are set directly on the instance as file-system paths.
const _require = createRequire(import.meta.url);
const pdfmakeDir = path.dirname(_require.resolve("pdfmake/package.json"));
const fontsDir = path.join(pdfmakeDir, "fonts", "Roboto");

interface PdfmakeInstance {
  fonts: Record<string, Record<string, string>>;
  setUrlAccessPolicy(fn: ((url: string) => boolean) | undefined): void;
  createPdf(docDef: unknown): {
    getBuffer(): Promise<Buffer>;
  };
}

function getPdfInstance(): PdfmakeInstance {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const instance = _require("pdfmake") as PdfmakeInstance;
  instance.fonts = {
    Roboto: {
      normal:      path.join(fontsDir, "Roboto-Regular.ttf"),
      bold:        path.join(fontsDir, "Roboto-Medium.ttf"),
      italics:     path.join(fontsDir, "Roboto-Italic.ttf"),
      bolditalics: path.join(fontsDir, "Roboto-MediumItalic.ttf"),
    },
  };
  // Disable URL access (no remote resources needed)
  instance.setUrlAccessPolicy(() => false);
  return instance;
}

async function generatePdfBuffer(opts: {
  templateName: string;
  patientName: string;
  clinicName: string;
  renderedHtml: string;
  signedAt: string | null;
}): Promise<Buffer> {
  const pdfmake = getPdfInstance();
  const bodyContent = htmlToPdfmakeContent(opts.renderedHtml);

  const docDefinition = {
    defaultStyle: { font: "Roboto" },
    pageMargins: [50, 60, 50, 60] as [number, number, number, number],
    content: [
      { text: opts.templateName, style: "header" },
      { text: opts.clinicName, style: "subtitle" },
      { text: `Пациент: ${opts.patientName}`, style: "meta", margin: [0, 0, 0, 20] as [number, number, number, number] },
      ...bodyContent,
      ...(opts.signedAt
        ? [
            {
              canvas: [{ type: "line", x1: 0, y1: 5, x2: 495, y2: 5, lineWidth: 0.5, lineColor: "#cccccc" }],
              margin: [0, 30, 0, 12] as [number, number, number, number],
            },
            {
              text: `Договор подписан электронно: ${opts.signedAt}\nПациент: ${opts.patientName}`,
              style: "signatureBlock",
            },
          ]
        : []),
    ],
    styles: {
      header:         { fontSize: 18, bold: true, alignment: "center", margin: [0, 0, 0, 6] },
      subtitle:       { fontSize: 12, color: "#555555", alignment: "center", margin: [0, 0, 0, 4] },
      meta:           { fontSize: 12, color: "#333333" },
      body:           { fontSize: 12, lineHeight: 1.5, color: "#222222" },
      bodyTable:      { fontSize: 11, color: "#222222" },
      signatureBlock: { fontSize: 11, color: "#555555", italics: true },
    },
  };

  return pdfmake.createPdf(docDefinition).getBuffer();
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getClientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() ?? null;
  return req.socket.remoteAddress ?? null;
}

/** Generates a random 6-digit OTP code. */
function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Returns a Date 5 minutes from now (OTP expiry). */
function otpExpiry(): Date {
  return new Date(Date.now() + 5 * 60 * 1000);
}

const STATUS_LABELS: Record<string, string> = {
  sent: "Отправлен",
  viewed: "Просмотрен",
  signed: "Подписан",
};

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildContractPage(opts: {
  templateName: string;
  patientName: string;
  clinicName: string;
  renderedHtml: string;
  token: string;
  status: string;
  signedAt?: Date | null;
  isPreview?: boolean;
}): string {
  const { templateName, patientName, clinicName, renderedHtml, token, status, signedAt, isPreview } = opts;
  const isSigned = status === "signed";
  const signedDateStr = signedAt
    ? new Date(signedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escHtml(templateName)} — ${escHtml(clinicName)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f2f2f7; min-height: 100vh; color: #1c1c1e; }
    .header { background: #fff; border-bottom: 1px solid #e5e5ea; padding: 16px 20px; display: flex; align-items: center; gap: 12px; position: sticky; top: 0; z-index: 10; }
    .logo { width: 36px; height: 36px; background: #6bcb3a; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .logo svg { width: 22px; height: 22px; }
    .header-text h1 { font-size: 15px; font-weight: 700; color: #1c1c1e; line-height: 1.2; }
    .header-text p { font-size: 12px; color: #6e6e73; margin-top: 2px; }
    .badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-left: auto; flex-shrink: 0; }
    .badge.sent { background: #e8f4fd; color: #0077b6; }
    .badge.viewed { background: #fff3cd; color: #856404; }
    .badge.signed { background: #d4edda; color: #155724; }
    .container { max-width: 720px; margin: 0 auto; padding: 20px 16px 120px; }
    .card { background: #fff; border-radius: 16px; padding: 24px 20px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
    .meta-chip { background: #f2f2f7; border-radius: 8px; padding: 6px 12px; font-size: 13px; color: #3a3a3c; }
    .meta-chip span { font-weight: 600; }
    .contract-body { line-height: 1.7; font-size: 14px; color: #3a3a3c; white-space: normal; word-break: break-word; }
    ${CONTRACT_TABLE_CSS}
    .filled-field { background: #fff9c4; border-radius: 3px; padding: 0 2px; font-weight: 700; font-style: normal; }
    .actions { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid #e5e5ea; padding: 16px 20px; display: flex; gap: 12px; }
    .btn { flex: 1; height: 50px; border-radius: 14px; border: none; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: opacity 0.15s; text-decoration: none; }
    .btn:active { opacity: 0.8; }
    .btn-primary { background: #6bcb3a; color: #fff; }
    .btn-secondary { background: #f2f2f7; color: #3a3a3c; }
    .signed-banner { background: #d4edda; border: 1px solid #c3e6cb; border-radius: 14px; padding: 16px 20px; text-align: center; margin-bottom: 16px; }
    .signed-banner h3 { font-size: 16px; font-weight: 700; color: #155724; margin-bottom: 4px; }
    .signed-banner p { font-size: 13px; color: #155724; opacity: 0.85; }
    .btn.loading { opacity: 0.7; pointer-events: none; }
    .spinner { width: 18px; height: 18px; border: 2.5px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; display: none; }
    .btn.loading .spinner { display: block; }
    .btn.loading .btn-label { display: none; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 480px) { .container { padding: 16px 12px 110px; } .card { padding: 18px 14px; } }
    /* OTP Modal */
    .otp-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); backdrop-filter: blur(4px); display: flex; align-items: flex-end; justify-content: center; z-index: 100; opacity: 0; pointer-events: none; transition: opacity 0.2s; }
    .otp-overlay.open { opacity: 1; pointer-events: all; }
    .otp-box { background: #fff; border-radius: 24px 24px 0 0; padding: 28px 24px 36px; width: 100%; max-width: 480px; transform: translateY(100%); transition: transform 0.25s cubic-bezier(0.32,0.72,0,1); }
    .otp-overlay.open .otp-box { transform: translateY(0); }
    .otp-handle { width: 36px; height: 4px; background: #e5e5ea; border-radius: 2px; margin: 0 auto 20px; }
    .otp-title { font-size: 18px; font-weight: 700; color: #1c1c1e; margin-bottom: 6px; }
    .otp-sub { font-size: 14px; color: #6e6e73; margin-bottom: 24px; line-height: 1.5; }
    .otp-inputs { display: flex; gap: 10px; justify-content: center; margin-bottom: 20px; }
    .otp-input { width: 46px; height: 58px; border: 2px solid #e5e5ea; border-radius: 12px; font-size: 24px; font-weight: 700; text-align: center; color: #1c1c1e; background: #f9f9f9; transition: border-color 0.15s, background 0.15s; outline: none; -webkit-appearance: none; appearance: none; }
    .otp-input:focus { border-color: #6bcb3a; background: #fff; }
    .otp-input.error { border-color: #ff3b30; background: #fff0ee; animation: shake 0.3s; }
    @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
    .otp-error { color: #ff3b30; font-size: 13px; text-align: center; min-height: 18px; margin-bottom: 14px; }
    .otp-submit { width: 100%; height: 52px; border-radius: 14px; border: none; background: #6bcb3a; color: #fff; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 14px; transition: opacity 0.15s; }
    .otp-submit:active { opacity: 0.85; }
    .otp-submit.loading { opacity: 0.65; pointer-events: none; }
    .otp-footer { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px; color: #6e6e73; }
    .otp-resend { background: none; border: none; color: #6bcb3a; font-size: 13px; font-weight: 600; cursor: pointer; padding: 0; }
    .otp-resend:disabled { color: #aaa; cursor: default; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C8.5 2 7 4.5 7 6.5c0 1.5.5 3 1.5 4C9.5 11.5 10 13 10 14.5c0 1-.5 2-1 2.5-.5.5-1 .5-1 1.5 0 1.5 1.5 3.5 4 3.5s4-2 4-3.5c0-1-.5-1-.5-1.5-.5-.5-1-1.5-1-2.5 0-1.5.5-3 1.5-4 1-1 1.5-2.5 1.5-4C19 4.5 15.5 2 12 2Z" fill="white"/>
      </svg>
    </div>
    <div class="header-text">
      <h1>${escHtml(templateName)}</h1>
      <p>${escHtml(clinicName)}</p>
    </div>
    <span class="badge ${status}">${STATUS_LABELS[status] ?? status}</span>
  </div>

  <div class="container">
    ${isSigned ? `
    <div class="signed-banner">
      <h3>✅ Договор подписан</h3>
      <p>Подписан ${signedDateStr}</p>
    </div>` : ""}

    <div class="card">
      <div class="meta">
        <div class="meta-chip">Пациент: <span>${escHtml(patientName)}</span></div>
      </div>
      <div class="contract-body">
        ${renderedHtml}
      </div>
    </div>
  </div>

  ${!isPreview ? `<div class="actions">
    ${!isSigned ? `
    <button class="btn btn-primary" id="sign-btn" onclick="startSign()">
      <div class="spinner"></div>
      <span class="btn-label">✍️ Подписать</span>
    </button>` : ""}
    <a class="btn btn-secondary" href="/p/contract/${token}/pdf" download="${escHtml(templateName)}.pdf">
      📄 Скачать PDF
    </a>
  </div>` : ""}

  <!-- OTP Modal -->
  <div class="otp-overlay" id="otp-overlay">
    <div class="otp-box">
      <div class="otp-handle"></div>
      <div class="otp-title">Подтверждение подписи</div>
      <div class="otp-sub">Введите 6-значный код, который мы отправили вам в WhatsApp.</div>
      <div class="otp-inputs" id="otp-inputs">
        <input class="otp-input" type="tel" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="one-time-code" />
        <input class="otp-input" type="tel" maxlength="1" inputmode="numeric" pattern="[0-9]" />
        <input class="otp-input" type="tel" maxlength="1" inputmode="numeric" pattern="[0-9]" />
        <input class="otp-input" type="tel" maxlength="1" inputmode="numeric" pattern="[0-9]" />
        <input class="otp-input" type="tel" maxlength="1" inputmode="numeric" pattern="[0-9]" />
        <input class="otp-input" type="tel" maxlength="1" inputmode="numeric" pattern="[0-9]" />
      </div>
      <div class="otp-error" id="otp-error"></div>
      <button class="otp-submit" id="otp-submit" onclick="submitOtp()">
        <div class="spinner"></div>
        <span class="btn-label">✅ Подписать договор</span>
      </button>
      <div class="otp-footer">
        <span id="otp-timer">Код действителен 5:00</span>
        <span>·</span>
        <button class="otp-resend" id="otp-resend" onclick="resendOtp()" disabled>Отправить снова</button>
      </div>
    </div>
  </div>

  <script>
    var TOKEN = '${token}';
    var timerInterval = null;
    var secondsLeft = 300;

    function startSign() {
      var btn = document.getElementById('sign-btn');
      btn.classList.add('loading');
      fetch('/p/contract/' + TOKEN + '/request-otp', { method: 'POST' })
        .then(function(r){ return r.json(); })
        .then(function(data) {
          btn.classList.remove('loading');
          if (data.success) {
            openOtpModal();
          } else {
            alert(data.error || 'Не удалось отправить код. Попробуйте снова.');
          }
        })
        .catch(function() {
          btn.classList.remove('loading');
          alert('Ошибка сети. Попробуйте снова.');
        });
    }

    function openOtpModal() {
      var overlay = document.getElementById('otp-overlay');
      overlay.classList.add('open');
      clearInputs();
      setError('');
      startTimer(300);
      setTimeout(function(){ focusFirst(); }, 300);
    }

    function closeOtpModal() {
      document.getElementById('otp-overlay').classList.remove('open');
      clearInterval(timerInterval);
    }

    function focusFirst() {
      var inputs = document.querySelectorAll('.otp-input');
      if (inputs[0]) inputs[0].focus();
    }

    function clearInputs() {
      document.querySelectorAll('.otp-input').forEach(function(i){ i.value = ''; });
    }

    function setError(msg) {
      document.getElementById('otp-error').textContent = msg;
      if (msg) {
        document.querySelectorAll('.otp-input').forEach(function(i){ i.classList.add('error'); });
        setTimeout(function(){ document.querySelectorAll('.otp-input').forEach(function(i){ i.classList.remove('error'); }); }, 600);
      }
    }

    function getCode() {
      return Array.from(document.querySelectorAll('.otp-input')).map(function(i){ return i.value; }).join('');
    }

    function startTimer(seconds) {
      secondsLeft = seconds;
      clearInterval(timerInterval);
      var resend = document.getElementById('otp-resend');
      resend.disabled = true;
      timerInterval = setInterval(function() {
        secondsLeft--;
        var m = Math.floor(secondsLeft / 60);
        var s = secondsLeft % 60;
        var timerEl = document.getElementById('otp-timer');
        if (timerEl) timerEl.textContent = 'Код действителен ' + m + ':' + (s < 10 ? '0' : '') + s;
        if (secondsLeft <= 0) {
          clearInterval(timerInterval);
          if (timerEl) timerEl.textContent = 'Код истёк';
          if (resend) resend.disabled = false;
        }
      }, 1000);
    }

    function resendOtp() {
      document.getElementById('otp-resend').disabled = true;
      setError('');
      clearInputs();
      fetch('/p/contract/' + TOKEN + '/request-otp', { method: 'POST' })
        .then(function(r){ return r.json(); })
        .then(function(data) {
          if (data.success) {
            startTimer(300);
            focusFirst();
          } else {
            setError(data.error || 'Не удалось отправить код');
            document.getElementById('otp-resend').disabled = false;
          }
        })
        .catch(function() {
          setError('Ошибка сети');
          document.getElementById('otp-resend').disabled = false;
        });
    }

    function submitOtp() {
      var code = getCode();
      if (code.length < 6) { setError('Введите все 6 цифр'); return; }
      var btn = document.getElementById('otp-submit');
      btn.classList.add('loading');
      setError('');
      fetch('/p/contract/' + TOKEN + '/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code }),
      })
        .then(function(r){ return r.json(); })
        .then(function(data) {
          btn.classList.remove('loading');
          if (data.success) {
            clearInterval(timerInterval);
            location.reload();
          } else if (data.code === 'OTP_EXPIRED') {
            setError('Код истёк. Запросите новый.');
            document.getElementById('otp-resend').disabled = false;
          } else {
            setError(data.error || 'Неверный код. Попробуйте снова.');
          }
        })
        .catch(function() {
          btn.classList.remove('loading');
          setError('Ошибка сети. Попробуйте снова.');
        });
    }

    // OTP input keyboard navigation
    (function() {
      var inputs = Array.from(document.querySelectorAll('.otp-input'));
      inputs.forEach(function(inp, idx) {
        inp.addEventListener('input', function(e) {
          var val = inp.value.replace(/[^0-9]/g, '');
          // Handle paste of multiple digits
          if (val.length > 1) {
            val.split('').slice(0, 6 - idx).forEach(function(ch, i) {
              if (inputs[idx + i]) inputs[idx + i].value = ch;
            });
            var next = inputs[Math.min(idx + val.length, 5)];
            if (next) next.focus();
          } else {
            inp.value = val;
            if (val && inputs[idx + 1]) inputs[idx + 1].focus();
          }
          if (getCode().length === 6) submitOtp();
        });
        inp.addEventListener('keydown', function(e) {
          if (e.key === 'Backspace' && !inp.value && inputs[idx - 1]) {
            inputs[idx - 1].focus();
            inputs[idx - 1].value = '';
          }
        });
        inp.addEventListener('paste', function(e) {
          var text = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
          e.preventDefault();
          if (text.length >= 6) {
            text.slice(0, 6).split('').forEach(function(ch, i){ if (inputs[i]) inputs[i].value = ch; });
            inputs[5].focus();
            if (getCode().length === 6) submitOtp();
          }
        });
      });
      // Close modal when clicking overlay background
      document.getElementById('otp-overlay').addEventListener('click', function(e) {
        if (e.target === this) closeOtpModal();
      });
    })();
  </script>
</body>
</html>`;
}

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /p/contract/:token — public patient-facing contract page
router.get("/p/contract/:token", async (req: Request, res: Response, next: NextFunction) => {
  const token = String(req.params["token"]);
  try {
    const result = await repo.findContractByToken(token);
    if (!result) {
      return res.status(404).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Не найдено</title></head><body style="font-family:sans-serif;text-align:center;padding:60px 20px"><h2>Договор не найден</h2><p style="color:#666">Эта ссылка устарела или недействительна.</p></body></html>`);
    }

    const { contract, templateName, patientName, clinicName } = result;
    const isPreview = req.query["preview"] === "1";

    if (!isPreview && contract.status === "sent") {
      await repo.markContractViewed(token).catch((err: unknown) =>
        logger.warn({ err }, "[contract] markViewed failed"),
      );
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.send(buildContractPage({
      templateName,
      patientName,
      clinicName,
      renderedHtml: contract.renderedHtml ?? "",
      token,
      status: contract.status,
      signedAt: contract.signedAt,
      isPreview,
    }));
  } catch (err) {
    next(err);
    return;
  }
});

// POST /p/contract/:token/request-otp — sends 6-digit OTP to patient WhatsApp
router.post("/p/contract/:token/request-otp", async (req: Request, res: Response, next: NextFunction) => {
  const token = String(req.params["token"]);
  try {
    const result = await repo.findContractByToken(token);
    if (!result) return res.status(404).json({ success: false, error: "Договор не найден" });
    if (result.contract.status === "signed") {
      return res.json({ success: false, error: "Договор уже подписан" });
    }

    const code = generateOtpCode();
    await repo.saveOtpForToken(token, code, otpExpiry());

    const message = `🔐 Код подтверждения для подписания договора «${result.templateName}»:\n\n*${code}*\n\nКод действителен 5 минут. Не передавайте его третьим лицам.`;
    sendToPatient(result.contract.clinicId, result.patientPhone, message).catch((err: unknown) => {
      logger.warn({ err }, "[contract] Failed to send OTP WhatsApp");
    });

    logger.info({ token }, "[contract] OTP requested");
    return res.json({ success: true });
  } catch (err) {
    next(err);
    return;
  }
});

// POST /p/contract/:token/sign — patient signs after OTP verification
router.post("/p/contract/:token/sign", async (req: Request, res: Response, next: NextFunction) => {
  const token = String(req.params["token"]);
  try {
    const result = await repo.findContractByToken(token);
    if (!result) return res.status(404).json({ success: false, error: "Договор не найден" });

    if (result.contract.status === "signed") {
      return res.json({ success: true, message: "Уже подписан" });
    }

    const code = String((req.body as Record<string, unknown>)["code"] ?? "").trim();
    if (!code) return res.status(400).json({ success: false, error: "Код не указан" });

    const otpResult = await repo.verifyOtpForToken(token, code);
    if (otpResult === "expired") {
      return res.status(400).json({ success: false, code: "OTP_EXPIRED", error: "Код истёк. Запросите новый." });
    }
    if (otpResult !== "ok") {
      return res.status(400).json({ success: false, code: "OTP_INVALID", error: "Неверный код. Попробуйте снова." });
    }

    const ip = getClientIp(req);
    const signed = await repo.markContractSigned(token, ip);
    if (!signed) return res.status(400).json({ success: false, error: "Не удалось подписать" });

    const confirmMsg = `✅ Договор «${result.templateName}» успешно подписан.\n\nСпасибо, ${result.patientName}! Если у вас есть вопросы — обратитесь в клинику.`;
    sendToPatient(result.contract.clinicId, result.patientPhone, confirmMsg).catch((err: unknown) => {
      logger.warn({ err }, "[contract] Failed to send signing confirmation");
    });

    return res.json({ success: true });
  } catch (err) {
    next(err);
    return;
  }
});

// GET /p/contract/:token/pdf — real PDF download using pdfmake
router.get("/p/contract/:token/pdf", async (req: Request, res: Response, next: NextFunction) => {
  const token = String(req.params["token"]);
  try {
    const result = await repo.findContractByToken(token);
    if (!result) return res.status(404).send("Not found");

    const { contract, templateName, patientName, clinicName } = result;
    const signedAt = contract.signedAt
      ? new Date(contract.signedAt).toLocaleString("ru-RU", {
          day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
        })
      : null;

    const pdfBuffer = await generatePdfBuffer({
      templateName,
      patientName,
      clinicName,
      renderedHtml: contract.renderedHtml ?? "",
      signedAt,
    });

    const filename = encodeURIComponent(`${templateName}.pdf`);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${filename}`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader("Cache-Control", "no-store");
    return res.send(pdfBuffer);
  } catch (err) {
    logger.error({ err }, "[contract] PDF generation failed");
    next(err);
    return;
  }
});

// ── Bundle Routes ──────────────────────────────────────────────────────────

function buildBundlePage(opts: {
  clinicName: string;
  patientName: string;
  bundleToken: string;
  isPreview?: boolean;
  contracts: Array<{
    token: string;
    templateName: string;
    renderedHtml: string;
    status: string;
    signedAt?: Date | null;
  }>;
}): string {
  const { clinicName, patientName, bundleToken, isPreview, contracts } = opts;
  const allSigned = contracts.every((c) => c.status === "signed");
  const firstSignedAt = contracts.find((c) => c.signedAt)?.signedAt;
  const signedDateStr = firstSignedAt
    ? new Date(firstSignedAt).toLocaleString("ru-RU", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "";

  const tabsJson = JSON.stringify(
    contracts.map((c, i) => ({
      idx: i,
      label: c.templateName,
      html: c.renderedHtml,
      status: c.status,
      token: c.token,
    })),
  ).replace(/<\/script>/gi, "<\\/script>");

  function bundleTabLabel(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes("договор")) return "Договор";
    if (lower.startsWith("идс") || lower.includes("информирован")) return "ИДС";
    if (lower.includes("план")) return "План";
    if (lower.includes("памятка")) return "Памятка";
    if (lower.includes("акт")) return "Акт";
    if (lower.includes("гарант")) return "Гарантия";
    return name.length > 22 ? `${name.slice(0, 20)}…` : name;
  }

  const tabButtons = contracts
    .map(
      (c, i) =>
        `<button class="tab-btn${i === 0 ? " active" : ""}" onclick="showTab(${i})" id="tab-btn-${i}">
          <span class="tab-num">${i + 1}</span>
          <span class="tab-label">${escHtml(bundleTabLabel(c.templateName))}</span>
          ${c.status === "signed" ? '<span class="tab-check">✓</span>' : ""}
        </button>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Пакет документов — ${escHtml(clinicName)}</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f2f2f7;min-height:100vh;color:#1c1c1e}
    .header{background:#fff;border-bottom:1px solid #e5e5ea;padding:14px 16px;display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:20}
    .logo{width:34px;height:34px;background:#6bcb3a;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .logo svg{width:20px;height:20px}
    .htext h1{font-size:14px;font-weight:700;color:#1c1c1e;line-height:1.2}
    .htext p{font-size:11px;color:#6e6e73;margin-top:1px}
    .hbadge{margin-left:auto;flex-shrink:0;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600}
    .hbadge.pending{background:#e8f4fd;color:#0077b6}
    .hbadge.signed{background:#d4edda;color:#155724}
    .tab-bar{background:#fff;border-bottom:1px solid #e5e5ea;display:flex;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;position:sticky;top:62px;z-index:15}
    .tab-bar::-webkit-scrollbar{display:none}
    .tab-btn{flex:1;min-width:72px;padding:10px 6px 8px;display:flex;flex-direction:column;align-items:center;gap:3px;border:none;background:transparent;cursor:pointer;position:relative;color:#6e6e73;font-size:10px;font-weight:600;border-bottom:2px solid transparent;transition:color .15s}
    .tab-btn.active{color:#6bcb3a;border-bottom-color:#6bcb3a}
    .tab-num{width:22px;height:22px;border-radius:50%;background:#f2f2f7;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;transition:background .15s,color .15s}
    .tab-btn.active .tab-num{background:#6bcb3a;color:#fff}
    .tab-label{line-height:1}
    .tab-check{position:absolute;top:6px;right:6px;font-size:9px;color:#6bcb3a;font-weight:700}
    .container{max-width:720px;margin:0 auto;padding:16px 14px 130px}
    .signed-banner{background:#d4edda;border:1px solid #c3e6cb;border-radius:14px;padding:14px 18px;text-align:center;margin-bottom:14px}
    .signed-banner h3{font-size:15px;font-weight:700;color:#155724;margin-bottom:3px}
    .signed-banner p{font-size:12px;color:#155724;opacity:.85}
    .card{background:#fff;border-radius:16px;padding:22px 18px;box-shadow:0 1px 4px rgba(0,0,0,.07);display:none}
    .card.active{display:block}
    .card-meta{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
    .meta-chip{background:#f2f2f7;border-radius:8px;padding:5px 10px;font-size:12px;color:#3a3a3c}
    .meta-chip span{font-weight:600}
    .contract-body{line-height:1.7;font-size:13px;color:#3a3a3c;white-space:pre-wrap;word-break:break-word}
    ${CONTRACT_TABLE_CSS.replace(/\n/g, "")}
    .actions{position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #e5e5ea;padding:14px 16px;display:flex;gap:10px;z-index:20}
    .btn{flex:1;height:48px;border-radius:14px;border:none;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:opacity .15s;text-decoration:none}
    .btn:active{opacity:.8}
    .btn-primary{background:#6bcb3a;color:#fff}
    .btn-secondary{background:#f2f2f7;color:#3a3a3c;font-size:13px}
    .btn.loading{opacity:.65;pointer-events:none}
    .spinner{width:18px;height:18px;border:2.5px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:none}
    .btn.loading .spinner{display:block}
    .btn.loading .btn-label{display:none}
    @keyframes spin{to{transform:rotate(360deg)}}
    @media(max-width:480px){.container{padding:14px 10px 120px}.card{padding:16px 12px}}
    /* OTP Modal */
    .otp-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;z-index:100;opacity:0;pointer-events:none;transition:opacity .2s}
    .otp-overlay.open{opacity:1;pointer-events:all}
    .otp-box{background:#fff;border-radius:24px 24px 0 0;padding:28px 24px 36px;width:100%;max-width:480px;transform:translateY(100%);transition:transform .25s cubic-bezier(.32,.72,0,1)}
    .otp-overlay.open .otp-box{transform:translateY(0)}
    .otp-handle{width:36px;height:4px;background:#e5e5ea;border-radius:2px;margin:0 auto 20px}
    .otp-title{font-size:18px;font-weight:700;color:#1c1c1e;margin-bottom:6px}
    .otp-sub{font-size:14px;color:#6e6e73;margin-bottom:24px;line-height:1.5}
    .otp-inputs{display:flex;gap:10px;justify-content:center;margin-bottom:20px}
    .otp-input{width:46px;height:58px;border:2px solid #e5e5ea;border-radius:12px;font-size:24px;font-weight:700;text-align:center;color:#1c1c1e;background:#f9f9f9;transition:border-color .15s,background .15s;outline:none;-webkit-appearance:none;appearance:none}
    .otp-input:focus{border-color:#6bcb3a;background:#fff}
    .otp-input.error{border-color:#ff3b30;background:#fff0ee;animation:shake .3s}
    @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
    .otp-error{color:#ff3b30;font-size:13px;text-align:center;min-height:18px;margin-bottom:14px}
    .otp-submit{width:100%;height:52px;border-radius:14px;border:none;background:#6bcb3a;color:#fff;font-size:16px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:14px;transition:opacity .15s}
    .otp-submit:active{opacity:.85}
    .otp-submit.loading{opacity:.65;pointer-events:none}
    .otp-footer{display:flex;align-items:center;justify-content:center;gap:6px;font-size:13px;color:#6e6e73}
    .otp-resend{background:none;border:none;color:#6bcb3a;font-size:13px;font-weight:600;cursor:pointer;padding:0}
    .otp-resend:disabled{color:#aaa;cursor:default}
  </style>
</head>
<body>
  <div class="header">
    <div class="logo"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2C8.5 2 7 4.5 7 6.5c0 1.5.5 3 1.5 4C9.5 11.5 10 13 10 14.5c0 1-.5 2-1 2.5-.5.5-1 .5-1 1.5 0 1.5 1.5 3.5 4 3.5s4-2 4-3.5c0-1-.5-1-.5-1.5-.5-.5-1-1.5-1-2.5 0-1.5.5-3 1.5-4 1-1 1.5-2.5 1.5-4C19 4.5 15.5 2 12 2Z" fill="white"/></svg></div>
    <div class="htext"><h1>Пакет документов</h1><p>${escHtml(clinicName)}</p></div>
    <span class="hbadge ${allSigned ? "signed" : "pending"}">${allSigned ? "✅ Подписано" : "Ожидает подписи"}</span>
  </div>

  <div class="tab-bar">${tabButtons}</div>

  <div class="container">
    ${allSigned ? `<div class="signed-banner"><h3>✅ Все документы подписаны</h3><p>Подписано ${signedDateStr}</p></div>` : ""}
    ${contracts
      .map(
        (c, i) => `
    <div class="card${i === 0 ? " active" : ""}" id="tab-panel-${i}">
      <div class="card-meta">
        <div class="meta-chip">Пациент: <span>${escHtml(patientName)}</span></div>
      </div>
      <div class="contract-body">${c.renderedHtml}</div>
    </div>`,
      )
      .join("")}
  </div>

  ${!isPreview ? `<div class="actions">
    ${!allSigned ? `<button class="btn btn-primary" id="sign-all-btn" onclick="startSign()">
      <div class="spinner"></div>
      <span class="btn-label">✍️ Подписать все (${contracts.length})</span>
    </button>` : ""}
    <button class="btn btn-secondary" onclick="downloadCurrent()">📄 PDF</button>
  </div>` : ""}

  <!-- OTP Modal -->
  <div class="otp-overlay" id="otp-overlay">
    <div class="otp-box">
      <div class="otp-handle"></div>
      <div class="otp-title">Подтверждение подписи</div>
      <div class="otp-sub">Введите 6-значный код, который мы отправили вам в WhatsApp.</div>
      <div class="otp-inputs" id="otp-inputs">
        <input class="otp-input" type="tel" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="one-time-code"/>
        <input class="otp-input" type="tel" maxlength="1" inputmode="numeric" pattern="[0-9]"/>
        <input class="otp-input" type="tel" maxlength="1" inputmode="numeric" pattern="[0-9]"/>
        <input class="otp-input" type="tel" maxlength="1" inputmode="numeric" pattern="[0-9]"/>
        <input class="otp-input" type="tel" maxlength="1" inputmode="numeric" pattern="[0-9]"/>
        <input class="otp-input" type="tel" maxlength="1" inputmode="numeric" pattern="[0-9]"/>
      </div>
      <div class="otp-error" id="otp-error"></div>
      <button class="otp-submit" id="otp-submit" onclick="submitOtp()">
        <div class="spinner"></div>
        <span class="btn-label">✅ Подписать все документы</span>
      </button>
      <div class="otp-footer">
        <span id="otp-timer">Код действителен 5:00</span>
        <span>·</span>
        <button class="otp-resend" id="otp-resend" onclick="resendOtp()" disabled>Отправить снова</button>
      </div>
    </div>
  </div>

  <script>
    var BUNDLE = '${bundleToken}';
    var TABS = ${tabsJson};
    var currentIdx = 0;
    var timerInterval = null;
    var secondsLeft = 300;

    function showTab(idx){
      document.querySelectorAll('.tab-btn').forEach(function(b,i){b.classList.toggle('active',i===idx)});
      document.querySelectorAll('.card').forEach(function(c,i){c.classList.toggle('active',i===idx)});
      currentIdx=idx;
    }

    function startSign(){
      var btn=document.getElementById('sign-all-btn');
      btn.classList.add('loading');
      fetch('/p/bundle/'+BUNDLE+'/request-otp',{method:'POST'})
        .then(function(r){return r.json();})
        .then(function(data){
          btn.classList.remove('loading');
          if(data.success){openOtpModal();}
          else{alert(data.error||'Не удалось отправить код. Попробуйте снова.');}
        })
        .catch(function(){
          btn.classList.remove('loading');
          alert('Ошибка сети. Попробуйте снова.');
        });
    }

    function openOtpModal(){
      document.getElementById('otp-overlay').classList.add('open');
      clearInputs(); setError(''); startTimer(300);
      setTimeout(function(){var f=document.querySelector('.otp-input');if(f)f.focus();},300);
    }

    function clearInputs(){document.querySelectorAll('.otp-input').forEach(function(i){i.value='';})}

    function setError(msg){
      document.getElementById('otp-error').textContent=msg;
      if(msg){
        document.querySelectorAll('.otp-input').forEach(function(i){i.classList.add('error');});
        setTimeout(function(){document.querySelectorAll('.otp-input').forEach(function(i){i.classList.remove('error');});},600);
      }
    }

    function getCode(){return Array.from(document.querySelectorAll('.otp-input')).map(function(i){return i.value;}).join('');}

    function startTimer(seconds){
      secondsLeft=seconds;
      clearInterval(timerInterval);
      document.getElementById('otp-resend').disabled=true;
      timerInterval=setInterval(function(){
        secondsLeft--;
        var m=Math.floor(secondsLeft/60),s=secondsLeft%60;
        var el=document.getElementById('otp-timer');
        if(el) el.textContent='Код действителен '+m+':'+(s<10?'0':'')+s;
        if(secondsLeft<=0){
          clearInterval(timerInterval);
          if(el) el.textContent='Код истёк';
          document.getElementById('otp-resend').disabled=false;
        }
      },1000);
    }

    function resendOtp(){
      document.getElementById('otp-resend').disabled=true;
      setError(''); clearInputs();
      fetch('/p/bundle/'+BUNDLE+'/request-otp',{method:'POST'})
        .then(function(r){return r.json();})
        .then(function(data){
          if(data.success){startTimer(300);var f=document.querySelector('.otp-input');if(f)f.focus();}
          else{setError(data.error||'Не удалось отправить код');document.getElementById('otp-resend').disabled=false;}
        })
        .catch(function(){setError('Ошибка сети');document.getElementById('otp-resend').disabled=false;});
    }

    function submitOtp(){
      var code=getCode();
      if(code.length<6){setError('Введите все 6 цифр');return;}
      var btn=document.getElementById('otp-submit');
      btn.classList.add('loading'); setError('');
      fetch('/p/bundle/'+BUNDLE+'/sign-all',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({code:code}),
      })
        .then(function(r){return r.json();})
        .then(function(data){
          btn.classList.remove('loading');
          if(data.success){clearInterval(timerInterval);location.reload();}
          else if(data.code==='OTP_EXPIRED'){setError('Код истёк. Запросите новый.');document.getElementById('otp-resend').disabled=false;}
          else{setError(data.error||'Неверный код. Попробуйте снова.');}
        })
        .catch(function(){btn.classList.remove('loading');setError('Ошибка сети. Попробуйте снова.');});
    }

    function downloadCurrent(){
      var t=TABS[currentIdx];
      if(t) window.open('/p/contract/'+t.token+'/pdf','_blank');
    }

    (function(){
      var inputs=Array.from(document.querySelectorAll('.otp-input'));
      inputs.forEach(function(inp,idx){
        inp.addEventListener('input',function(){
          var val=inp.value.replace(/[^0-9]/g,'');
          if(val.length>1){
            val.split('').slice(0,6-idx).forEach(function(ch,i){if(inputs[idx+i])inputs[idx+i].value=ch;});
            var next=inputs[Math.min(idx+val.length,5)];if(next)next.focus();
          } else {
            inp.value=val;
            if(val&&inputs[idx+1])inputs[idx+1].focus();
          }
          if(getCode().length===6)submitOtp();
        });
        inp.addEventListener('keydown',function(e){
          if(e.key==='Backspace'&&!inp.value&&inputs[idx-1]){inputs[idx-1].focus();inputs[idx-1].value='';}
        });
        inp.addEventListener('paste',function(e){
          var text=(e.clipboardData||window.clipboardData).getData('text').replace(/[^0-9]/g,'');
          e.preventDefault();
          if(text.length>=6){text.slice(0,6).split('').forEach(function(ch,i){if(inputs[i])inputs[i].value=ch;});inputs[5].focus();if(getCode().length===6)submitOtp();}
        });
      });
      document.getElementById('otp-overlay').addEventListener('click',function(e){if(e.target===this)document.getElementById('otp-overlay').classList.remove('open');});
    })();
  </script>
</body>
</html>`;
}

// GET /p/bundle/:bundleToken — public bundle page (all 4 contracts in tabs)
router.get("/p/bundle/:bundleToken", async (req: Request, res: Response, next: NextFunction) => {
  const bundleToken = String(req.params["bundleToken"]);
  try {
    const results = await repo.findContractsByBundleToken(bundleToken);
    if (!results.length) {
      return res.status(404).send(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Не найдено</title></head><body style="font-family:sans-serif;text-align:center;padding:60px 20px"><h2>Пакет документов не найден</h2><p style="color:#666">Ссылка устарела или недействительна.</p></body></html>`,
      );
    }

    const isPreview = req.query["preview"] === "1";

    if (!isPreview) {
      await repo.markBundleViewed(bundleToken).catch(() => {});
    }

    const first = results[0]!;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.send(
      buildBundlePage({
        clinicName: first.clinicName,
        patientName: first.patientName,
        bundleToken,
        isPreview,
        contracts: results.map((r) => ({
          token: r.contract.token,
          templateName: r.templateName,
          renderedHtml: r.contract.renderedHtml ?? "",
          status: r.contract.status,
          signedAt: r.contract.signedAt,
        })),
      }),
    );
  } catch (err) {
    next(err);
    return;
  }
});

// POST /p/bundle/:bundleToken/request-otp — sends 6-digit OTP to patient WhatsApp
router.post("/p/bundle/:bundleToken/request-otp", async (req: Request, res: Response, next: NextFunction) => {
  const bundleToken = String(req.params["bundleToken"]);
  try {
    const results = await repo.findContractsByBundleToken(bundleToken);
    if (!results.length) return res.status(404).json({ success: false, error: "Пакет не найден" });

    const alreadyAllSigned = results.every((r) => r.contract.status === "signed");
    if (alreadyAllSigned) {
      return res.json({ success: false, error: "Все документы уже подписаны" });
    }

    const code = generateOtpCode();
    await repo.saveOtpForBundle(bundleToken, code, otpExpiry());

    const first = results[0]!;
    const message = `🔐 Код подтверждения для подписания пакета документов:\n\n*${code}*\n\nПодпишите ${results.length} документа клиники ${first.clinicName}.\nКод действителен 5 минут. Не передавайте его третьим лицам.`;
    sendToPatient(first.contract.clinicId, first.patientPhone, message).catch((err: unknown) => {
      logger.warn({ err }, "[bundle] Failed to send OTP WhatsApp");
    });

    logger.info({ bundleToken }, "[bundle] OTP requested");
    return res.json({ success: true });
  } catch (err) {
    next(err);
    return;
  }
});

// POST /p/bundle/:bundleToken/sign-all — patient signs all documents after OTP verification
router.post("/p/bundle/:bundleToken/sign-all", async (req: Request, res: Response, next: NextFunction) => {
  const bundleToken = String(req.params["bundleToken"]);
  try {
    const results = await repo.findContractsByBundleToken(bundleToken);
    if (!results.length) {
      return res.status(404).json({ success: false, error: "Пакет не найден" });
    }

    const alreadyAllSigned = results.every((r) => r.contract.status === "signed");
    if (alreadyAllSigned) {
      return res.json({ success: true, message: "Все документы уже подписаны" });
    }

    const code = String((req.body as Record<string, unknown>)["code"] ?? "").trim();
    if (!code) return res.status(400).json({ success: false, error: "Код не указан" });

    const otpResult = await repo.verifyOtpForBundle(bundleToken, code);
    if (otpResult === "expired") {
      return res.status(400).json({ success: false, code: "OTP_EXPIRED", error: "Код истёк. Запросите новый." });
    }
    if (otpResult !== "ok") {
      return res.status(400).json({ success: false, code: "OTP_INVALID", error: "Неверный код. Попробуйте снова." });
    }

    const ip = getClientIp(req);
    const signed = await repo.markBundleSigned(bundleToken, ip);
    if (!signed.length) {
      return res.status(400).json({ success: false, error: "Не удалось подписать" });
    }

    const first = results[0]!;
    const signedDateStr = new Date().toLocaleString("ru-RU", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    const confirmMsg = `✅ Пакет документов подписан!\n\nСпасибо, ${first.patientName}! Все ${signed.length} документа успешно подписаны ${signedDateStr}.\n\nКлиника ${first.clinicName} желает вам скорейшего выздоровления!`;

    sendToPatient(first.contract.clinicId, first.patientPhone, confirmMsg).catch((err: unknown) => {
      logger.warn({ err }, "[bundle] Failed to send bundle signing confirmation");
    });

    return res.json({ success: true });
  } catch (err) {
    next(err);
    return;
  }
});

export default router;
