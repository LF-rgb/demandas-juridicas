import type { ParsedMail } from "mailparser";
import { supabase, EMPRESA, MIN_CONF, MAX_PER_SENDER_DAY, BIZ_START, BIZ_END, TZ, SELF } from "./config.js";

export const limpa = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
export const reSubject = (s: string) => (/^re:/i.test(s) ? s : `Re: ${s}`);
// Message-ID valido tem formato <...>; os gerados como fallback (uid-...) nao servem para threading
export const refOk = (id?: string | null) => (id && id.startsWith("<") ? id : undefined);

export function emailDoRemetente(p: ParsedMail): string | null {
  const a = p.from?.value?.[0]?.address;
  return a ? a.toLowerCase() : null;
}
export function nomeDoRemetente(p: ParsedMail): string {
  return limpa(p.from?.value?.[0]?.name ?? "");
}
export function nomeDe(remetente: string): string {
  const m = remetente.match(/^"?([^"<]+?)"?\s*</);
  return m ? limpa(m[1]) : "";
}

export function ehAutomatico(p: ParsedMail, addr: string | null): boolean {
  const h = (k: string) => String(p.headers.get(k) ?? "").toLowerCase();
  const auto = h("auto-submitted");
  if (auto && auto !== "no") return true;
  if (["bulk", "list", "junk"].includes(h("precedence"))) return true;
  if (h("x-auto-response-suppress")) return true;
  if (p.headers.has("list-id")) return true;
  if (!addr) return true;
  return /(^|[._-])(no-?reply|nao-?responda|mailer-daemon|postmaster|bounce)/i.test(addr.split("@")[0]);
}

// true somente em dias uteis, dentro do horario comercial do fuso configurado
export function dentroDoHorario(agora = new Date()): boolean {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour: "numeric", hour12: false, weekday: "short",
  }).formatToParts(agora);
  const hora = Number(partes.find((x) => x.type === "hour")?.value ?? "0") % 24;
  const dia = partes.find((x) => x.type === "weekday")?.value ?? "";
  return !["Sat", "Sun"].includes(dia) && hora >= BIZ_START && hora < BIZ_END;
}

export async function limiteExcedido(addr: string): Promise<boolean> {
  const desde = new Date(Date.now() - 864e5).toISOString();
  const { count } = await supabase
    .from("dj_demandas")
    .select("id", { count: "exact", head: true })
    .eq("empresa_cliente_id", EMPRESA)
    .eq("remetente_email", addr)
    .eq("resposta_automatica_enviada", true)
    .gte("resposta_enviada_em", desde);
  return (count ?? 0) >= MAX_PER_SENDER_DAY;
}

// Retorna o motivo do bloqueio, ou null se pode enviar resposta automatica
export async function motivoBloqueio(p: {
  confianca: number; injecao: boolean; urgencia: string; addr: string | null; parsed: ParsedMail;
}): Promise<string | null> {
  if (p.injecao) return "possivel injecao de prompt no e-mail";
  if (p.urgencia === "critica") return "urgencia critica exige atendimento humano";
  if (p.confianca < MIN_CONF) return `confianca ${p.confianca} abaixo do minimo ${MIN_CONF}`;
  if (!p.addr) return "remetente sem endereco";
  if (p.addr === SELF) return "remetente e a propria caixa";
  if (ehAutomatico(p.parsed, p.addr)) return "e-mail automatico, de lista ou noreply";
  if (await limiteExcedido(p.addr)) return "limite diario de respostas por remetente";
  return null;
}

export function montarTexto(corpo: string, vars: Record<string, string>): string {
  const t = corpo.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
  return `${t}\n\nMensagem enviada automaticamente pela equipe Jurídica e de Compliance do FRISA. Para falar com uma pessoa, basta responder a este e-mail.`;
}
