const DEFAULTS = { enabled: true, threshold: 700, showNav: false };
const MIN_THRESHOLD = 300;
const MAX_THRESHOLD = 2000;

const t = (key, substitutions) => chrome.i18n.getMessage(key, substitutions);

const STATE_KEYS = {
  list: 'stateList',
  chat: 'stateChat',
  wide: 'stateWide',
  disabled: 'stateDisabled',
  'waiting-for-chats': 'stateWaiting',
  'layout-not-recognized': 'stateNotRecognized',
};

const uiLanguage = chrome.i18n.getUILanguage();
const numberFormat = new Intl.NumberFormat(uiLanguage);
const timeFormat = new Intl.DateTimeFormat(uiLanguage, { timeStyle: 'medium' });

document.documentElement.lang = uiLanguage;
document.documentElement.dir = t('@@bidi_dir');
document.querySelectorAll('[data-i18n]').forEach((el) => {
  el.textContent = t(el.dataset.i18n);
});

const enabled = document.getElementById('enabled');
const threshold = document.getElementById('threshold');
const showNav = document.getElementById('showNav');
const statusBox = document.getElementById('status');
const message = document.getElementById('message');

function renderStatus(status) {
  if (!status) {
    statusBox.textContent = t('noPage');
    statusBox.classList.add('problem');
    return;
  }
  const time = timeFormat.format(status.at);
  const label = STATE_KEYS[status.state] ? t(STATE_KEYS[status.state]) : status.state;
  let text = t('statusLine', [label, numberFormat.format(status.width), time]);
  if (status.closeMethod === 'hidden-only') text += ` ${t('hiddenOnly')}`;
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
    message.textContent = t('diagNoAnswer');
  }, 1500);

  async function onDiagnostics(changes, area) {
    if (area !== 'local' || !changes.diagnostics) return;
    clearTimeout(timeout);
    chrome.storage.onChanged.removeListener(onDiagnostics);
    try {
      await navigator.clipboard.writeText(JSON.stringify(changes.diagnostics.newValue, null, 2));
      message.textContent = t('diagCopied');
    } catch {
      message.textContent = t('diagCopyFailed');
    }
  }

  chrome.storage.onChanged.addListener(onDiagnostics);
  chrome.storage.local.set({ diagnosticsRequest: Date.now() });
});
