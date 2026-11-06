# WhatsApp Side Panel Layout

Estensione per Vivaldi (e altri browser Chromium). Quando WhatsApp Web è più stretto della soglia scelta, mostra un pannello alla volta, come Telegram: l'elenco conversazioni oppure la conversazione, con un tasto per tornare indietro. Sopra la soglia la pagina resta quella normale.

## Installazione

1. Apri `vivaldi://extensions` e attiva **Modalità sviluppatore**.
2. Clicca **Carica estensione non pacchettizzata** e scegli questa cartella.
3. Clicca l'icona dell'estensione nella barra degli strumenti per aprire WhatsApp nel pannello laterale.

### Se il pannello non si apre

Vivaldi supporta `chrome.sidePanel` solo in parte. In alternativa aggiungi WhatsApp come pannello web: nella barra laterale clicca **+** (Aggiungi pannello web) e inserisci `https://web.whatsapp.com`. Il layout funziona allo stesso modo.

## Impostazioni

Dalle **Opzioni** dell'estensione (tasto destro sull'icona, oppure `vivaldi://extensions`):

- **Attiva**: accende o spegne il layout.
- **Larghezza massima**: sotto questo valore si passa al pannello singolo (predefinito 700 px).
- **Barra icone a sinistra nell'elenco**: mostra Stato, Canali e Impostazioni accanto all'elenco. È spenta di default; in alternativa basta allargare il pannello.
- **Copia diagnostica**: copia la struttura della pagina, senza testi, nomi o numeri, per capire cosa non va se WhatsApp cambia layout.

## Limiti noti

- Si appoggia a `#side`, `#main` e alla struttura delle colonne di WhatsApp Web, che può cambiare. Se il layout non viene riconosciuto la pagina resta normale e il popup lo segnala.
- Il tasto indietro chiude la chat simulando Esc, così i nuovi messaggi non risultano letti. Se non ci riesce, la chat resta aperta dietro l'elenco e il popup lo segnala.
- Da una chat aperta in Archiviate, il tasto indietro riporta all'elenco principale, perché Esc chiude anche Archiviate.
- Nel pannello dell'estensione WhatsApp gira in un iframe: per farlo accettare, `background.js` toglie `X-Frame-Options` e `Content-Security-Policy` e cambia gli header `Sec-Fetch-*`, solo per quell'iframe. Se WhatsApp cambia i controlli lato server può smettere di caricarsi; in quel caso resta il pannello web.
- I pannelli di Vivaldi si presentano come browser mobile e WhatsApp risponde con la pagina "usa un computer": l'estensione invia a WhatsApp uno user agent desktop (`background.js`, `desktop-ua.js`).
- WhatsApp accetta una sola finestra attiva: pannello, tab e pannello web si contendono la sessione con l'avviso "Usa qui".

## Test

`test/fixture.html` è una finta WhatsApp con gli stessi elementi da cui dipende l'estensione. Aperta in un browser, scrive l'esito dei controlli in fondo alla pagina, anche con `?noesc=1`. Va aperta con la finestra stretta (sotto 700 px) e poi larga, e non sostituisce una prova sulla pagina vera.
