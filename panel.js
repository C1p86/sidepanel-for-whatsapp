const title = chrome.i18n.getMessage('panelTitle');

document.documentElement.lang = chrome.i18n.getUILanguage();
document.documentElement.dir = chrome.i18n.getMessage('@@bidi_dir');
document.title = title;
document.querySelector('iframe').title = title;
