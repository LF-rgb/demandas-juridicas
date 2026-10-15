// Ordem garantida: primeiro carrega a conexao salva no ComplyFlow, so depois os modulos que leem process.env.
await import("./bootstrap.js");
await import("./index.js");
