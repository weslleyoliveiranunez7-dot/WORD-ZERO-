// URL do servidor: ?server=wss://... na barra de enderecos > VITE_SERVER_URL (desenvolvimento local) > servidor publico no Render.
export function getServerUrl(): string {
  const q = new URLSearchParams(window.location.search).get("server");
  return q ?? import.meta.env.VITE_SERVER_URL ?? "https://worldzero-server.onrender.com";
}
