# Solução: Captura de Números Não Salvos no WhatsApp Web

## O Problema

O projeto atual (WhatsApp HubSpot Connector) enfrenta uma limitação na captura do número de telefone de clientes que **não estão salvos na agenda**. O problema ocorre porque:

1. O WhatsApp Web adotou um sistema de IDs baseado em `@lid` (Linked Device ID) para proteger a privacidade dos usuários.
2. Para contatos não salvos e sem interação prévia na sessão atual, o DOM (HTML da página) muitas vezes não expõe o número real (JID: `numero@c.us`), mas sim o `@lid`.
3. O script atual (`content.js`) depende de varrer o DOM (atributos `data-id`, `data-pre-plain-text`, etc.) para extrair o número. Se o número não estiver no DOM, a captura falha até que haja uma interação (como responder a mensagem), o que força o WhatsApp a descriptografar e renderizar o número na tela.

## A Solução

Para contornar essa limitação sem precisar que o usuário interaja primeiro com a mensagem, a solução mais robusta é **injetar um script na página** para acessar os módulos internos do WhatsApp Web (conhecidos como `Store` via `webpackJsonp` ou `window.require`).

Bibliotecas como `whatsapp-web.js` e `wa-js` (do WPPConnect) utilizam exatamente essa abordagem: elas acessam o banco de dados interno (IndexedDB/Store em memória) do WhatsApp Web para mapear o `@lid` de volta para o número de telefone real (`@c.us`), ou simplesmente consultam o objeto do Chat atual.

### Estratégia de Implementação

Em vez de apenas ler o DOM, a extensão deve injetar um script que se comunique com o contexto principal da página (page context) para acessar a API interna do WhatsApp.

#### Passo 1: Injetar um Script de Acesso à API Interna

Criar um arquivo `inject.js` que será inserido na página pelo `content.js`. Este script usará a técnica de sequestro do Webpack para acessar os módulos do WhatsApp.

```javascript
// inject.js
(function() {
  // Tenta acessar a Store interna do WhatsApp
  // O WhatsApp expõe window.require em versões mais antigas ou 
  // pode ser acessado interceptando webpackJsonp
  
  window.getWhatsAppChatInfo = function() {
    try {
      // Método simplificado assumindo que módulos como wa-js ou similares 
      // podem ser expostos, ou usando a lógica de busca no webpack
      
      // Uma abordagem comum é buscar no módulo de Store de Chats ativos
      // Exemplo conceitual (a implementação exata varia com a versão do WA Web):
      const chatModule = window.require ? window.require('WAWebChatModel') : null;
      const contactModule = window.require ? window.require('WAWebContactModel') : null;
      
      // Se tivermos acesso ao WPPConnect (se o usuário usar alguma extensão baseada nele)
      if (window.WPP && window.WPP.chat) {
        const activeChat = window.WPP.chat.getActiveChat();
        return {
          phone: activeChat.id.user,
          name: activeChat.contact.name || activeChat.contact.pushname
        };
      }
      
      return null;
    } catch (e) {
      console.error("Erro ao acessar API interna:", e);
      return null;
    }
  };
})();
```

#### Passo 2: Comunicação entre Content Script e Injected Script

O `content.js` enviará uma mensagem via `postMessage` para o script injetado, solicitando os dados do chat atual.

```javascript
// No content.js
function getPhoneViaInjectedScript() {
  return new Promise((resolve) => {
    const listener = (event) => {
      if (event.data && event.data.type === 'WA_CHAT_INFO_RESULT') {
        window.removeEventListener('message', listener);
        resolve(event.data.phone);
      }
    };
    window.addEventListener('message', listener);
    window.postMessage({ type: 'GET_WA_CHAT_INFO' }, '*');
    
    // Timeout de fallback
    setTimeout(() => {
      window.removeEventListener('message', listener);
      resolve(null);
    }, 1000);
  });
}
```

### Abordagem Alternativa: Uso do `wa-js`

Uma solução muito mais robusta, baseada na arquitetura do `whatsmeow` e `whatsapp-web.js`, é incorporar a biblioteca `wa-js` (do projeto WPPConnect) diretamente na sua extensão. 

O `wa-js` já faz todo o trabalho pesado de engenharia reversa do WhatsApp Web. Você pode injetá-lo e simplesmente chamar:

```javascript
// Com wa-js injetado
const activeChat = window.WPP.chat.getActiveChat();
const contactId = activeChat.id._serialized; // Retorna algo como '5511999999999@c.us'
const phoneNumber = activeChat.id.user;      // Retorna '5511999999999'
```

### Por que o Whatsmeow não se aplica diretamente aqui?

O repositório `whatsmeow` [1] que você mencionou é uma biblioteca escrita em **Go** (Golang) que atua como um cliente independente do WhatsApp (conecta diretamente aos servidores do WhatsApp via WebSockets). 

Como o seu projeto é uma **Extensão de Navegador** (JavaScript), não podemos usar o `whatsmeow` diretamente no Chrome. No entanto, o princípio que eles discutem [2] (a conversão de LID para JID) é o mesmo que o `whatsapp-web.js` e o `wa-js` implementam em JavaScript para o navegador.

## Conclusão e Próximos Passos

Para resolver seu problema sem que o usuário precise interagir com a mensagem:

1. **Atualizar a Extensão**: Modificar o `manifest.json` para permitir a injeção de scripts no contexto principal (`web_accessible_resources`).
2. **Injetar Lógica de Store**: Usar um script de injeção para acessar a Store interna do WhatsApp (via Webpack ou injetando o `wa-js`).
3. **Ler o JID Real**: Em vez de ler o DOM, ler a propriedade `id.user` do chat ativo na Store em memória, que sempre conterá o número real, mesmo para contatos não salvos.

## References
[1] https://github.com/tulir/whatsmeow - GitHub - tulir/whatsmeow: Go library for the WhatsApp web multidevice API
[2] https://github.com/tulir/whatsmeow/discussions/categories/whatsapp-protocol-q-a - WhatsApp Protocol Q&A Discussions
