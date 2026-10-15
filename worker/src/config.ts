import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

export const env = (k: string, d?: string) => {
  const v = process.env[k] ?? d;
  if (v === undefined || v === "") throw new Error(`Variavel ${k} nao definida`);
  return v;
};
const num = (k: string, d: number) => {
  const v = Number(process.env[k] ?? d);
  return Number.isFinite(v) ? v : d;
};

export const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

export const MODEL = env("GEMINI_MODEL", "gemini-3.8-flash");
export const MAX_BODY = num("MAX_BODY_CHARS", 20000);
export const PROCESSED = process.env.ZIMBRA_PROCESSED_FOLDER ?? "";

// travas: tudo comeca desligado
export const AUTO_ON = process.env.AUTO_REPLY_ENABLED === "true";
export const DOCS_ON = process.env.DOCS_REQUEST_ENABLED === "true";
export const MIN_CONF = num("AUTO_REPLY_MIN_CONFIDENCE", 0.85);
export const MAX_PER_SENDER_DAY = num("AUTO_REPLY_MAX_PER_SENDER_DAY", 2);

// pedido de documentos
export const DOCS_REMINDER_DAYS = num("DOCS_REMINDER_DAYS", 3);
export const DOCS_MAX_REMINDERS = num("DOCS_MAX_REMINDERS", 2);
export const BIZ_START = num("BUSINESS_HOUR_START", 8);
export const BIZ_END = num("BUSINESS_HOUR_END", 18);
export const TZ = process.env.TIMEZONE ?? "America/Sao_Paulo";

export const SELF = (process.env.SMTP_USER ?? process.env.ZIMBRA_USER ?? "").toLowerCase();

// Empresa-cliente do ComplyFlow dona desta caixa de e-mail (profiles.empresa_cliente_id).
export const EMPRESA = env("EMPRESA_CLIENTE_ID");
