// Teste da camada de PERSISTENCIA (Etapa 12), sem Colyseus: roda contra arquivos (sempre) e contra PostgreSQL real
// (quando DATABASE_URL existe). Confere: ida e volta, "reiniciar" (novo objeto, mesmos dados), snapshots e retencao,
// recuperacao de registro quebrado, escritas simultaneas, auditoria, backup/restauracao e migracoes repetidas.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore, type PlayerStore } from "./store";
import { PostgresStore } from "./db/postgres";
import { MIGRATIONS, checksum, runMigrations, type Db } from "./db/migrations";
import { recoverFromSnapshots } from "./recovery";
import { isBackupFile } from "./db/types";

let failed = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  if (!ok) failed++;
  console.log(`${ok ? "OK   " : "FALHA"} ${name}${detail ? ` - ${detail}` : ""}`);
};
const valid = (raw: unknown): { n: number } | null => {
  if (typeof raw !== "object" || raw === null) return null;
  const n = (raw as Record<string, unknown>).n;
  return typeof n === "number" && Number.isInteger(n) ? { n } : null;
};

async function suite(label: string, open: () => Promise<PlayerStore>): Promise<void> {
  console.log(`\n== ${label} ==`);
  const id = `check_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  let store = await open();
  try {
    check(`${label}: registro inexistente devolve null`, (await store.load(id)) === null);

    await store.save(id, { n: 1, itens: [{ id: "wood", qty: 3 }, null] });
    await store.save(id, { n: 2, itens: [{ id: "wood", qty: 5 }, null] });
    const back = (await store.load(id)) as { n: number; itens: unknown[] };
    check(`${label}: grava, sobrescreve e le de volta`, back.n === 2 && JSON.stringify(back.itens) === JSON.stringify([{ id: "wood", qty: 5 }, null]));

    // "reiniciar o servidor": fecha tudo e abre um objeto novo
    await store.close?.();
    store = await open();
    const after = (await store.load(id)) as { n: number } | null;
    check(`${label}: depois de fechar e reabrir (reinicio) o dado continua la`, after?.n === 2);

    // snapshots e retencao
    process.env.SNAPSHOT_KEEP = "5";
    await store.save(id, { n: 10 });
    await store.snapshot?.(id, "t1");
    await store.save(id, { n: 11 });
    await store.snapshot?.(id, "t2");
    await store.save(id, { n: 12 });
    const snaps = (await store.snapshots?.(id, 10)) ?? [];
    check(`${label}: snapshots saem do mais novo para o mais antigo`, snaps.length >= 2 && valid(snaps[0].data)?.n === 11 && snaps[0].reason === "t2" && valid(snaps[1].data)?.n === 10, `${snaps.map((s) => `${s.reason}:${valid(s.data)?.n}`).join(", ")}`);
    check(`${label}: registro atual nao e afetado pelo snapshot`, valid(await store.load(id))?.n === 12);
    for (let i = 0; i < 12; i++) {
      await store.save(id, { n: 100 + i });
      await store.snapshot?.(id, `r${i}`);
    }
    const kept = (await store.snapshots?.(id, 100)) ?? [];
    check(`${label}: retencao mantem so os 5 mais novos`, kept.length === 5 && kept[0].reason === "r11" && kept[4].reason === "r7", `${kept.length} guardados`);
    delete process.env.SNAPSHOT_KEEP;

    // recuperacao: o atual quebra (e um snapshot recente tambem), volta o mais novo que ainda vale
    await store.save(id, { n: 200 });
    await store.snapshot?.(id, "bom");
    await store.save(id, { quebrado: true });
    await store.snapshot?.(id, "ruim_recente");
    await store.save(id, { quebrado: true, de_novo: 1 });
    const rec = await recoverFromSnapshots(store, id, valid);
    check(`${label}: recuperacao pula snapshot invalido e acha o valido mais novo`, rec !== null && rec.value.n === 200 && rec.skipped === 1 && rec.reason === "bom", rec ? `n=${rec.value.n}, ignorados=${rec.skipped}` : "nada");
    if (rec) await store.save(id, rec.raw);
    check(`${label}: registro atual volta a ser o recuperado`, valid(await store.load(id))?.n === 200);
    const none = await recoverFromSnapshots(store, `${id}_sem_historico`, valid);
    check(`${label}: sem historico nao inventa recuperacao`, none === null);

    // escritas simultaneas: sobra uma versao inteira e valida
    await Promise.all(Array.from({ length: 30 }, (_, i) => store.save(id, { n: 1000 + i })));
    const last = valid(await store.load(id));
    check(`${label}: 30 gravacoes simultaneas deixam um registro inteiro`, last !== null && last.n >= 1000 && last.n < 1030, `n=${last?.n}`);

    // auditoria
    let auditOk = true;
    try {
      await store.audit?.({ kind: "teste_persistencia", player: id, detail: { ok: true } });
    } catch {
      auditOk = false;
    }
    check(`${label}: auditoria grava sem erro`, auditOk);
    if (store instanceof PostgresStore) check(`${label}: auditoria aparece no banco`, (await store.countAudit("teste_persistencia")) >= 1);

    // backup e restauracao
    await store.save(id, { n: 777 });
    const bk = await store.exportAll?.();
    check(`${label}: backup e um arquivo valido e contem o registro`, !!bk && isBackupFile(bk) && bk.records.some((r) => r.id === id && valid(r.data)?.n === 777));
    await store.save(id, { n: 888 });
    if (bk && store.importAll) {
      const n = await store.importAll(bk);
      check(`${label}: restaurar o backup desfaz a mudanca posterior`, n >= 1 && valid(await store.load(id))?.n === 777);
    }
    check(`${label}: backup invalido e recusado`, !isBackupFile({ format: "x" }) && !isBackupFile({ format: "worldzero-backup", v: 1, records: [{ id: "../x", data: {} }] }));

    // id perigoso nunca vira caminho/SQL
    let blocked = false;
    try {
      await new FileStore(tmpdir()).load("../etc/passwd");
    } catch {
      blocked = true;
    }
    check(`${label}: id com barra/ponto e recusado`, blocked);
  } finally {
    await store.close?.();
  }
}

async function migrationChecks(url: string): Promise<void> {
  console.log("\n== migracoes PostgreSQL ==");
  const a = await PostgresStore.connect(url);
  const versions = await a.appliedMigrations();
  check("migracoes: todas aplicadas", JSON.stringify(versions) === JSON.stringify(MIGRATIONS.map((m) => m.version)), versions.join(","));
  await a.close();
  const b = await PostgresStore.connect(url); // liga de novo: nada a aplicar, nada quebra
  const again = await b.appliedMigrations();
  check("migracoes: ligar de novo nao reaplica nem duplica", again.length === MIGRATIONS.length);
  await b.close();

  // migracao editada depois de aplicada precisa ser recusada
  const fake: Db = {
    connect: async () => ({
      query: async (text: string) => {
        if (text.startsWith("select version, checksum")) return { rows: [{ version: 1, checksum: "outro" }] };
        return { rows: [] };
      },
      release: () => undefined,
    }),
  };
  let refused = false;
  try {
    await runMigrations(fake);
  } catch (e) {
    refused = e instanceof Error && e.message.includes("alterada");
  }
  check("migracoes: texto alterado depois de aplicado e recusado", refused);
  check("migracoes: checksum e estavel", checksum("a") === checksum("a") && checksum("a") !== checksum("b"));
}

async function main(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "wz-persist-"));
  try {
    await suite("arquivos", async () => new FileStore(dir));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  const url = process.env.DATABASE_URL;
  if (url) {
    await migrationChecks(url);
    await suite("postgres", () => PostgresStore.connect(url));
  } else {
    console.log("\n(DATABASE_URL nao definida: parte PostgreSQL pulada)");
  }
  console.log(failed === 0 ? "\nTODOS OK" : `\n${failed} FALHA(S)`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERRO NO TESTE:", e);
  process.exit(1);
});
