// inject.js — WhatsApp para HubSpot CRM
// Roda no contexto PRINCIPAL da página (não no content script isolado)
// Acessa os módulos internos do WhatsApp Web via sistema Webpack
// para obter o número de telefone real do chat ativo, mesmo para
// contatos salvos na agenda (que usam @lid internamente).

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Busca um módulo no Webpack interno do WhatsApp Web.
  // O WhatsApp Web usa webpackChunkwhatsapp_web_client como
  // array global de chunks. Iteramos sobre eles para encontrar
  // o módulo que satisfaz a condição fornecida.
  // ─────────────────────────────────────────────────────────────
  function findWAModule(condition) {
    try {
      const chunkKey = Object.keys(window).find(
        (k) => k.startsWith('webpackChunk') && Array.isArray(window[k])
      );
      if (!chunkKey) return null;

      const chunks = window[chunkKey];
      for (const chunk of chunks) {
        if (!chunk || !chunk[1]) continue;
        const mods = chunk[1];
        for (const id in mods) {
          try {
            // Cria um contexto de módulo temporário para executar o factory
            const mod = { exports: {} };
            // Tenta um require mínimo para não quebrar dependências
            const fakeRequire = (depId) => {
              try {
                const depMod = { exports: {} };
                if (mods[depId]) mods[depId](depMod, depMod.exports, fakeRequire);
                return depMod.exports;
              } catch (e) {
                return {};
              }
            };
            mods[id](mod, mod.exports, fakeRequire);
            const result = condition(mod.exports);
            if (result) return result;
          } catch (e) {
            // Ignora erros de módulos individuais e continua
          }
        }
      }
    } catch (e) {
      // Ignora erros gerais
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────
  // Tenta obter o chat ativo via módulo ChatStore do WhatsApp.
  // Diferentes versões do WhatsApp Web expõem o store de formas
  // ligeiramente diferentes; testamos as variantes conhecidas.
  // ─────────────────────────────────────────────────────────────
  function getActiveChatFromStore() {
    // Variante 1: módulo com getActive() e get()
    const chatStore = findWAModule((m) => {
      const d = m && m.default;
      return d && typeof d.getActive === 'function' && typeof d.get === 'function'
        ? d
        : null;
    });
    if (chatStore) {
      try {
        const active = chatStore.getActive();
        if (active && active.id && active.id.user) return active;
      } catch (e) {}
    }

    // Variante 2: módulo com Chat e getActive como propriedade direta
    const chatStore2 = findWAModule((m) => {
      return m && typeof m.getActive === 'function' && typeof m.get === 'function'
        ? m
        : null;
    });
    if (chatStore2) {
      try {
        const active = chatStore2.getActive();
        if (active && active.id && active.id.user) return active;
      } catch (e) {}
    }

    // Variante 3: via window.require se disponível (versões mais antigas)
    if (typeof window.require === 'function') {
      try {
        const store = window.require('WAWebChatCollection');
        if (store && typeof store.getActive === 'function') {
          const active = store.getActive();
          if (active && active.id && active.id.user) return active;
        }
      } catch (e) {}
    }

    return null;
  }

  // ─────────────────────────────────────────────────────────────
  // Tenta obter o número via WPP (wa-js / WPPConnect),
  // caso a biblioteca já esteja injetada na página por outra
  // extensão ou ferramenta.
  // ─────────────────────────────────────────────────────────────
  function getActiveChatViaWPP() {
    try {
      if (window.WPP && window.WPP.chat && typeof window.WPP.chat.getActiveChat === 'function') {
        const active = window.WPP.chat.getActiveChat();
        if (active && active.id && active.id.user) return active;
      }
    } catch (e) {}
    return null;
  }

  // ─────────────────────────────────────────────────────────────
  // Listener: responde às solicitações do content script
  // ─────────────────────────────────────────────────────────────
  window.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== 'WA_GET_CHAT_INFO') return;

    let phone = null;
    let name  = null;

    // Tentativa 1: WPP (wa-js)
    const wppChat = getActiveChatViaWPP();
    if (wppChat) {
      phone = wppChat.id.user;
      name  = wppChat.contact?.name || wppChat.contact?.pushname || null;
    }

    // Tentativa 2: Store interna via Webpack
    if (!phone) {
      const storeChat = getActiveChatFromStore();
      if (storeChat) {
        phone = storeChat.id.user;
        name  = storeChat.contact?.name
             || storeChat.contact?.pushname
             || storeChat.name
             || null;
      }
    }

    // Responde ao content script
    window.postMessage({
      type:  'WA_CHAT_INFO_RESULT',
      phone: phone,
      name:  name,
    }, '*');
  });

})();
