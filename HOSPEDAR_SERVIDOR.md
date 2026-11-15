# Hospedar o servidor (pelo celular)

1. Suba `render.yaml` e este arquivo na raiz do repositório (o zip da etapa já traz).
2. Entre em render.com e crie a conta com o GitHub.
3. New > Blueprint > escolha o repositório > Apply.
4. Espere o build. Quando ficar "Live", copie o endereço (ex.: `https://worldzero-server.onrender.com`).
5. Abra no navegador `ENDERECO/health`. Deve mostrar `{"status":"ok","protocol":3,...}`.
6. Jogue abrindo o link do GitHub Pages com o final `?server=wss://SEU-ENDERECO` (sem https://).
   Exemplo: `https://usuario.github.io/WORD-ZERO-/?server=wss://worldzero-server.onrender.com`

Observações:
- Plano gratuito costuma "dormir" sem uso; o primeiro acesso pode demorar. Confirme as condições atuais no site do Render.
- Os dados ficam só na memória: reiniciar o servidor zera tudo (sem persistência ainda).
