import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createRequire } from "module";
import path from "path";
import { ContractsRepository } from "../modules/contracts/contracts.repository";
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

/** Strip HTML tags and decode basic entities for plain-text PDF body. */
function htmlToPlainLines(html: string): string[] {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  return text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
}

async function generatePdfBuffer(opts: {
  templateName: string;
  patientName: string;
  clinicName: string;
  renderedHtml: string;
  signedAt: string | null;
}): Promise<Buffer> {
  const pdfmake = getPdfInstance();
  const lines = htmlToPlainLines(opts.renderedHtml);

  const bodyContent = lines.map((line) => ({
    text: line,
    style: "body",
    margin: [0, 0, 0, 4] as [number, number, number, number],
  }));

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
}): string {
  const { templateName, patientName, clinicName, renderedHtml, token, status, signedAt } = opts;
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
    .contract-body { line-height: 1.7; font-size: 14px; color: #3a3a3c; }
    .contract-body p { margin-bottom: 8px; }
    .filled-field { background: #fff9c4; border-radius: 3px; padding: 0 2px; font-weight: 700; font-style: normal; }
    .actions { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid #e5e5ea; padding: 16px 20px; display: flex; gap: 12px; }
    .btn { flex: 1; height: 50px; border-radius: 14px; border: none; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: opacity 0.15s; text-decoration: none; }
    .btn:active { opacity: 0.8; }
    .btn-primary { background: #6bcb3a; color: #fff; }
    .btn-secondary { background: #f2f2f7; color: #3a3a3c; }
    .signed-banner { background: #d4edda; border: 1px solid #c3e6cb; border-radius: 14px; padding: 16px 20px; text-align: center; margin-bottom: 16px; }
    .signed-banner h3 { font-size: 16px; font-weight: 700; color: #155724; margin-bottom: 4px; }
    .signed-banner p { font-size: 13px; color: #155724; opacity: 0.85; }
    #sign-btn.loading { opacity: 0.7; pointer-events: none; }
    .spinner { width: 18px; height: 18px; border: 2.5px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; display: none; }
    #sign-btn.loading .spinner { display: block; }
    #sign-btn.loading .btn-label { display: none; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 480px) { .container { padding: 16px 12px 110px; } .card { padding: 18px 14px; } }
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

  <div class="actions">
    ${!isSigned ? `
    <button class="btn btn-primary" id="sign-btn" onclick="signContract()">
      <div class="spinner"></div>
      <span class="btn-label">✍️ Подписать</span>
    </button>` : ""}
    <a class="btn btn-secondary" href="/p/contract/${token}/pdf" download="${escHtml(templateName)}.pdf">
      📄 Скачать PDF
    </a>
  </div>

  <script>
    async function signContract() {
      const btn = document.getElementById('sign-btn');
      btn.classList.add('loading');
      try {
        const res = await fetch('/p/contract/${token}/sign', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          location.reload();
        } else {
          alert(data.error || 'Ошибка при подписании');
          btn.classList.remove('loading');
        }
      } catch {
        alert('Ошибка сети. Попробуйте снова.');
        btn.classList.remove('loading');
      }
    }
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

    if (contract.status === "sent") {
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
    }));
  } catch (err) {
    next(err);
    return;
  }
});

// POST /p/contract/:token/sign — patient clicks "Sign"
router.post("/p/contract/:token/sign", async (req: Request, res: Response, next: NextFunction) => {
  const token = String(req.params["token"]);
  try {
    const result = await repo.findContractByToken(token);
    if (!result) return res.status(404).json({ success: false, error: "Договор не найден" });

    if (result.contract.status === "signed") {
      return res.json({ success: true, message: "Уже подписан" });
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

export default router;
