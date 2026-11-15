// Etapa 12: backup e restauracao manuais.
//   pnpm --filter @worldzero/server backup                      -> grava backups/worldzero-AAAA-MM-DDTHH-MM-SS.json
//   pnpm --filter @worldzero/server backup export arquivo.json
//   pnpm --filter @worldzero/server backup import arquivo.json  -> restaura o estado ATUAL de cada registro
// Usa o mesmo armazenamento do servidor (DATABASE_URL, senao DATA_DIR). O arquivo tem so HASHES de chave e o estado do jogo
// (inventario, bases, posicao): guarde-o como guardaria uma senha e NUNCA o envie para o repositorio (backups/ esta no .gitignore).
// Importar com o servidor ligado funciona, mas jogadores conectados regravam o proprio estado: prefira desligar antes.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createStore } from "./store";
import { isBackupFile } from "./db/types";

async function main(): Promise<void> {
  const [cmd = "export", file] = process.argv.slice(2);
  const store = await createStore();
  try {
    if (cmd === "export") {
      if (!store.exportAll) throw new Error(`o armazenamento "${store.kind}" nao suporta backup (use DATABASE_URL ou DATA_DIR)`);
      const data = await store.exportAll();
      const name = file ?? join("backups", `worldzero-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`);
      await mkdir(dirname(name), { recursive: true });
      await writeFile(name, JSON.stringify(data));
      console.log(`backup OK: ${data.records.length} registros (${store.kind}) -> ${name}`);
    } else if (cmd === "import") {
      if (!file) throw new Error("uso: backup import arquivo.json");
      if (!store.importAll) throw new Error(`o armazenamento "${store.kind}" nao suporta restauracao`);
      const raw: unknown = JSON.parse(await readFile(file, "utf8"));
      if (!isBackupFile(raw)) throw new Error("arquivo de backup invalido");
      const n = await store.importAll(raw);
      console.log(`restauracao OK: ${n} registros (${store.kind}) a partir de ${file} (criado em ${raw.createdAt})`);
    } else {
      throw new Error("comando desconhecido (use export ou import)");
    }
  } finally {
    await store.close?.();
  }
}

main().catch((e) => {
  console.error("ERRO:", e instanceof Error ? e.message : e);
  process.exit(1);
});
