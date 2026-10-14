import "dotenv/config";
import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST || process.env.ZIMBRA_HOST;
const port = Number(process.env.SMTP_PORT || "465");
const user = process.env.SMTP_USER || process.env.ZIMBRA_USER;
const pass = process.env.SMTP_PASSWORD || process.env.ZIMBRA_PASSWORD;

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: { user, pass },
});

// Retorna o Message-ID do e-mail enviado (usado para reconhecer a resposta da pessoa)
export async function enviarResposta(p: {
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string[];
}): Promise<string> {
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || user,
    to: p.to,
    subject: p.subject,
    text: p.text,
    inReplyTo: p.inReplyTo,
    references: p.references,
    headers: {
      // evita loops com outros robos e respondedores automaticos
      "Auto-Submitted": "auto-replied",
      "X-Auto-Response-Suppress": "All",
      Precedence: "bulk",
    },
  });
  return info.messageId as string;
}
