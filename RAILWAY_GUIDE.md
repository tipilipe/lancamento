# Guia de Deploy no Railway

O Railway é excelente para hospedar o backend (Node.js/PostgreSQL) e o frontend (Vite).

## Passo a Passo

1. **Acesse o Railway**: Entre em [railway.app](https://railway.app/).
2. **Novo Projeto**:
   - Clique em `+ New Project`.
   - Escolha `Deploy from GitHub repo`.
   - Selecione o repositório `lancamento`.
3. **Configuração de Variáveis de Ambiente**:
   - No painel do projeto no Railway, vá em **Variables**.
   - Adicione as variáveis que estão no seu `.env` (ex: `DATABASE_URL`).
   - *Dica: Você pode criar um banco PostgreSQL diretamente no Railway clicando em `+ New` > `Database` > `Add PostgreSQL`.*
4. **Deploy Automático**:
   - O Railway detectará o script `"start"` no `package.json` e executará o servidor Node.js.
   - O servidor agora está configurado para servir tanto a API quanto os arquivos estáticos do frontend (da pasta `dist`).

## Notas Importantes
- **Configuração de Serviço**: No Railway, certifique-se de que ele não está configurado apenas como "Static site". Ele deve rodar o comando `npm start`.
- **Variáveis de Ambiente**: Lembre-se de adicionar o `DATABASE_URL` no painel do Railway.
