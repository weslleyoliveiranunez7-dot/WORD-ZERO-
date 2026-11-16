// Etapa 14: teste do relogio da temporada e do wipe, com RELOGIO ACELERADO (injetado) e armazenamento de verdade (arquivos ou DATABASE_URL).
// Nao liga o Colyseus: prova o gerenciador, o wipe e a recuperacao de falhas. Rodar: pnpm --filter @worldzero/server seasoncheck
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seasonSeed } from "@worldzero/shared";
import { SeasonManager, seasonRecordId, seasonResultId, type SeasonHost, type SeasonOptions } from "./seasons";
import { FileStore, createStore, type PlayerStore } from "./store";
import { characterId, seasonScope, structuresId } from "./worlds";

let failures = 0;
function check(name: string, ok: boolean, extra = ""): void {
  console.log(`${ok ? "OK    " : "FALHOU"} ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failures++;
}

const DAY = 86_400_000;

async function main(): Promise<void> {
  const useDb = !!process.env.DATABASE_URL;
  const dir = useDb ? undefined : await mkdtemp(join(tmpdir(), "wz-season-"));
  const store: PlayerStore = useDb ? await createStore() : new FileStore(dir as string);
  console.log(`armazenamento do teste: ${store.kind}`);
  const runId = Date.now().toString(36); // com Postgres compartilhado, mundos unicos por execucao
  const w1 = `t${runId}a`;
  const w2 = `t${runId}b`;

  let clock = 1_000_000;
  let roomAlive = false;
  const closed: string[] = [];
  const host: SeasonHost = {
    closeWorld: (id) => {
      closed.push(id);
    },
    roomAlive: () => roomAlive,
  };
  const opt = (durationMs: number): SeasonOptions => ({ durationMs, graceMs: 30_000, now: () => clock, log: () => undefined });
  const mgr = (ids: string[], d = 7 * DAY): SeasonManager => new SeasonManager(store, ids, host, opt(d));

  try {
    // ---- 1. inicio ----
    const m = mgr([w1]);
    const mw2 = mgr([w2], 30 * DAY); // o outro mundo tem uma temporada mais longa: acaba depois
    await m.init();
    await mw2.init();
    const s1 = m.current(w1);
    check("temporada 1 criada ACTIVE, 7 dias, seed da temporada", s1?.n === 1 && s1.status === "ACTIVE" && s1.endsAt - s1.startedAt === 7 * DAY && s1.seed === seasonSeed(w1, 1));
    check("mundo ativo aceita jogadores", m.active(w1));

    // dados de jogo da temporada 1 (personagem, bases, snapshot) + vizinhos que NAO podem ser apagados
    const c1 = characterId("chave-de-teste-1234567890", w1, 1);
    const st1 = structuresId(w1, 1);
    await store.save(c1, { v: 1, inventario: ["x"] });
    await store.save(st1, { v: 1, bases: [1, 2, 3] });
    await store.snapshot?.(c1, "teste");
    const other = characterId("chave-de-teste-1234567890", w2, 1); // outro MUNDO
    await store.save(other, { v: 1, outro_mundo: true });
    await store.save(`${w1}_s10_vizinho`, { v: 1, s10: true }); // temporada 10 do mesmo mundo: prefixo parecido
    await store.save("meta_conta_teste", { v: 1, conta: "preservada" }); // dado de conta (nao e de gameplay)

    // ---- 2. antes do fim nada acontece (sem ninguem conectado) ----
    clock += 6 * DAY + 23 * 3600_000;
    await m.tick();
    check("antes do fim continua ACTIVE", m.current(w1)?.status === "ACTIVE" && m.current(w1)?.n === 1);

    // ---- 3. fim: CLOSING (acoes bloqueadas), aviso final antes de fechar ----
    clock += 3600_000 + 1;
    await m.tick();
    check("ao completar 7 dias entra em CLOSING e o mundo deixa de aceitar jogadores", m.current(w1)?.status === "CLOSING" && !m.active(w1));
    check("durante o aviso final a sala NAO e fechada e nada e apagado", closed.length === 0 && (await store.load(c1)) !== null);
    await mw2.tick();
    check("o outro mundo segue ACTIVE (mundos independentes)", mw2.current(w2)?.status === "ACTIVE" && mw2.current(w2)?.n === 1);

    // ---- 4. fim do aviso: pede para fechar; so apaga depois da sala morrer ----
    clock += 31_000;
    roomAlive = true;
    await m.tick();
    check("passado o aviso, pede o fechamento da sala", closed.includes(w1));
    check("com a sala ainda viva NAO apaga e NAO avanca", m.current(w1)?.status === "CLOSING" && (await store.load(c1)) !== null);
    roomAlive = false;
    await m.tick();
    const s2 = m.current(w1);
    check("sala fechada: arquiva, apaga e cria a temporada 2 ACTIVE com seed nova", s2?.n === 2 && s2.status === "ACTIVE" && s2.seed !== s1?.seed && s2.seed === seasonSeed(w1, 2), `n=${s2?.n} ${s2?.status}`);
    check("a nova temporada dura 7 dias a partir do reset", s2 !== undefined && s2.endsAt - s2.startedAt === 7 * DAY && s2.startedAt === clock);
    check("wipe: personagem, bases e snapshot da temporada 1 sumiram", (await store.load(c1)) === null && (await store.load(st1)) === null && ((await store.snapshots?.(c1, 5)) ?? []).length === 0);
    check("wipe NAO tocou em outro mundo, em temporada de prefixo parecido nem em dado de conta", (await store.load(other)) !== null && (await store.load(`${w1}_s10_vizinho`)) !== null && (await store.load("meta_conta_teste")) !== null);
    const result = (await store.load(seasonResultId(w1, 1))) as { n?: number; seed?: number } | null;
    check("resultado da temporada 1 arquivado (so historia)", result?.n === 1 && result.seed === s1?.seed);
    check("o personagem da temporada 2 usa outro id (nada atravessa o wipe)", characterId("chave-de-teste-1234567890", w1, 2) !== c1);

    // ---- 5. nao duplica ----
    await m.tick();
    await m.tick();
    check("ticks repetidos nao criam temporada 3", m.current(w1)?.n === 2);

    // ---- 6. reinicio do servidor depois do wipe ----
    const m2 = mgr([w1, w2]);
    await m2.init();
    check("reiniciar o servidor mantem a temporada 2 (nao recria)", m2.current(w1)?.n === 2 && m2.current(w1)?.startedAt === s2?.startedAt);

    // ---- 7. falha no meio do wipe: nao cria temporada nova, termina na proxima rodada ----
    await store.save(characterId("k", w1, 2), { v: 1, a: 1 });
    clock = (m2.current(w1)?.endsAt ?? 0) + 1;
    await m2.tick(); // CLOSING
    clock += 31_000;
    const realPurge = store.purge?.bind(store);
    let fail = true;
    if (store.purge) store.purge = async (p: string) => {
      if (fail) throw new Error("falha simulada no wipe");
      return (realPurge as (p: string) => Promise<number>)(p);
    };
    await m2.tick();
    check("falha no wipe: fica em RESETTING, sem temporada nova e sem apagar pela metade", m2.current(w1)?.status === "RESETTING" && m2.current(w1)?.n === 2);
    check("e o mundo continua fechado", !m2.active(w1));
    fail = false;
    await m2.tick();
    check("proxima rodada conclui o wipe e cria UMA temporada 3", m2.current(w1)?.n === 3 && m2.current(w1)?.status === "ACTIVE" && (await store.load(characterId("k", w1, 2))) === null);

    // ---- 8. queda do servidor no meio: religa em CLOSING / RESETTING e continua ----
    const cur = m2.current(w1);
    if (cur) {
      await store.save(seasonRecordId(w1), { ...cur, status: "RESETTING" });
      await store.save(characterId("k2", w1, 3), { v: 1, b: 1 });
      const m3 = mgr([w1]);
      await m3.init();
      check("religou em RESETTING: mundo fechado ate terminar", m3.current(w1)?.status === "RESETTING" && !m3.active(w1));
      await m3.tick();
      check("e conclui sozinho (sem jogador conectado), uma unica temporada 4", m3.current(w1)?.n === 4 && m3.current(w1)?.status === "ACTIVE" && (await store.load(characterId("k2", w1, 3))) === null);
    }

    // ---- 9. registro invalido: nada e inventado ----
    await store.save(seasonRecordId(w2), { v: 1, lixo: true });
    const m4 = mgr([w2]);
    await m4.init();
    const still = (await store.load(seasonRecordId(w2))) as { lixo?: boolean } | null;
    check("registro de temporada invalido: mundo fechado e registro intacto (nao cria temporada por cima)", !m4.active(w2) && m4.current(w2) === undefined && still?.lixo === true);

    // ---- 10. relogio acelerado de verdade (5 s) ----
    const w3 = `t${runId}c`;
    let real = Date.now();
    const fast = new SeasonManager(store, [w3], host, { durationMs: 5_000, graceMs: 1_000, now: () => real, log: () => undefined });
    await fast.init();
    real += 5_001;
    await fast.tick();
    real += 1_001;
    await fast.tick();
    check("relogio acelerado: 5 s de temporada, aviso de 1 s, wipe e temporada 2", fast.current(w3)?.n === 2 && fast.current(w3)?.status === "ACTIVE");

    // ---- 11. seguranca do prefixo ----
    if (store.purge) {
      let rejected = 0;
      for (const bad of ["", "../x", "a/b", "a b", "x".repeat(101)]) {
        try {
          await store.purge(bad);
        } catch {
          rejected++;
        }
      }
      check("purge recusa prefixo vazio ou perigoso", rejected === 5);
    }
    check("escopos nao se confundem", seasonScope("mundo-1", 1) !== seasonScope("mundo-1", 10) && !seasonScope("mundo-1", 10).startsWith(seasonScope("mundo-1", 1)));

    if (dir) {
      const log = await readFile(join(dir, "audit.log"), "utf8").catch(() => "");
      check("auditoria registrou encerramento, arquivamento e wipe", ["temporada_encerrando", "temporada_arquivada", "wipe_concluido"].every((k) => log.includes(k)));
      check("pasta de dados ficou sem lixo de temporada antiga", !(await readdir(dir)).some((f) => f.startsWith(seasonScope(w1, 1))));
    }
  } finally {
    await store.close?.();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
  console.log(failures === 0 ? "\nTODOS OS TESTES DE TEMPORADA PASSARAM" : `\n${failures} TESTE(S) FALHARAM`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("erro no teste de temporada", e);
  process.exit(1);
});
