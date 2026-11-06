// Vivaldi implements chrome.sidePanel only partially, so every call may fail.
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});

// Vivaldi's panels present themselves as a mobile browser, and WhatsApp's server
// redirects those to a "use a computer" page.
const chromeVersion = navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? '130.0.0.0';
const DESKTOP_HEADERS = [
  {
    header: 'User-Agent',
    operation: 'set',
    value: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`,
  },
  { header: 'Sec-CH-UA-Mobile', operation: 'set', value: '?0' },
  { header: 'Sec-CH-UA-Platform', operation: 'set', value: '"Windows"' },
];

// WhatsApp refuses to be framed. The rule lifts that only for frames opened by this
// extension's panel, or reloaded by WhatsApp itself inside that frame: sub_frame never
// matches WhatsApp in a normal tab or Web Panel, and other sites stay blocked.
const PANEL_FRAME_RULE = {
  id: 1,
  action: {
    type: 'modifyHeaders',
    requestHeaders: [
      ...DESKTOP_HEADERS,
      // WhatsApp's server answers with an error page to a cross-site iframe navigation.
      { header: 'Sec-Fetch-Dest', operation: 'set', value: 'document' },
      { header: 'Sec-Fetch-Site', operation: 'set', value: 'none' },
    ],
    responseHeaders: [
      { header: 'X-Frame-Options', operation: 'remove' },
      { header: 'Content-Security-Policy', operation: 'remove' },
    ],
  },
  condition: {
    requestDomains: ['web.whatsapp.com'],
    resourceTypes: ['sub_frame'],
    initiatorDomains: [chrome.runtime.id, 'web.whatsapp.com'],
  },
};

// Same for WhatsApp added by hand as a Web Panel. In a normal desktop tab this sends
// the kind of user agent the browser already uses.
const TOP_LEVEL_RULE = {
  id: 2,
  action: { type: 'modifyHeaders', requestHeaders: DESKTOP_HEADERS },
  condition: { requestDomains: ['web.whatsapp.com'], resourceTypes: ['main_frame'] },
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.declarativeNetRequest
    .updateDynamicRules({
      removeRuleIds: [PANEL_FRAME_RULE.id, TOP_LEVEL_RULE.id],
      addRules: [PANEL_FRAME_RULE, TOP_LEVEL_RULE],
    })
    .catch((error) => console.error('Header rules:', error));
});

// Fires only when the toolbar click was not already handled by setPanelBehavior.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch {
    chrome.tabs.create({ url: 'https://web.whatsapp.com/' });
  }
});
