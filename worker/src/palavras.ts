// Camada de regras por palavra-chave: garante urgencia minima e sugere areas, independente da IA.
// A IA continua decidindo; aqui so se "puxa para cima" (nunca reduz) a urgencia.
export type Urgencia = "baixa" | "media" | "alta" | "critica";
const ORDEM: Urgencia[] = ["baixa", "media", "alta", "critica"];

type Grupo = { piso: Urgencia; area?: string; termos: string[] };

const GRUPOS: Grupo[] = [
  { piso: "critica", termos: [
    "liminar", "tutela de urgencia", "tutela antecipada", "tutela provisoria", "sisbajud", "bacenjud", "penhora online",
    "bloqueio de valores", "bloqueio judicial", "bloqueio de contas", "mandado de busca", "busca e apreensao",
    "mandado de prisao", "interdicao", "embargo de obra", "prazo fatal", "ultimo dia do prazo", "prazo final hoje",
    "cumprimento imediato", "sob pena de multa diaria", "astreinte", "decisao liminar", "arresto",
  ]},
  { piso: "alta", area: "trabalhista", termos: [
    "reclamacao trabalhista", "reclamante", "reclamada", "vara do trabalho", "ministerio do trabalho",
    "auditor fiscal do trabalho", "acidente de trabalho", "cat ", "rescisao indireta", "ministerio publico do trabalho", "termo de ajustamento de conduta", "inquerito civil", "assedio moral", "assedio sexual", "nr-12", "nr 12", ]},
  { piso: "alta", area: "civel", termos: [
    "citacao", "intimacao", "mandado de citacao", "mandado de intimacao", "audiencia", "cumprimento de sentenca", "penhora", "peticao inicial", "contestacao", "apelacao", "processo n", "autos n", "vara civel", "juizado especial", "tribunal de justica", "dje", "diario da justica",
    "recuperacao judicial", "falencia", "cartorio de protesto", "notificacao extrajudicial", "notificacao judicial", "interpelacao",
  ]},
  { piso: "alta", area: "tributario", termos: [
    "auto de infracao", "receita federal", "sefaz", "fazenda estadual", "fazenda municipal", "pgfn", "divida ativa",
    "execucao fiscal", "cda", "autuacao fiscal", "icms", "pis/cofins", "irpj", "csll", "darf", "intimacao fiscal",
    "termo de inicio de fiscalizacao", "malha fiscal", "compensacao tributaria",
  ]},
  { piso: "alta", area: "consumidor", termos: [
    "procon", "senacon", "consumidor.gov", "juizado especial civel", "intoxicacao alimentar",
    "corpo estranho", "produto improprio", "vicio do produto", "dano ao consumidor",
  ]},
  { piso: "alta", area: "regulatorio", termos: [
    "ibama", "ibram", "iema", "ima ", "cetesb", "mapa ", "ministerio da agricultura", "sif ", "sie ", "sisbi",
    "vigilancia sanitaria", "anvisa", "defesa agropecuaria", "idaf", "auto de interdicao",
    "embargo", "termo de ajustamento", "multa ambiental",
    "agencia reguladora", "anp", "antt", "aneel",
  ]},
  { piso: "alta", area: "lgpd", termos: [
    "anpd", "vazamento de dados", "incidente de seguranca", "violacao de dados",
  ]},
  { piso: "alta", area: "penal", termos: [
    "delegacia", "policia civil", "policia federal", "inquerito policial", "boletim de ocorrencia", "queixa-crime",
    "denuncia criminal", "estelionato", "crime ambiental",
    "lavagem de dinheiro", "corrupcao", "propina", "suborno", ]},
  { piso: "alta", area: "compliance", termos: [
    "canal de denuncias", "denuncia anonima", "conflito de interesses", "antissuborno", "anticorrupcao", "lei anticorrupcao",
    "cgu", "tcu", "pad ", "due diligence", "lista suja", "trabalho escravo", "desmatamento", "embargo ambiental", "fornecedor irregular", ]},
  { piso: "alta", area: "concorrencial", termos: ["cade", "cartel", "infracao a ordem economica", "concorrencia desleal"] },
  { piso: "media", area: "auditoria", termos: [
    "auditoria", "auditoria interna", "controle interno", "controles internos", "evidencias de controle", "auditor", "prestacao de contas", "reembolso", "divergencia de caixa", "conferencia de nota", "inconsistencia contabil", "relatorio de auditoria",
  ]},
  { piso: "media", area: "contratos", termos: [
    "contrato", "aditivo", "distrato", "rescisao contratual", "minuta", "clausula", "revisao contratual", "renovacao de contrato",
    "termo de confidencialidade", "nda", "procuracao", "acordo", "memorando de entendimento", "carta proposta",
    "inadimplemento", "multa contratual", "reajuste", "garantia", "fianca", "aval",
  ]},
  { piso: "media", area: "societario", termos: [
    "assembleia", "ata de reuniao", "alteracao contratual", "junta comercial", "estatuto social", "conselho de administracao",
    "acionista", "quotista", "fusao", "incorporacao", "cisao", "holding", "registro de marca",
  ]},
  { piso: "media", area: "propriedade_intelectual", termos: [
    "inpi", "marca registrada", "patente", "direito autoral", "uso indevido de marca", "pirataria", "dominio", "registro.br",
  ]},
  { piso: "media", area: "imobiliario", termos: [
    "escritura", "matricula do imovel", "cartorio de registro de imoveis", "locacao", "aluguel", "usucapiao", "iptu",
    "reintegracao de posse", "arrendamento", "comodato", "itbi", "desapropriacao",
  ]},
  { piso: "media", area: "licitacoes", termos: ["licitacao", "pregao", "edital", "ata de registro de precos", "tomada de precos", "dispensa de licitacao"] },
  { piso: "media", area: "previdenciario", termos: ["inss", "previdencia", "beneficio previdenciario", "ppp", "ltcat", "fap", "rat"] },
  { piso: "media", termos: ["parecer", "consulta juridica", "opiniao legal", "analise juridica", "orientacao juridica", "duvida juridica"] },
  { piso: "media", termos: ["sindicato", "greve", "horas extras", "verbas rescisorias", "trt", "tst", "mpt", "insalubridade", "periculosidade", "recurso", "execucao", "embargos", "sentenca", "acordao", "protesto", "negativacao", "serasa", "spc", "reclame aqui", "recall", "fiscalizacao", "licenciamento", "outorga", "licenca ambiental", "lgpd", "dados pessoais", "exclusao de dados", "portabilidade de dados", "dpo", "encarregado", "direito do titular", "titular de dados", "fraude", "operacao", "cpi", "ministerio publico", "promotoria", "furto", "trabalho analogo", "codigo de conduta", "auditoria externa", "sancao"] },
];

const norm = (s: string) =>
  ` ${s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ")} `;

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Palavra inteira (com plural simples): "cisao" nao casa dentro de "decisao".
const REGEX = new Map<string, RegExp>();
function casa(texto: string, termo: string): boolean {
  let r = REGEX.get(termo);
  if (!r) {
    r = new RegExp(`(^|[^a-z0-9])${esc(termo.trim())}s?([^a-z0-9]|$)`);
    REGEX.set(termo, r);
  }
  return r.test(texto);
}

export function analisarPalavras(texto: string): { piso: Urgencia; areas: string[]; achadas: string[] } {
  const t = norm(texto);
  let piso: Urgencia = "baixa";
  const areas = new Set<string>();
  const achadas: string[] = [];
  for (const g of GRUPOS) {
    for (const termo of g.termos) {
      if (casa(t, termo)) {
        achadas.push(termo.trim());
        if (g.area) areas.add(g.area);
        if (ORDEM.indexOf(g.piso) > ORDEM.indexOf(piso)) piso = g.piso;
      }
    }
  }
  return { piso, areas: [...areas], achadas: [...new Set(achadas)].slice(0, 15) };
}

export const maiorUrgencia = (a: Urgencia, b: Urgencia): Urgencia =>
  ORDEM.indexOf(a) >= ORDEM.indexOf(b) ? a : b;

// Termos que, sozinhos, indicam auditoria interna (vai para quem tem a area "auditoria").
export const TERMOS_AUDITORIA = ["auditoria interna", "controle interno", "controles internos", "evidencias de controle", "relatorio de auditoria", "reembolso", "prestacao de contas", "divergencia de caixa", "conferencia de nota", "inconsistencia contabil"];
