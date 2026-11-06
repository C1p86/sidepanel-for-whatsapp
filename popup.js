const DEFAULTS = { enabled: true, threshold: 700, showNav: false };
const MIN_THRESHOLD = 300;
const MAX_THRESHOLD = 2000;

const STATE_LABELS = {
  list: 'attiva, elenco conversazioni',
  chat: 'attiva, conversazione',
  wide: 'pagina intera (sopra la soglia)',
  disabled: 'disattivata',
  'waiting-for-chats': "in attesa dell'elenco chat",
  'layout-not-recognized': 'layout di WhatsApp non riconosciuto',
};

const enabled = document.getElementById('enabled');
const threshold = document.getElementById('threshold');
const showNav = document.getElementById('showNav');
const statusBox = document.getElementById('status');
const message = document.getElementById('message');

function renderStatus(status) {
  if (!status) {
    statusBox.textContent = 'Nessuna pagina di WhatsApp rilevata. Apri o ricarica il pannello.';
    statusBox.classList.add('problem');
    return;
  }
  const time = new Date(status.at).toLocaleTimeString();
  let text = `${STATE_LABELS[status.state] ?? status.state}. Larghezza ${status.width}px, alle ${time}.`;
  if (status.closeMethod === 'hidden-only') {
    text += ' Attenzione: la chat non si è chiusa davvero, resta aperta dietro l\'elenco e i nuovi messaggi possono risultare letti.';
  }
  statusBox.textContent = text;
  statusBox.classList.toggle('problem', status.state === 'layout-not-recognized' || status.closeMethod === 'hidden-only');
}

chrome.storage.local.get({ ...DEFAULTS, status: null }).then((stored) => {
  enabled.checked = stored.enabled;
  threshold.value = stored.threshold;
  showNav.checked = stored.showNav;
  renderStatus(stored.status);
});

enabled.addEventListener('change', () => chrome.storage.local.set({ enabled: enabled.checked }));
showNav.addEventListener('change', () => chrome.storage.local.set({ showNav: showNav.checked }));
threshold.addEventListener('change', () => {
  const value = Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, Number(threshold.value) || DEFAULTS.threshold));
  threshold.value = value;
  chrome.storage.local.set({ threshold: value });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.status) renderStatus(changes.status.newValue);
});

document.getElementById('diagnostics').addEventListener('click', () => {
  message.textContent = '';
  const timeout = setTimeout(() => {
    chrome.storage.onChanged.removeListener(onDiagnostics);
    message.textContent = 'WhatsApp non risponde: apri il pannello e riprova.';
  }, 1500);

  async function onDiagnostics(changes, area) {
    if (area !== 'local' || !changes.diagnostics) return;
    clearTimeout(timeout);
    chrome.storage.onChanged.removeListener(onDiagnostics);
    try {
      await navigator.clipboard.writeText(JSON.stringify(changes.diagnostics.newValue, null, 2));
      message.textContent = 'Copiata: contiene solo la struttura della pagina, nessun testo.';
    } catch {
      message.textContent = 'Non sono riuscito a copiare negli appunti.';
    }
  }

  chrome.storage.onChanged.addListener(onDiagnostics);
  chrome.storage.local.set({ diagnosticsRequest: Date.now() });
});
