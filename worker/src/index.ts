import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { env, supabase, MODEL, MAX_BODY, PROCESSED, AUTO_ON, DOCS_ON, MIN_CONF } from "./config.js";
import { triar, type Membro, type Modelo, type ItemChecklist } from "./triage.js";
import { enviarResposta } from "./mailer.js";
import {
  emailDoRemetente, nomeDoRemetente, ehAutomatico, motivoBloqueio,
  montarTexto, limpa, reSubject, refOk,
} from "./regras.js";
import { rotinaDocumentos } from "./docs.js";
import { SELF } from "./config.js";

async function carregarMembros(): Promise<Membro[]> {
  const { data, error } = await supabase.from("membros").select("id,nome,email,areas").eq("ativo", true);
  if (error) throw error;
  return data ?? [];
}
async function carregarModelos(): Promise<Modelo[]> {
  const { data, error } = await supabase
    .from("respostas_modelo")
    .select("id,titulo,quando_usar,corpo,auto_enviar,encerra_demanda")
    .eq("ativo", true).eq("finalidade", "resposta");
  if (error) throw error;
  return data ?? [];
}
async function carregarChecklist(): Promise<ItemChecklist[]> {
  const { data, error } = await supabase
    .from("checklist_documentos").select("id,area,tipo,documento").eq("ativo", true);
  if (error) throw error;
  return data ?? [];
}

async function concluir(client: ImapFlow, uid: number) {
  await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
  if (PROCESSED) {
    try { await client.messageMove(String(uid), PROCESSED, { uid: true }); }
    catch (e) { console.warn("Nao foi possivel mover para", PROCESSED, e); }
  }
}

// O e-mail e resposta a uma conversa ja registrada (ex.: pessoa enviando os documentos)?
async function acharConversa(p: ParsedMail) {
  const refs = [
    p.inReplyTo,
    ...(Array.isArray(p.references) ? p.references : p.references ? [p.references] : []),
  ].filter((x): x is string => !!x);
  if (!refs.length) return null;
  for (const col of ["message_id", "docs_solicitacao_message_id"]) {
    const { data } = await supabase.from("demandas").select("id,docs_status").in(col, refs).limit(1);
    if (data?.[0]) return data[0];
  }
  return null;
}

// A resposta NAO passa pela IA: so e registrada no historico para revisao humana.
async function registrarRetorno(pai: { id: string; docs_status: string | null }, p: ParsedMail) {
  const anexos = (p.attachments ?? []).map((a) => a.filename).filter(Boolean);
  await supabase.from("historico").insert({
    demanda_id: pai.id,
    evento: "resposta_recebida",
    detalhe: `De: ${p.from?.text ?? ""}\nAnexos: ${anexos.join(", ") || "nenhum"}\n${(p.text ?? "").slice(0, 1500)}`,
  });
  const patch: Record<string, unknown> = { triagem_revisada: false };
  if (pai.docs_status === "solicitado" || pai.docs_status === "sem_retorno") {
    patch.docs_status = "recebido"; // um humano confere se o conteudo dos anexos esta correto
    patch.status = "em_analise";
  }
  await supabase.from("demandas").update(patch).eq("id", pai.id);
}

async function ciclo() {
  const [membros, modelos, checklist] = await Promise.all([
    carregarMembros(), carregarModelos(), carregarChecklist(),
  ]);
  const client = new ImapFlow({
    host: env("ZIMBRA_HOST"),
    port: Number(env("ZIMBRA_PORT", "993")),
    secure: true,
    auth: { user: env("ZIMBRA_USER"), pass: env("ZIMBRA_PASSWORD") },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock(env("ZIMBRA_MAILBOX", "INBOX"));
  try {
    const uids = (await client.search({ seen: false }, { uid: true })) || [];
    console.log(`[${new Date().toISOString()}] ${uids.length} e-mail(s) nao lido(s)`);

    for (const uid of uids) {
      try {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);

        const messageId = parsed.messageId ?? `uid-${uid}-${parsed.date?.toISOString() ?? ""}`;
        const addr = emailDoRemetente(parsed);

        const { data: existe } = await supabase
          .from("demandas").select("id").eq("message_id", messageId).maybeSingle();
        if (existe) { await concluir(client, uid); continue; }

        const pai = await acharConversa(parsed);
        if (pai) { await registrarRetorno(pai, parsed); await concluir(client, uid); continue; }

        const remetente = parsed.from?.text ?? "desconhecido";
        const assunto = parsed.subject ?? "(sem assunto)";
        const corpo = (parsed.text ?? "").slice(0, MAX_BODY);
        const recebidoEm = parsed.date ?? new Date();
        // somente os NOMES dos anexos vao para a IA; o conteudo nao e lido
        const anexos = (parsed.attachments ?? []).map((a) => a.filename).filter((x): x is string => !!x);

        const t = await triar({ remetente, assunto, corpo, recebidoEm, anexos }, membros, modelos, checklist, MODEL);
        const resp = membros.find((m) => m.email.toLowerCase() === (t.responsavel_email ?? "").toLowerCase());
        const modelo = modelos.find((m) => m.id === t.modelo_id) ?? null;
        // so aceita ids que existem no checklist; o texto pedido vem do checklist, nao da IA
        const faltantes = t.docs_faltantes
          .map((id) => checklist.find((c) => c.id === id)?.documento)
          .filter((x): x is string => !!x);

        const podePedirDocs =
          DOCS_ON && faltantes.length > 0 && !t.alerta_injecao && t.confianca >= MIN_CONF &&
          !!addr && addr !== SELF && !ehAutomatico(parsed, addr);

        const { data: nova, error } = await supabase.from("demandas").insert({
          message_id: messageId,
          remetente, remetente_email: addr, assunto, corpo,
          recebido_em: recebidoEm.toISOString(),
          area: t.area, tipo: t.tipo, urgencia: t.urgencia, resumo: t.resumo,
          prazo_fatal: t.prazo_fatal, prazo_origem: t.prazo_origem,
          responsavel_id: resp?.id ?? null,
          justificativa_atribuicao: t.justificativa_atribuicao,
          rascunho_resposta: t.rascunho_resposta,
          confianca: t.confianca,
          alerta_injecao: t.alerta_injecao,
          alerta_detalhe: t.alerta_detalhe,
          resposta_modelo_id: modelo?.id ?? null,
          docs_faltantes: faltantes,
          docs_status: podePedirDocs ? "pendente_envio" : "nenhum",
          triagem_revisada: false, // a IA sugere, uma pessoa confirma
        }).select("id").single();
        if (error) throw error;

        await supabase.from("historico").insert({
          demanda_id: nova.id,
          evento: "triagem_ia",
          detalhe: t.alerta_injecao
            ? `ALERTA: possivel injecao de prompt no e-mail. ${t.alerta_detalhe ?? ""}`
            : `Triagem automatica (confianca ${t.confianca}). IA analisou texto e nomes dos anexos, nao o conteudo.`,
        });
        if (podePedirDocs) {
          await supabase.from("historico").insert({
            demanda_id: nova.id, evento: "documentos_identificados",
            detalhe: `Pedido sera enviado em horario comercial: ${faltantes.join("; ")}`,
          });
        }

        // resposta automatica com modelo aprovado (se nao houver pedido de documentos)
        if (AUTO_ON && modelo?.auto_enviar && t.resposta_automatica_segura && !podePedirDocs && faltantes.length === 0) {
          const bloqueio = await motivoBloqueio({
            confianca: t.confianca, injecao: t.alerta_injecao, urgencia: t.urgencia, addr, parsed,
          });
          if (bloqueio) {
            await supabase.from("historico").insert({
              demanda_id: nova.id, evento: "resposta_automatica_bloqueada", detalhe: bloqueio,
            });
          } else {
            try {
              const texto = montarTexto(modelo.corpo, {
                nome: nomeDoRemetente(parsed) || "prezado(a)",
                assunto: limpa(assunto), lista_documentos: "",
              });
              const ref = refOk(messageId);
              await enviarResposta({
                to: addr!, subject: reSubject(limpa(assunto)), text: texto,
                inReplyTo: ref, references: ref ? [ref] : undefined,
              });
              const patch: Record<string, unknown> = {
                resposta_automatica_enviada: true, resposta_enviada_em: new Date().toISOString(),
              };
              if (modelo.encerra_demanda) patch.status = "respondida";
              await supabase.from("demandas").update(patch).eq("id", nova.id);
              await supabase.from("historico").insert({
                demanda_id: nova.id, evento: "resposta_automatica", detalhe: `Modelo: ${modelo.titulo}`,
              });
            } catch (e) {
              await supabase.from("historico").insert({
                demanda_id: nova.id, evento: "falha_resposta_automatica", detalhe: String(e).slice(0, 300),
              });
            }
          }
        }

        await concluir(client, uid);
        console.log(`  ok: ${assunto} -> ${t.area}/${t.urgencia}${t.alerta_injecao ? " [ALERTA INJECAO]" : ""}`);
      } catch (e) {
        // nao marca como lido: sera tentado novamente no proximo ciclo
        console.error(`  erro no UID ${uid}:`, e);
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }
}

const once = process.argv.includes("--once");
const intervalo = Number(env("POLL_INTERVAL_SECONDS", "120")) * 1000;

async function main() {
  do {
    try { await ciclo(); } catch (e) { console.error("Falha no ciclo:", e); }
    try { await rotinaDocumentos(); } catch (e) { console.error("Falha na rotina de documentos:", e); }
    if (once) break;
    await new Promise((r) => setTimeout(r, intervalo));
  } while (true);
}
main();
