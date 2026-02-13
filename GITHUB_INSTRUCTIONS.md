# Como subir para o GitHub

Siga os passos abaixo para criar o repositório e enviar seu código:

1. **Acesse o GitHub**: Vá para [github.com](https://github.com/new).
2. **Crie o Repositório**:
   - Nome: `lancamento`
   - Descrição: (Opcional)
   - Visibilidade: Public ou Private (conforme sua preferência).
   - **NÃO** marque as opções de inicializar com README, .gitignore ou License (já criamos localmente).
3. **Conecte e Envie**:
   No seu terminal, dentro da pasta do projeto, execute os seguintes comandos:

   ```bash
   git remote add origin https://github.com/tipilipe/lancamento.git
   git branch -M main
   git push -u origin main
   ```

   *Substitua `SEU_USUARIO` pelo seu nome de usuário do GitHub.*
