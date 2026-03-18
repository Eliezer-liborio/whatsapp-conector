// popup.js

const MIDDLEWARE_URL = 'http://localhost:3000/api/whatsapp-to-hubspot';

document.getElementById('exportBtn').addEventListener('click', async () => {
  const statusMsg = document.getElementById('statusMsg');
  const btn       = document.getElementById('exportBtn');

  btn.disabled          = true;
  statusMsg.style.display = 'block';
  statusMsg.style.color = '#00a4bd';
  statusMsg.innerText   = '⏳ Capturando conversa...';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url.includes('web.whatsapp.com')) {
    statusMsg.innerText   = '⚠️ Abra o WhatsApp Web primeiro!';
    statusMsg.style.color = '#e67e22';
    btn.disabled          = false;
    return;
  }

  // Injeta e executa a função de extração no contexto da aba
  const [{ result: data }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const messages = [];
      const msgEls   = document.querySelectorAll(
        'div[data-testid="msg-container"], div.message-in, div.message-out'
      );

      msgEls.forEach(msg => {
        const textEl = msg.querySelector('span.selectable-text, .copyable-text span');
        const text   = textEl ? textEl.innerText.trim() : '';
        const timeEl = msg.querySelector("span[data-testid='msg-time']");
        const time   = timeEl ? timeEl.innerText.trim() : '';
        const from   = msg.classList.contains('message-out') ? 'vendedor' : 'cliente';
        if (text) messages.push({ from, text, time });
      });

      const nameEl      = document.querySelector('header span[dir="auto"]');
      const contactName = nameEl ? nameEl.innerText.trim() : 'Desconhecido';
      const subEl       = document.querySelector('header span[data-testid="conversation-info-header-subtitle"]');
      const phone       = subEl ? subEl.innerText.replace(/\s/g, '') : '';

      return { contactName, phone, messages };
    }
  });

  if (!data || data.messages.length === 0) {
    statusMsg.innerText   = '⚠️ Nenhuma mensagem encontrada.';
    statusMsg.style.color = '#e67e22';
    btn.disabled          = false;
    return;
  }

  statusMsg.innerText = `📤 Enviando ${data.messages.length} mensagens para o HubSpot...`;

  try {
    const response = await fetch(MIDDLEWARE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (result.success) {
      statusMsg.innerText   = `✅ ${result.message}`;
      statusMsg.style.color = '#00bda5';
    } else {
      statusMsg.innerText   = `❌ ${result.error}`;
      statusMsg.style.color = '#e74c3c';
    }
  } catch (err) {
    statusMsg.innerText   = '❌ Middleware offline. Inicie o servidor Node.js.';
    statusMsg.style.color = '#e74c3c';
  }

  btn.disabled = false;
});

// Verifica se o middleware está online ao abrir o popup
window.addEventListener('load', async () => {
  const indicator = document.getElementById('middlewareStatus');
  if (!indicator) return;
  try {
    const res = await fetch('http://localhost:3000/health');
    const data = await res.json();
    indicator.innerText = data.token_configured
      ? '🟢 Middleware online'
      : '🟡 Middleware online (token não configurado)';
    indicator.style.color = data.token_configured ? 'green' : 'orange';
  } catch {
    indicator.innerText   = '🔴 Middleware offline';
    indicator.style.color = 'red';
  }
});
