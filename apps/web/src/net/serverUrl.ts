import { parseServerList, WORLD_ID_PATTERN, type ServerListResponse } from "@worldzero/shared";

// URL do servidor: ?server=wss://... na barra de enderecos > VITE_SERVER_URL (desenvolvimento local) > servidor publico no Render.
export function getServerUrl(): string {
  const q = new URLSearchParams(window.location.search).get("server");
  return q ?? import.meta.env.VITE_SERVER_URL ?? "https://worldzero-server.onrender.com";
}

// Etapa 13: lista de servidores (mundos). null = servidor sem lista (versao antiga), fora do ar ou resposta invalida.
export async function fetchServerList(timeoutMs = 4000): Promise<ServerListResponse | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${getServerUrl().replace(/^ws/, "http")}/servers`, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    return parseServerList(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Ultimo mundo em que o jogador entrou (so neste aparelho): a lista destaca e oferece CONTINUAR.
const LAST_WORLD_KEY = "wz_last_world";

export function getLastWorld(): string | null {
  try {
    const v = localStorage.getItem(LAST_WORLD_KEY);
    return v && WORLD_ID_PATTERN.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function setLastWorld(id: string): void {
  try {
    localStorage.setItem(LAST_WORLD_KEY, id);
  } catch {
    /* sem armazenamento: so nao lembra */
  }
}
