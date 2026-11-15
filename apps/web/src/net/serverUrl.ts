// URL do servidor: ?server=wss://... na barra de enderecos (pratico no celular) > VITE_SERVER_URL > localhost.
export function getServerUrl(): string {
  const q = new URLSearchParams(window.location.search).get("server");
  return q ?? import.meta.env.VITE_SERVER_URL ?? "http://localhost:2567";
}
