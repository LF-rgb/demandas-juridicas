await import("./bootstrap.js");
const nodemailer = (await import("nodemailer")).default;
const host = process.env.SMTP_HOST || (process.env.ZIMBRA_HOST ?? "").replace(/^imap\./, "smtp.");
const port = Number(process.env.SMTP_PORT || "465");
const user = (process.env.SMTP_USER || process.env.ZIMBRA_USER)!;
const pass = (process.env.SMTP_PASSWORD || process.env.ZIMBRA_PASSWORD)!;
const t = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
const para = process.env.DESTINO || "demandas.frisa@gmail.com";
const testes: [string, string][] = [
  ["Duvida sobre ferias coletivas", "Ola. Podemos conceder ferias coletivas em dezembro para toda a fabrica? Quais os prazos de aviso ao sindicato e ao Ministerio do Trabalho? Obrigado, RH."],
  ["Relato de assedio moral por supervisor", "Boa tarde. Uma empregada do setor de embalagem procurou o RH relatando ofensas e humilhacoes reiteradas por parte do supervisor. Como devemos proceder? Ela pediu sigilo."],
  ["Intimacao: audiencia trabalhista dia 22/10", "Prezados, recebemos no RH a intimacao do processo n 0001234-56.2026.5.17.0001 com audiencia designada para 22/10. Precisamos de orientacao e de preposto com urgencia."],
  ["Pedido de ex-empregado para apagar dados", "Um ex-empregado nos enviou e-mail pedindo a exclusao de todos os seus dados pessoais, com base na LGPD. Podemos excluir tudo? Ha obrigacao de guarda?"],
  ["Pedido de revisao de contrato de prestacao de servicos", "Bom dia. Precisamos que o juridico revise o contrato de prestacao de servicos de transporte anexo (contrato_transporte.pdf) antes da assinatura, prevista para sexta."],
  ["Processo 0001234-56.2026.5.17.0001: solicitacao de documentos", "Prezados, somos o escritorio Almeida & Ramos e solicitamos o envio de documentos do processo acima: contratos, folhas de ponto e comprovantes de pagamento. Prazo: 5 dias."],
];
for (const [assunto, corpo] of testes) {
  await t.sendMail({ from: user, to: para, subject: `[TESTE] ${assunto}`, text: corpo });
  console.log("enviado:", assunto);
}
