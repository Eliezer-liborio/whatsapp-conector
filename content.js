// content.js — WhatsApp para HubSpot CRM  v2.1.0
// ─────────────────────────────────────────────────────────────────────────────
// HIERARQUIA DE CAPTURA DO NÚMERO (ordem de prioridade):
//
//  1. Store interna do WhatsApp (inject.js)  ← NOVA — funciona para TODOS os
//     contatos, com ou sem agenda, com ou sem mensagens prévias na sessão.
//
//  2. data-id das mensagens no DOM           ← confiável, mas exige ao menos
//     uma mensagem carregada na tela.
//
//  3. URL da página (?phone=)                ← funciona para chats abertos
//     via link direto (wa.me / send?phone=).
//
//  4. Subtítulo do header                    ← funciona para contatos NÃO
//     salvos na agenda.
//
//  5. data-pre-plain-text                    ← fallback geral.
// ─────────────────────────────────────────────────────────────────────────────

const MIDDLEWARE_URL = 'http://localhost:3000/api/whatsapp-to-hubspot';
const BTN_ID         = 'hubspot-save-btn';

// ─────────────────────────────────────────────────────────────────────────────
// INJEÇÃO DO SCRIPT NO CONTEXTO PRINCIPAL DA PÁGINA
// O content script roda em um contexto isolado (sandbox) e não tem acesso
// direto ao window da página. Para acessar a Store interna do WhatsApp,
// precisamos injetar um script no contexto principal via <script src>.
// ─────────────────────────────────────────────────────────────────────────────
(function injectPageScript() {
  try {
    if (document.getElementById('wa-hubspot-injector')) return; // já injetado
    const script = document.createElement('script');
    script.id  = 'wa-hubspot-injector';
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = () => script.remove(); // limpa o DOM após carregar
    (document.head || document.documentElement).appendChild(script);
  } catch (e) {
    console.warn('[WA→HubSpot] Falha ao injetar inject.js:', e);
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
// ESTRATÉGIA 1 (NOVA): Consulta a Store interna via inject.js
// Envia uma mensagem para o contexto principal e aguarda a resposta.
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
      resolve({
        phone: event.data.phone || null,
        name:  event.data.name  || null,
      });
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
// Formato: "false_5566996215988@c.us_XXXXXXXX"  (recebida)
//          "true_5566996215988@c.us_XXXXXXXX"   (enviada)
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
// ESTRATÉGIA 4: Subtítulo do header (contatos NÃO salvos)
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
// Formato: "[hora, data] +55 66 99999-9999:"
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
// Captura o nome do contato via DOM
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
// Orquestra todas as estratégias de captura (assíncrono)
// ─────────────────────────────────────────────────────────────────────────────
async function getContactInfo() {
  // Estratégia 1: Store interna (mais confiável — funciona para todos)
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
// Ação do botão
// ─────────────────────────────────────────────────────────────────────────────
async function handleSave() {
  const btn     = document.getElementById(BTN_ID);
  const btnText = document.getElementById('hubspot-btn-text');
  if (!btn || !btnText) return;

  const messages = getMessages();
  if (messages.length === 0) {
    showToast('Abra uma conversa antes de salvar.', 'error');
    return;
  }

  // Estado: carregando
  btnText.innerText           = 'Capturando...';
  btn.disabled                = true;
  btn.style.backgroundColor   = '#aaaaaa';
  btn.style.cursor            = 'not-allowed';

  const { name, phone } = await getContactInfo();

  btnText.innerText = 'Salvando...';

  try {
    const res = await fetch(MIDDLEWARE_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ contactName: name, phone, messages }),
    });

    const data = await res.json();

    if (data.success) {
      showToast('Conversa salva no HubSpot!', 'success');
      btnText.innerText           = 'Salvo!';
      btn.style.backgroundColor   = '#25D366';
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
  btnText.innerText           = 'Salvar no HubSpot';
  btn.style.backgroundColor   = '#FF7A59';
  btn.disabled                = false;
  btn.style.cursor            = 'pointer';
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast de notificação
// ─────────────────────────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const existing = document.getElementById('hubspot-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id    = 'hubspot-toast';
  toast.innerText = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    background-color: ${type === 'success' ? '#25D366' : '#e53935'};
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
