#  WhatsApp → HubSpot CRM Extension

> Extensão para Chrome e Edge que exporta conversas do WhatsApp Web diretamente para a timeline do cliente no HubSpot CRM, com apenas **1 clique**.

---

##  O que faz?

Ao abrir uma conversa no WhatsApp Web, um botão **"📤 Salvar no HubSpot"** é adicionado automaticamente ao header do chat. Com um clique, toda a conversa é capturada e registrada como uma **nota (NOTE)** na timeline do contato no HubSpot CRM.

```
WhatsApp Web
    ↓
Content Script (captura mensagens)
    ↓
Background Script (gerencia requisições)
    ↓
Middleware API (Node.js) — esconde o token HubSpot
    ↓
HubSpot API → Timeline do Contato
```

---

##  Estrutura do Projeto

```
whatsapp-hubspot-extension/
├── manifest.json           # Configuração da extensão (Manifest v3)
├── background.js           # Service Worker de background
├── content.js              # Script injetado no WhatsApp Web
├── content.css             # Estilos do botão no WhatsApp
├── popup.html              # Interface do popup da extensão
├── popup.js                # Lógica do popup
├── middleware-example.js   # Servidor Node.js para integração com HubSpot
├── package.json            # Dependências do middleware
├── .env.example            # Modelo de variáveis de ambiente
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

##  Instalação da Extensão

### Pré-requisitos

- Google Chrome ou Microsoft Edge instalado
- Conta no [HubSpot CRM](https://www.hubspot.com/) (gratuita ou paga)

### Passo a Passo — Chrome

1. **Baixe ou clone** este repositório:
   ```bash
   git clone https://github.com/Eliezer-liborio/whatsapp-hubspot-extension.git
   ```

2. Abra o Chrome e acesse:
   ```
   chrome://extensions/
   ```

3. Ative o **Modo de Desenvolvedor** (canto superior direito)

4. Clique em **"Carregar extensão sem empacotamento"**

5. Selecione a pasta `whatsapp-hubspot-extension`

6. A extensão aparecerá na lista com o ícone 

### Passo a Passo — Microsoft Edge

1. **Baixe ou clone** este repositório:
   ```bash
   git clone https://github.com/Eliezer-liborio/whatsapp-hubspot-extension.git
   ```

2. Abra o Edge e acesse:
   ```
   edge://extensions/
   ```

3. Ative o **Modo de Desenvolvedor** (canto inferior esquerdo)

4. Clique em **"Carregar extensão sem empacotamento"**

5. Selecione a pasta `whatsapp-hubspot-extension`

---

##  Configuração do Middleware (Integração Real com HubSpot)

O middleware Node.js é responsável por **esconder o token do HubSpot** e realizar as chamadas à API com segurança.

### 1. Instale as dependências

```bash
cd whatsapp-hubspot-extension
npm install
```

### 2. Configure as variáveis de ambiente

```bash
cp .env.example .env
```

Edite o arquivo `.env`:

```env
HUBSPOT_API_KEY=seu_api_key_aqui
PORT=3000
```

> **Onde obter a API Key:** Acesse [HubSpot → Configurações → Integrações → Chaves de API](https://app.hubspot.com/l/settings/api-key) e crie uma nova chave privada.

### 3. Inicie o middleware

```bash
npm start
```

O servidor estará disponível em `http://localhost:3000`.

---

##  Como Usar

1. Acesse [WhatsApp Web](https://web.whatsapp.com) e faça login
2. Abra qualquer conversa com um cliente
3. Clique no botão ** Salvar no HubSpot** que aparece no header do chat
4. Aguarde a confirmação — a conversa será salva na timeline do cliente no HubSpot

Alternativamente, clique no **ícone da extensão** na barra de ferramentas e use o botão **"Exportar Conversa Atual"**.

---

##  Dados Capturados

A extensão registra os seguintes dados de cada conversa:

| Campo | Descrição |
|-------|-----------|
| Nome do contato | Extraído do header do WhatsApp |
| Mensagens | Texto completo de cada mensagem |
| Horários | Timestamp de cada mensagem |
| Remetente | Identifica cliente ou vendedor |

**Exemplo de nota gerada no HubSpot:**

```
WhatsApp Conversation

Cliente: João Silva

[10:12] Cliente:
Olá, gostaria de saber sobre o produto

[10:13] Vendedor:
Claro, posso te explicar!

[10:14] Cliente:
Qual o valor?
```

---

##  Segurança

- O token do HubSpot **nunca é exposto** no código da extensão
- Toda comunicação com a API do HubSpot passa pelo middleware Node.js
- Configure o CORS no middleware para aceitar apenas a origem da extensão

---

##  Solução de Problemas

| Problema | Causa | Solução |
|----------|-------|---------|
| Extensão não carrega | Ícones inválidos ou manifest incorreto | Verifique se todos os arquivos estão na pasta |
| Botão não aparece | WhatsApp mudou o DOM | Atualize os seletores em `content.js` |
| Contato não encontrado | Telefone não cadastrado no HubSpot | Verifique o formato do número |
| Erro CORS | Origem bloqueada | Configure CORS no middleware |

Para ver logs de erro, abra o **DevTools** (F12) na aba do WhatsApp Web.

---

##  Roadmap

- [x] Captura de mensagens do WhatsApp Web
- [x] Botão injetado no header do chat
- [x] Popup de controle da extensão
- [x] Middleware Node.js com HubSpot API
- [ ] Detectar número do contato automaticamente
- [ ] Evitar duplicação de mensagens já exportadas
- [ ] Suporte para grupos do WhatsApp
- [ ] Publicação na Chrome Web Store

---

##  Licença

Distribuído sob a licença MIT. Veja `LICENSE` para mais informações.

---

##  Contribuição

Contribuições são bem-vindas! Sinta-se à vontade para abrir uma _issue_ ou enviar um _pull request_.

1. Faça um fork do projeto
2. Crie uma branch: `git checkout -b feature/minha-feature`
3. Commit suas mudanças: `git commit -m 'feat: adiciona minha feature'`
4. Push para a branch: `git push origin feature/minha-feature`
5. Abra um Pull Request
