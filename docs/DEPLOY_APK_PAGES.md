# Etapa 16 - APK e GitHub Pages

## O que cada coisa hospeda (importante)
- **GitHub Pages** hospeda só o **cliente web** (arquivos estáticos: HTML, JS, imagens). **Não** roda o servidor multiplayer.
- O **servidor multiplayer** continua no **Render** (ver `HOSPEDAR_SERVIDOR.md`). O cliente (Pages ou APK) se conecta a ele pela internet.
- O **APK** é o mesmo cliente web empacotado num app Android (Capacitor). Também não contém servidor.

## 1. Publicar o cliente no GitHub Pages
1. No GitHub: **Settings > Pages > Build and deployment > Source: GitHub Actions** (uma vez só).
2. **Actions > "Pages (cliente web)" > Run workflow**.
3. Quando terminar, o link aparece no passo *deploy* (algo como `https://SEU-USUARIO.github.io/NOME-DO-REPO/`).
O workflow só roda quando você manda (não publica sozinho a cada push).

## 2. Gerar o APK debug
1. **Actions > "APK debug (Android)" > Run workflow**. Opcional: preencha *server_url* com o servidor de teste (`https://...`); vazio usa o servidor padrão (Render).
2. No fim da execução, baixe o arquivo **WORLD-ZERO-debug-apk** (em *Artifacts*, na página da execução). Dentro vem o `app-debug.apk`.
3. No celular Android: abra o `.apk` e permita "instalar apps desconhecidos" para o app que você usou para abrir. O app abre na horizontal.
O workflow **não cria release** e não publica nada.

## 3. Conexão com o servidor
- O app usa o servidor padrão (Render) ou o `server_url` que você informou ao gerar o APK. Dá para trocar no APK só gerando de novo.
- No plano grátis do Render o servidor "dorme": a primeira conexão pode demorar ~1 min. A tela inicial mostra "Servidor: online / sem resposta".
- O app Android abre a página como `https://localhost`. Se algum dia você trocar `CORS_ORIGIN` no Render por uma lista, inclua `https://localhost` (hoje é `*`, então funciona).

## 4. Limites desta etapa
- É APK **debug**: assinado com a chave de debug, serve para testar e instalar direto. **Não** serve para Play Store.
- Release (APK/AAB assinado, chave de assinatura, Play Store) **não foi feito** e só deve ser feito com sua aprovação.
- O projeto Android é criado a cada execução do workflow (`npx cap add android`), por isso não há pasta `android/` no repositório. A pasta `mobile/` guarda só a configuração do Capacitor e as imagens de ícone/abertura.
- Nada disso foi executado ainda: o primeiro Run workflow é o teste (cole o log aqui se falhar).
