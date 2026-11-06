(() => {
  'use strict';

  // all_frames is needed for the iframe in panel.html, not for frames inside WhatsApp.
  if (window !== window.top && !location.ancestorOrigins[0]?.startsWith('chrome-extension://')) return;

  const DEFAULTS = { enabled: true, threshold: 700, showNav: false };
  const MARKS = ['data-wsp', 'data-wsp-shell', 'data-wsp-path', 'data-wsp-current', 'data-wsp-drawer', 'data-wsp-slot', 'data-wsp-filled'];
  const NAV_MAX_WIDTH = 120;
  const ESCAPE_ATTEMPTS = 6;
  const ESCAPE_INTERVAL_MS = 200;

  const html = document.documentElement;
  let settings = { ...DEFAULTS };
  let shell = null;
  let lastMain = null;
  let showList = false;
  let closeMethod = null;
  let scheduled = false;
  let lastStatus = '';

  const getSide = () => document.getElementById('side');
  const getMain = () => document.getElementById('main');
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // --- Layout detection -----------------------------------------------------
  // WhatsApp's class names are generated and change often. Only #side and #main
  // are relied on: the columns are found from those ids and from the geometry.

  function isInFlow(el) {
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.position !== 'absolute' && style.position !== 'fixed';
  }

  function findShell(side, main) {
    if (main) {
      let node = side;
      while (node && !node.contains(main)) node = node.parentElement;
      return node && node !== document.body ? node : null;
    }
    // No chat open: the shell is the first ancestor where the column containing
    // #side sits next to another in-flow column.
    for (let child = side, parent = side.parentElement; parent && parent !== document.body; child = parent, parent = parent.parentElement) {
      const childRect = child.getBoundingClientRect();
      if (childRect.width >= parent.getBoundingClientRect().width - 8) continue;
      const hasColumnOnRight = [...parent.children].some(
        (sibling) => sibling !== child && isInFlow(sibling) && sibling.getBoundingClientRect().left >= childRect.right - 2
      );
      if (hasColumnOnRight) return parent;
    }
    return null;
  }

  function directChildContaining(parent, node) {
    while (node && node.parentElement !== parent) node = node.parentElement;
    return node;
  }

  function markPath(from, untilExclusive) {
    for (let node = from; node && node !== untilExclusive; node = node.parentElement) {
      node.setAttribute('data-wsp-path', '');
    }
  }

  function scan() {
    const side = getSide();
    const main = getMain();
    if (!side) return Boolean(shell && shell.isConnected);

    // Measure WhatsApp's own layout: removed and restored in the same task, so never painted.
    html.classList.remove('wsp-on');
    document.querySelectorAll(MARKS.map((mark) => `[${mark}]`).join(',')).forEach((el) => {
      MARKS.forEach((mark) => el.removeAttribute(mark));
    });

    shell = findShell(side, main);
    if (!shell) return false;
    shell.setAttribute('data-wsp-shell', '');

    const left = directChildContaining(shell, side);
    const viewportHeight = window.innerHeight;
    let seenLeft = false;
    for (const child of shell.children) {
      let role = 'ignore';
      if (child === left) {
        role = 'left';
        seenLeft = true;
      } else if (main && child.contains(main)) {
        role = 'pane';
      } else if (child.tagName !== 'SPAN' && isInFlow(child)) {
        if (seenLeft) {
          role = 'pane';
        } else {
          const rect = child.getBoundingClientRect();
          if (rect.width > 0 && rect.width < NAV_MAX_WIDTH && rect.height > viewportHeight / 2) role = 'nav';
        }
      } else if (getComputedStyle(child).position === 'absolute') {
        role = 'layer';
      }
      child.setAttribute('data-wsp', role);
    }

    markPath(shell.parentElement, html);
    markPath(side, left);
    if (main) markPath(main, directChildContaining(shell, main));
    return true;
  }

  function needsScan() {
    if (!shell || !shell.isConnected) return true;
    const side = getSide();
    const main = getMain();
    if (side && !(side.hasAttribute('data-wsp-path') || side.parentElement === shell)) return true;
    if (side && !side.closest('[data-wsp="left"]')) return true;
    if (main && !main.closest('[data-wsp="pane"]')) return true;
    if (main && !main.hasAttribute('data-wsp-path') && main.parentElement !== shell) return true;
    return [...shell.children].some((child) => !child.hasAttribute('data-wsp'));
  }

  // --- View state -----------------------------------------------------------

  function currentMode(main) {
    if (!main) {
      lastMain = null;
      showList = false;
      if (closeMethod === 'hidden-only') closeMethod = null;
      return 'list';
    }
    if (main !== lastMain) {
      lastMain = main;
      showList = false;
    }
    return showList ? 'list' : 'chat';
  }

  function markPanes(main) {
    const current = main ? directChildContaining(shell, main) : null;
    let afterCurrent = false;
    for (const child of shell.children) {
      const isCurrent = child === current;
      child.toggleAttribute('data-wsp-current', isCurrent);
      // A column after the chat that has content is an open drawer (contact info, media...).
      const isDrawer = afterCurrent && child.getAttribute('data-wsp') === 'pane' && child.textContent.trim().length > 0;
      child.toggleAttribute('data-wsp-drawer', isDrawer);
      if (isCurrent) afterCurrent = true;
    }
  }

  // WhatsApp opens New chat, Archived and similar panels in an absolute layer with
  // one slot per column, sized for the desktop layout. The first slot belongs to the
  // list side: it must hide while a chat is shown and come back afterwards.
  function markSlots() {
    for (const layer of shell.querySelectorAll(':scope > [data-wsp="layer"]')) {
      const slots = [...layer.children];
      if (slots.length < 2 || slots.some((slot) => slot.tagName !== 'DIV')) continue;
      slots.forEach((slot, index) => {
        slot.setAttribute('data-wsp-slot', index === 0 ? 'left' : 'right');
        slot.toggleAttribute('data-wsp-filled', slot.textContent.trim().length > 0);
      });
    }
  }

  function deactivate() {
    html.classList.remove('wsp-on', 'wsp-list', 'wsp-chat', 'wsp-show-nav');
  }

  function update() {
    scheduled = false;
    if (!chrome.runtime?.id) {
      // Extension reloaded or removed: this orphaned script must let go of the page.
      observer.disconnect();
      deactivate();
      return;
    }

    const narrow = settings.enabled && window.innerWidth < settings.threshold;
    if (!narrow) {
      deactivate();
      writeStatus(settings.enabled ? 'wide' : 'disabled');
      return;
    }
    if (needsScan() && !scan()) {
      deactivate();
      writeStatus(getSide() ? 'layout-not-recognized' : 'waiting-for-chats');
      return;
    }

    const main = getMain();
    const mode = currentMode(main);
    markPanes(main);
    markSlots();
    html.classList.add('wsp-on');
    html.classList.toggle('wsp-list', mode === 'list');
    html.classList.toggle('wsp-chat', mode === 'chat');
    html.classList.toggle('wsp-show-nav', settings.showNav);
    if (main) placeBackButton(main);
    writeStatus(mode);
  }

  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(update, 50);
  }

  // --- Back button ----------------------------------------------------------

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'wsp-back';
  backButton.title = "Torna all'elenco conversazioni";
  backButton.setAttribute('aria-label', backButton.title);
  backButton.innerHTML =
    '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>';
  backButton.addEventListener('click', (event) => {
    // The chat header opens the contact info when clicked.
    event.stopPropagation();
    goBack();
  });

  function placeBackButton(main) {
    const header = main.querySelector('header');
    if (header) {
      backButton.classList.remove('wsp-back--floating');
      if (backButton.parentElement !== header) {
        header.prepend(backButton);
        const title = header.querySelector('span[dir="auto"]');
        backButton.style.color = title ? getComputedStyle(title).color : '';
      }
    } else {
      backButton.classList.add('wsp-back--floating');
      backButton.style.color = '';
      if (backButton.parentElement !== document.body) document.body.append(backButton);
    }
  }

  function pressEscape(main) {
    const active = document.activeElement;
    const target = active && main.contains(active) ? active : main;
    for (const type of ['keydown', 'keyup']) {
      target.dispatchEvent(
        new KeyboardEvent(type, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, composed: true, cancelable: true })
      );
    }
  }

  async function goBack() {
    const main = getMain();
    if (!main) return;

    // Really closing the chat matters: a chat left open marks new messages as read.
    pressEscape(main);
    showList = true;
    update();

    // With a side panel open (e.g. Archived) the first Escape closes that panel, and
    // WhatsApp ignores further presses while it animates out: keep trying for a while.
    for (let attempt = 0; attempt < ESCAPE_ATTEMPTS; attempt++) {
      await sleep(ESCAPE_INTERVAL_MS);
      if (!main.isConnected) {
        closeMethod = 'escape';
        update();
        return;
      }
      pressEscape(main);
    }
    await sleep(ESCAPE_INTERVAL_MS);
    if (!main.isConnected) {
      closeMethod = 'escape';
      update();
      return;
    }
    // Escape ignored or swallowed: the chat stays open behind the list.
    closeMethod = 'hidden-only';
    update();
  }

  // In "hidden-only" state the chat is still open, so WhatsApp does not remount
  // #main if the same conversation is clicked again.
  document.addEventListener(
    'click',
    (event) => {
      if (showList && event.target instanceof Element && event.target.closest('#pane-side')) {
        showList = false;
        closeMethod = null;
        scheduleUpdate();
      }
    },
    true
  );

  // --- Status and diagnostics (read by the popup) ---------------------------

  function writeStatus(state) {
    const status = { state, width: window.innerWidth, threshold: settings.threshold, closeMethod };
    const serialized = JSON.stringify(status);
    if (serialized === lastStatus) return;
    lastStatus = serialized;
    chrome.storage.local.set({ status: { ...status, at: Date.now() } }).catch(() => {});
  }

  // Structure only: no text, labels, classes or test ids, and nothing from inside
  // the chat list or the conversation, since those can carry names and numbers.
  function skeleton(el, depth = 0) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const parts = [el.tagName.toLowerCase()];
    if (el.id) parts.push(`#${el.id}`);
    if (el.getAttribute('role')) parts.push(`role=${el.getAttribute('role')}`);
    if (el.hasAttribute('data-wsp')) parts.push(`wsp=${el.getAttribute('data-wsp')}`);
    if (el.hasAttribute('data-wsp-shell')) parts.push('wsp-shell');
    parts.push(`${Math.round(rect.width)}x${Math.round(rect.height)}@${Math.round(rect.left)},${Math.round(rect.top)}`, style.display, style.position);
    const lines = ['  '.repeat(depth) + parts.join(' ')];
    if (depth < 9 && el.id !== 'main' && el.id !== 'pane-side') {
      for (const child of [...el.children].slice(0, 12)) {
        if (child.tagName !== 'svg') lines.push(...skeleton(child, depth + 1));
      }
    }
    return lines;
  }

  function writeDiagnostics() {
    const app = document.getElementById('app') || document.body;
    const report = {
      at: new Date().toISOString(),
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      settings,
      htmlClasses: [...html.classList].filter((name) => name.startsWith('wsp-')),
      closeMethod,
      hasSide: Boolean(getSide()),
      hasMain: Boolean(getMain()),
      tree: skeleton(app).join('\n'),
    };
    chrome.storage.local.set({ diagnostics: report }).catch(() => {});
  }

  // --- Wiring ---------------------------------------------------------------

  const observer = new MutationObserver(scheduleUpdate);
  observer.observe(html, { childList: true, subtree: true });
  window.addEventListener('resize', scheduleUpdate);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.diagnosticsRequest) writeDiagnostics();
    if (Object.keys(DEFAULTS).some((key) => key in changes)) {
      for (const key of Object.keys(DEFAULTS)) {
        if (key in changes) settings[key] = changes[key].newValue ?? DEFAULTS[key];
      }
      scheduleUpdate();
    }
  });

  chrome.storage.local.get(DEFAULTS).then((stored) => {
    settings = stored;
    update();
  });
})();
