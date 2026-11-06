// Runs in the page's own world before WhatsApp's scripts. Vivaldi's panels present
// themselves as a mobile browser, and WhatsApp answers with its "use a computer" page.
// Does nothing when the browser already presents itself as desktop.
(() => {
  const realUserAgent = navigator.userAgent;
  if (!/Mobile|Android|iPhone/.test(realUserAgent) && !navigator.userAgentData?.mobile) return;

  const chromeVersion = realUserAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? '130.0.0.0';
  const desktopUserAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;

  const override = (proto, values) => {
    for (const [name, value] of Object.entries(values)) {
      Object.defineProperty(proto, name, { get: () => value, configurable: true });
    }
  };

  override(Navigator.prototype, {
    userAgent: desktopUserAgent,
    appVersion: desktopUserAgent.replace('Mozilla/', ''),
    platform: 'Win32',
    maxTouchPoints: 0,
  });
  if (window.NavigatorUAData) {
    override(NavigatorUAData.prototype, { mobile: false, platform: 'Windows' });
  }
})();
