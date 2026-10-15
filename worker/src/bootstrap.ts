// Carrega a conexao salva no ComplyFlow (/demandas/configuracao > Conexao) e a injeta em process.env
// ANTES dos demais modulos lerem a configuracao. Valores ja definidos no .env tem prioridade.
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const empresa = process.env.EMPRESA_CLIENTE_ID;
if (url && key && empresa) {
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.from("dj_conexao").select("valores,segredos").eq("empresa_cliente_id", empresa).maybeSingle();
  if (error) console.warn("Nao foi possivel ler a conexao no ComplyFlow:", error.message);
  if (data) {
    const aplicar = (k: string, v: string) => { if (!process.env[k]) process.env[k] = v; };
    for (const [k, v] of Object.entries((data.valores ?? {}) as Record<string, string>)) aplicar(k, v);
    for (const [k, v] of Object.entries((data.segredos ?? {}) as Record<string, string>)) {
      if (!String(v).startsWith("v2:")) { console.warn(`Segredo ${k} esta no formato antigo. Digite-o de novo no site (Conexao).`); continue; }
      const { data: claro, error: e } = await db.rpc("dj_decifrar", { txt: v });
      if (e || !claro) console.warn(`Segredo ${k} nao pode ser decifrado: ${e?.message ?? "vazio"}`);
      else aplicar(k, claro as string);
    }
    console.log("Conexao carregada do ComplyFlow.");
  }
}
