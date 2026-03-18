// content.js — WhatsApp para HubSpot CRM  v2.2.0
// ─────────────────────────────────────────────────────────────────────────────
// NOVIDADES v2.2.0:
//   - Deduplicação de mensagens: apenas conteúdo NOVO (não enviado anteriormente
//     ao HubSpot) é sincronizado. O histórico de mensagens já enviadas é
//     persistido no chrome.storage.local, por número de telefone.
//
// HIERARQUIA DE CAPTURA DO NÚMERO (ordem de prioridade):
//   1. Store interna do WhatsApp (inject.js) — funciona para TODOS os contatos
//   2. data-id das mensagens no DOM
//   3. URL da página (?phone=)
//   4. Subtítulo do header
//   5. data-pre-plain-text
// ─────────────────────────────────────────────────────────────────────────────

const MIDDLEWARE_URL = 'http://localhost:3000/api/whatsapp-to-hubspot';
const BTN_ID         = 'hubspot-save-btn';

// ─────────────────────────────────────────────────────────────────────────────
// INJEÇÃO DO SCRIPT NO CONTEXTO PRINCIPAL DA PÁGINA
// ─────────────────────────────────────────────────────────────────────────────
(function injectPageScript() {
  try {
    if (document.getElementById('wa-hubspot-injector')) return;
    const script = document.createElement('script');
    script.id  = 'wa-hubspot-injector';
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  } catch (e) {
    console.warn('[WA→HubSpot] Falha ao injetar inject.js:', e);
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
// DEDUPLICAÇÃO — chave única por mensagem
// Gera um hash simples e determinístico baseado nos campos da mensagem.
// Formato: "phone|time|from|text" (normalizado)
// ─────────────────────────────────────────────────────────────────────────────
function messageKey(phone, msg) {
  const raw = [
    (phone  || '').trim(),
    (msg.time || '').trim(),
    (msg.from || '').trim(),
    (msg.text || '').trim().toLowerCase(),
  ].join('|');

  // Hash djb2 simples (sem dependências externas)
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
    hash = hash >>> 0; // mantém unsigned 32-bit
  }
  return hash.toString(36); // base36 para compactar
}

// Carrega o conjunto de chaves já enviadas para um determinado telefone
function loadSentKeys(phone) {
  return new Promise((resolve) => {
    const storageKey = 'sent_' + (phone || 'unknown');
    chrome.storage.local.get([storageKey], (result) => {
      resolve(new Set(result[storageKey] || []));
    });
  });
}

// Persiste o conjunto atualizado de chaves enviadas
function saveSentKeys(phone, keysSet) {
  return new Promise((resolve) => {
    const storageKey = 'sent_' + (phone || 'unknown');
    chrome.storage.local.set({ [storageKey]: [...keysSet] }, resolve);
  });
}

// Filtra apenas as mensagens ainda não enviadas e retorna junto com as chaves novas
async function filterNewMessages(phone, messages) {
  const sentKeys  = await loadSentKeys(phone);
  const newMsgs   = [];
  const newKeys   = [];

  for (const msg of messages) {
    const key = messageKey(phone, msg);
    if (!sentKeys.has(key)) {
      newMsgs.push(msg);
      newKeys.push(key);
    }
  }

  return { newMsgs, newKeys, sentKeys };
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTRATÉGIA 1: Store interna via inject.js
// ─────────────────────────────────────────────────────────────────────────────
function extractPhoneViaStore() {
  return new Promise((resolve) => {
    const TIMEOUT_MS = 1500;
    let resolved = false;

    const listener = (event) => {
      if (!event.data || event.data.type !== 'WA_CHAT_INFO_RESULT') return;
      if (resolved) return;
      resolved = true;
      window.removeEventListener('message', listener);
      resolve({ phone: event.data.phone || null, name: event.data.name || null });
    };

    window.addEventListener('message', listener);
    window.postMessage({ type: 'WA_GET_CHAT_INFO' }, '*');

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', listener);
        resolve({ phone: null, name: null });
      }
    }, TIMEOUT_MS);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTRATÉGIA 2: data-id das mensagens no DOM
// ─────────────────────────────────────────────────────────────────────────────
function extractPhoneFromDataId() {
  const received = document.querySelectorAll('[data-id^="false_"]');
  for (const el of received) {
    const match = (el.getAttribute('data-id') || '').match(/false_(\d+)@c\.us/);
    if (match && match[1].length >= 8) return match[1];
  }
  const sent = document.querySelectorAll('[data-id^="true_"]');
  for (const el of sent) {
    const match = (el.getAttribute('data-id') || '').match(/true_(\d+)@c\.us/);
    if (match && match[1].length >= 8) return match[1];
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTRATÉGIA 3: URL da página (?phone=)
// ─────────────────────────────────────────────────────────────────────────────
function extractPhoneFromURL() {
  try {
    const phoneParam = new URL(window.location.href).searchParams.get('phone');
    if (phoneParam) {
      const digits = phoneParam.replace(/\D/g, '');
      if (digits.length >= 8) return digits;
    }
  } catch (e) {}
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTRATÉGIA 4: Subtítulo do header
// ─────────────────────────────────────────────────────────────────────────────
function extractPhoneFromHeader() {
  const selectors = [
    'span[data-testid="conversation-info-header-subtitle"]',
    '#main header span[dir="auto"]:nth-of-type(2)',
    'header span[title]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const digits = el.innerText.trim().replace(/\D/g, '');
      if (digits.length >= 8 && digits.length <= 15) return digits;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTRATÉGIA 5: data-pre-plain-text
// ─────────────────────────────────────────────────────────────────────────────
function extractPhoneFromPreText() {
  const els = document.querySelectorAll('[data-pre-plain-text]');
  for (const el of els) {
    const match = (el.getAttribute('data-pre-plain-text') || '').match(/\]\s*(\+?[\d\s\-().]{8,})\s*:/);
    if (match) {
      const digits = match[1].replace(/\D/g, '');
      if (digits.length >= 8 && digits.length <= 15) return digits;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Nome do contato via DOM
// ─────────────────────────────────────────────────────────────────────────────
function getContactNameFromDOM() {
  const selectors = [
    'span[data-testid="conversation-info-header-chat-title"]',
    '#main header span[dir="auto"]:first-of-type',
    '#main header div[data-testid="conversation-info-header"] span[dir="auto"]',
    'header span[dir="auto"]',
  ];
  const blocked = ['online', 'offline', 'digitando...', 'gravando áudio...', 'gravando audio...'];
  for (const sel of selectors) {
    const els = document.querySelectorAll(sel);
    for (const el of els) {
      const txt = el.innerText.trim();
      if (txt.length > 1 && !blocked.includes(txt.toLowerCase())) return txt;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orquestra todas as estratégias de captura
// ─────────────────────────────────────────────────────────────────────────────
async function getContactInfo() {
  const storeResult = await extractPhoneViaStore();

  const phone = storeResult.phone
    || extractPhoneFromDataId()
    || extractPhoneFromURL()
    || extractPhoneFromHeader()
    || extractPhoneFromPreText();

  const name = storeResult.name
    || getContactNameFromDOM()
    || 'Desconhecido';

  return { name, phone };
}

// ─────────────────────────────────────────────────────────────────────────────
// Captura mensagens da conversa
// ─────────────────────────────────────────────────────────────────────────────
function getMessages() {
  const messages = [];

  // Método 1: data-pre-plain-text (mais estruturado)
  const copyables = document.querySelectorAll('[data-pre-plain-text]');
  if (copyables.length > 0) {
    copyables.forEach(el => {
      const preText   = el.getAttribute('data-pre-plain-text') || '';
      const timeMatch = preText.match(/\[(\d{2}:\d{2})/);
      const time      = timeMatch ? timeMatch[1] : '';
      const isOut     = !!el.closest('div.message-out') ||
                        !!el.closest('[data-testid="msg-container-out"]');
      const textEl    = el.querySelector('span[data-testid="msg-text"]') ||
                        el.querySelector('span.selectable-text') ||
                        el;
      const txt = textEl.innerText.trim();
      if (txt) messages.push({ text: txt, time, from: isOut ? 'vendedor' : 'cliente' });
    });
    if (messages.length > 0) return messages;
  }

  // Método 2: containers de mensagem
  const msgElements = document.querySelectorAll(
    'div[data-testid="msg-container"], div.message-in, div.message-out'
  );
  msgElements.forEach(el => {
    const textEl = el.querySelector('span[data-testid="msg-text"]') ||
                   el.querySelector('span.selectable-text') ||
                   el.querySelector('.copyable-text span');
    const timeEl = el.querySelector("span[data-testid='msg-time']");
    const isOut  = el.classList.contains('message-out');
    if (textEl && textEl.innerText.trim()) {
      messages.push({
        text: textEl.innerText.trim(),
        time: timeEl ? timeEl.innerText.trim() : '',
        from: isOut ? 'vendedor' : 'cliente',
      });
    }
  });

  return messages;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cria o botão fixo no topo direito
// ─────────────────────────────────────────────────────────────────────────────
function createFixedButton() {
  if (document.getElementById(BTN_ID)) return;

  const btn = document.createElement('button');
  btn.id    = BTN_ID;
  btn.title = 'Salvar conversa no HubSpot CRM';

  const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
    style="flex-shrink:0">
    <polyline points="16 16 12 12 8 16"></polyline>
    <line x1="12" y1="12" x2="12" y2="21"></line>
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path>
  </svg>`;

  btn.innerHTML = svgIcon + '<span id="hubspot-btn-text">Salvar no HubSpot</span>';

  btn.style.cssText = `
    position: fixed;
    top: 12px;
    right: 80px;
    z-index: 99999;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background-color: #FF7A59;
    color: #ffffff;
    border: none;
    border-radius: 20px;
    padding: 8px 18px;
    font-size: 13px;
    font-weight: 700;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: 0 3px 10px rgba(0,0,0,0.30);
    letter-spacing: 0.2px;
    transition: background-color 0.2s, transform 0.15s, box-shadow 0.2s;
    user-select: none;
  `;

  btn.addEventListener('mouseenter', () => {
    if (!btn.disabled) {
      btn.style.backgroundColor = '#e8623a';
      btn.style.transform       = 'scale(1.05)';
      btn.style.boxShadow       = '0 5px 16px rgba(0,0,0,0.35)';
    }
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = '0 3px 10px rgba(0,0,0,0.30)';
    if (!btn.disabled) btn.style.backgroundColor = '#FF7A59';
  });

  btn.addEventListener('click', handleSave);
  document.body.appendChild(btn);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ação do botão — com deduplicação
// ─────────────────────────────────────────────────────────────────────────────
async function handleSave() {
  const btn     = document.getElementById(BTN_ID);
  const btnText = document.getElementById('hubspot-btn-text');
  if (!btn || !btnText) return;

  const allMessages = getMessages();
  if (allMessages.length === 0) {
    showToast('Abra uma conversa antes de salvar.', 'error');
    return;
  }

  // Estado: capturando número
  btnText.innerText         = 'Capturando...';
  btn.disabled              = true;
  btn.style.backgroundColor = '#aaaaaa';
  btn.style.cursor          = 'not-allowed';

  const { name, phone } = await getContactInfo();

  // Estado: filtrando mensagens novas
  btnText.innerText = 'Verificando...';

  const { newMsgs, newKeys, sentKeys } = await filterNewMessages(phone, allMessages);

  // Nenhuma mensagem nova — tudo já foi enviado antes
  if (newMsgs.length === 0) {
    showToast('Nenhuma mensagem nova para enviar. Tudo já está no HubSpot.', 'info');
    resetButton(btn, btnText);
    return;
  }

  btnText.innerText = `Salvando ${newMsgs.length} msg${newMsgs.length > 1 ? 's' : ''}...`;

  try {
    const res = await fetch(MIDDLEWARE_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ contactName: name, phone, messages: newMsgs }),
    });

    const data = await res.json();

    if (data.success) {
      // Persiste as chaves das mensagens recém-enviadas
      const updatedKeys = new Set([...sentKeys, ...newKeys]);
      await saveSentKeys(phone, updatedKeys);

      const total = newMsgs.length;
      showToast(`${total} mensagem${total > 1 ? 's' : ''} nova${total > 1 ? 's' : ''} salva${total > 1 ? 's' : ''} no HubSpot!`, 'success');
      btnText.innerText         = 'Salvo!';
      btn.style.backgroundColor = '#25D366';
      setTimeout(() => resetButton(btn, btnText), 3000);
    } else {
      showToast(data.error || 'Erro ao salvar.', 'error');
      resetButton(btn, btnText);
    }
  } catch (err) {
    showToast('Middleware offline. Inicie o servidor Node.js (start.bat).', 'error');
    resetButton(btn, btnText);
  }
}

function resetButton(btn, btnText) {
  btnText.innerText         = 'Salvar no HubSpot';
  btn.style.backgroundColor = '#FF7A59';
  btn.disabled              = false;
  btn.style.cursor          = 'pointer';
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast de notificação (suporta tipo 'info' além de success/error)
// ─────────────────────────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const existing = document.getElementById('hubspot-toast');
  if (existing) existing.remove();

  const colors = {
    success: '#25D366',
    error:   '#e53935',
    info:    '#1565C0',
  };

  const toast = document.createElement('div');
  toast.id    = 'hubspot-toast';
  toast.innerText = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    background-color: ${colors[type] || colors.info};
    color: white;
    padding: 12px 28px;
    border-radius: 24px;
    font-size: 14px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    z-index: 999999;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    opacity: 1;
    transition: opacity 0.4s;
    max-width: 480px;
    text-align: center;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 5000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Inicialização
// ─────────────────────────────────────────────────────────────────────────────
createFixedButton();

// Recria o botão se o DOM for modificado (SPA navigation)
const observer = new MutationObserver(() => {
  if (!document.getElementById(BTN_ID)) createFixedButton();
});
observer.observe(document.body, { childList: true, subtree: false });
