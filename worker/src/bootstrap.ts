// Carrega a conexao salva no ComplyFlow (/demandas/configuracao > Conexao) e a injeta em process.env
// ANTES dos demais modulos lerem a configuracao. Valores ja definidos no .env tem prioridade.
import "dotenv/config";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function decifrar(txt: string, chave: Buffer): string {
  const [iv, tag, ct] = txt.split(".").map((p) => Buffer.from(p, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", chave, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const empresa = process.env.EMPRESA_CLIENTE_ID;
if (url && key && empresa) {
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.from("dj_conexao").select("valores,segredos").eq("empresa_cliente_id", empresa).maybeSingle();
  if (error) console.warn("Nao foi possivel ler a conexao no ComplyFlow:", error.message);
  if (data) {
    const chave = crypto.createHash("sha256").update(`dj-conexao:v1:${key}`).digest();
    const aplicar = (k: string, v: string) => { if (!process.env[k]) process.env[k] = v; };
    for (const [k, v] of Object.entries((data.valores ?? {}) as Record<string, string>)) aplicar(k, v);
    for (const [k, v] of Object.entries((data.segredos ?? {}) as Record<string, string>)) {
      try { aplicar(k, decifrar(v, chave)); }
      catch { console.warn(`Segredo ${k} nao pode ser decifrado (a service_role mudou?). Salve-o de novo no site.`); }
    }
    console.log("Conexao carregada do ComplyFlow.");
  }
}
