import { supabase, EMPRESA, DOCS_ON, DOCS_REMINDER_DAYS, DOCS_MAX_REMINDERS } from "./config.js";
import { enviarResposta } from "./mailer.js";
import { dentroDoHorario, limiteExcedido, montarTexto, limpa, reSubject, refOk, nomeDe } from "./regras.js";

type ModeloTexto = { titulo: string; corpo: string };

async function modelo(finalidade: string): Promise<ModeloTexto | null> {
  const { data } = await supabase
    .from("dj_respostas_modelo")
    .select("titulo,corpo")
    .eq("empresa_cliente_id", EMPRESA)
    .eq("finalidade", finalidade)
    .eq("ativo", true)
    .eq("auto_enviar", true)
    .limit(1)
    .maybeSingle();
  return data;
}

const lista = (docs: string[]) => docs.map((d, i) => `${i + 1}. ${d}`).join("\n");

// Roda a cada ciclo. So envia em dia util e horario comercial ("quando for a hora").
export async function rotinaDocumentos() {
  if (!DOCS_ON || !dentroDoHorario()) return;

  const pedido = await modelo("solicitacao_documentos");
  const lembrete = await modelo("lembrete_documentos");

  // 1) primeiro pedido de documentos
  if (pedido) {
    const { data: pendentes } = await supabase
      .from("dj_demandas").select("*").eq("empresa_cliente_id", EMPRESA)
      .eq("docs_status", "pendente_envio").eq("alerta_injecao", false).limit(20);

    for (const d of pendentes ?? []) {
      try {
        if (!d.remetente_email || (d.docs_faltantes ?? []).length === 0) continue;
        if (await limiteExcedido(d.remetente_email)) continue; // tenta de novo no proximo dia
        const texto = montarTexto(pedido.corpo, {
          nome: nomeDe(d.remetente) || "prezado(a)",
          assunto: limpa(d.assunto),
          lista_documentos: lista(d.docs_faltantes),
        });
        const ref = refOk(d.message_id);
        const mid = await enviarResposta({
          to: d.remetente_email, subject: reSubject(limpa(d.assunto)), text: texto,
          inReplyTo: ref, references: ref ? [ref] : undefined,
        });
        const agora = new Date().toISOString();
        await supabase.from("dj_demandas").update({
          docs_status: "solicitado", docs_solicitados_em: agora, docs_ultimo_contato_em: agora,
          docs_lembretes: 0, docs_solicitacao_message_id: mid, status: "aguardando_terceiro",
          resposta_automatica_enviada: true, resposta_enviada_em: agora,
        }).eq("id", d.id);
        await supabase.from("dj_historico").insert({
          empresa_cliente_id: EMPRESA,
          demanda_id: d.id, evento: "solicitacao_documentos", detalhe: d.docs_faltantes.join("; "),
        });
        console.log(`  docs solicitados: ${d.assunto}`);
      } catch (e) {
        console.error("  falha ao solicitar documentos:", e);
        await supabase.from("dj_historico").insert({
          empresa_cliente_id: EMPRESA,
          demanda_id: d.id, evento: "falha_solicitacao_documentos", detalhe: String(e).slice(0, 300),
        });
      }
    }
  }

  // 2) lembretes e encerramento por falta de retorno
  if (lembrete) {
    const limite = new Date(Date.now() - DOCS_REMINDER_DAYS * 864e5).toISOString();
    const { data: vencidas } = await supabase
      .from("dj_demandas").select("*").eq("empresa_cliente_id", EMPRESA)
      .eq("docs_status", "solicitado").lte("docs_ultimo_contato_em", limite).limit(20);

    for (const d of vencidas ?? []) {
      try {
        if (d.docs_lembretes >= DOCS_MAX_REMINDERS) {
          await supabase.from("dj_demandas")
            .update({ docs_status: "sem_retorno", triagem_revisada: false }).eq("id", d.id);
          await supabase.from("dj_historico").insert({
          empresa_cliente_id: EMPRESA,
            demanda_id: d.id, evento: "sem_retorno_documentos",
            detalhe: `Sem resposta apos ${d.docs_lembretes} lembrete(s). Requer contato humano.`,
          });
          continue;
        }
        const texto = montarTexto(lembrete.corpo, {
          nome: nomeDe(d.remetente) || "prezado(a)",
          assunto: limpa(d.assunto),
          lista_documentos: lista(d.docs_faltantes),
        });
        const refs = [refOk(d.message_id), refOk(d.docs_solicitacao_message_id)].filter((x): x is string => !!x);
        await enviarResposta({
          to: d.remetente_email, subject: reSubject(limpa(d.assunto)), text: texto,
          inReplyTo: refs[refs.length - 1], references: refs,
        });
        await supabase.from("dj_demandas").update({
          docs_lembretes: d.docs_lembretes + 1, docs_ultimo_contato_em: new Date().toISOString(),
        }).eq("id", d.id);
        await supabase.from("dj_historico").insert({
          empresa_cliente_id: EMPRESA,
          demanda_id: d.id, evento: "lembrete_documentos", detalhe: `Lembrete ${d.docs_lembretes + 1}`,
        });
      } catch (e) {
        console.error("  falha no lembrete:", e);
      }
    }
  }
}
