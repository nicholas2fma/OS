# iOS 26 Web

Una ricreazione di iOS 26 e del suo materiale **Liquid Glass**, fatta interamente con HTML, CSS e JavaScript. Non ci sono librerie, non c'è un passaggio di build e non serve installare niente.

Su computer appare un iPhone con cornice, tasti laterali e una legenda dei comandi. Su telefono la pagina occupa tutto lo schermo e diventa il telefono.

## Perché il web e non Godot

Un sistema operativo per telefono è fatto soprattutto di testo, liste, scorrimenti, animazioni a molla e materiali traslucidi. Il browser offre tutto questo in modo nativo:

- **Vetro vero:** `backdrop-filter` sfoca e satura in hardware ciò che sta dietro a ogni elemento. Nei browser Chromium un filtro SVG di spostamento rifrange lo sfondo ai bordi, come una lente. In Godot ogni pannello avrebbe bisogno di uno shader che legge la texture dello schermo.
- **Testo e interfaccia:** tipografia, scorrimento inerziale, campi di testo, accessibilità e selezione funzionano già. In un motore di gioco andrebbero ricostruiti da zero.
- **Gira ovunque:** basta aprire un link, anche su un iPhone vero, e lo si può aggiungere alla schermata Home a schermo intero. Godot richiederebbe un export per ogni piattaforma.
- **Accesso al dispositivo:** fotocamera (`getUserMedia`), bussola (`DeviceOrientation`), batteria, geolocalizzazione, audio (Web Audio) e dati in rete (meteo e mappe reali).

## Come avviarlo

**Il modo più semplice:** apri `index.html` con un doppio clic.

**Con un server locale**, consigliato perché la fotocamera funziona solo su `localhost` o `https`:

```bash
python3 -m http.server 8000
# poi apri http://localhost:8000
```

**Sul telefono:** pubblica il repository con GitHub Pages (Settings › Pages › branch) e apri il link da Safari. Con *Condividi › Aggiungi alla schermata Home* si apre a schermo intero.

Il browser consigliato è Chrome o Edge: hanno l'effetto completo con rifrazione. Safari e Firefox mostrano il vetro sfocato senza la distorsione ai bordi.

## Gesti e scorciatoie

Con il mouse, trascina come faresti con un dito.

| Azione | Gesto | Tastiera |
| --- | --- | --- |
| Sbloccare | Scorri verso l'alto sulla schermata di blocco | `Invio` |
| Tornare alla Home | Scorri in alto dalla barra in basso, oppure clic sulla barra | `Esc` / `H` |
| Multitasking | Scorri in alto dalla barra e fermati; nelle schede scorri di lato, butta via un'app verso l'alto | `M` |
| Centro di Controllo | Scorri giù dall'angolo in alto a destra | `C` |
| Centro Notifiche | Scorri giù dall'alto a sinistra | `N` |
| Cerca (Spotlight) | Scorri giù sulla Home, oppure tocca "Cerca" | `/` |
| Cambiare pagina | Scorri a sinistra o a destra | `←` `→` |
| Menu rapido / modifica Home | Tieni premuta un'icona; in modifica trascina le icone | — |
| Bloccare / spegnere lo schermo | Tasto laterale destro | `L` |
| Modalità silenziosa | Tasto Azione (in alto a sinistra) | — |
| Volume | Tasti volume | — |

## Cosa c'è

**Sistema**

- Schermata di blocco con orologio in vetro, widget, notifiche impilate, Now Playing, torcia e fotocamera, sblocco con Face ID simulato.
- Home con più pagine, widget (Meteo, Calendario, Musica, Orologio, Batterie), dock e pulsante "Cerca" in vetro, badge, Libreria app.
- Modifica Home: icone che tremano, riordino col trascinamento anche tra pagine e nel dock, aggiunta e rimozione di widget e app.
- Stili delle icone: Predefinito, Scuro, Trasparente, Colorato (con tinta regolabile).
- Apertura e chiusura delle app con zoom dall'icona, gesto Home interattivo, multitasking a schede.
- Dynamic Island con attività live (timer, musica, chiamata), vista espansa, seconda bolla e avvisi rapidi.
- Centro di Controllo con connessioni, Now Playing, luminosità, volume, Full immersione, torcia, modalità scura e altro.
- Centro Notifiche, banner, Spotlight con calcolatrice, contatti, note e ricerca web.
- Modalità chiara, scura e automatica; Liquid Glass "Trasparente" o "Colorato"; 7 sfondi generati in SVG.

**App (15)**

| App | Cosa fa |
| --- | --- |
| Impostazioni | Wi-Fi, Bluetooth, Batteria, Schermo e luminosità (Liquid Glass), Sfondo, icone, suoni, Full immersione, Info, ripristino |
| Calcolatrice | Espressioni con precedenza degli operatori, formato italiano (1.234,5), tastiera fisica |
| Orologio | Ora nel mondo, sveglie che suonano davvero, cronometro con giri, timer con attività nella Dynamic Island |
| Meteo | Dati reali da Open-Meteo per 4 città, previsioni orarie e a 10 giorni, sfondi animati; dati dimostrativi se offline |
| Note | Note salvate, ricerca, note fissate, titolo automatico dalla prima riga |
| Promemoria | Elenchi, elenchi smart (Oggi, Programmati, Tutti, Contrassegnati), modifica in linea |
| Calendario | Vista mensile, agenda del giorno, creazione ed eliminazione di eventi |
| Foto | Libreria di foto generate al momento, album, preferiti, visualizzatore con scorrimento |
| Fotocamera | Fotocamera vera (anteriore e posteriore) o anteprima simulata, zoom, modalità; gli scatti finiscono in Foto |
| Messaggi | Conversazioni con risposte simulate, indicatore di scrittura, notifiche e badge |
| Telefono | Preferiti, Recenti, Contatti, tastierino con toni DTMF, chiamata con timer nella Dynamic Island |
| Musica | 8 brani generati dal vivo con Web Audio, mini player, player a schermo intero, controlli ovunque |
| Safari | Pagina iniziale, preferiti, barra indirizzi in vetro, navigazione (dove i siti lo consentono) |
| Mappe | OpenStreetMap, ricerca luoghi con Nominatim, livelli, posizione |
| Bussola | Sensori del telefono oppure ghiera da ruotare col mouse |

Note, promemoria, eventi, messaggi, sveglie, foto scattate, disposizione della Home e impostazioni sono salvati nel browser (`localStorage`). Per ripartire da zero usa *Impostazioni › Generali › Trasferisci o inizializza iPhone*.

## Come è fatto il Liquid Glass

- `css/glass.css` definisce la classe `.glass`: sfondo traslucido, `backdrop-filter` con sfocatura, saturazione e luminosità, un bordo speculare disegnato con una maschera e un riflesso interno. Lo stesso elemento cambia aspetto sopra lo sfondo, nelle app chiare e nelle app scure tramite variabili CSS.
- `js/core/glass.js` aggiunge la rifrazione nei browser Chromium. Per ogni elemento genera una mappa di spostamento con la forma della lente (smussatura convessa sul bordo arrotondato) e la applica con un filtro SVG usato come `backdrop-filter: url(#…)`.
- Chromium sposta l'origine dei filtri SVG in base all'ombra esterna dell'elemento. Per questo il filtro vive su un livello interno `.lg-lens` senza ombre.

## Struttura

```
index.html               struttura della pagina e caricamento degli script
css/base.css             cornice del dispositivo, colori di sistema, temi
css/glass.css            materiale Liquid Glass
css/system.css           barra di stato, Dynamic Island, Home, blocco, Centro di Controllo…
css/ui.css               componenti: navigazione, liste, interruttori, tab bar, fogli, avvisi
css/apps.css             stili delle singole app
js/core/os.js            stato, impostazioni, eventi, formattazione in italiano
js/core/appmanager.js    apertura e chiusura delle app, gesto Home, multitasking
js/core/homescreen.js    pagine, dock, widget, modalità modifica, Libreria app
js/core/…                blocco, notifiche, Centro di Controllo, isola, audio, icone, sfondi
js/apps/*.js             le 15 app
fonts/, icons/           font Inter (licenza OFL) e icone dell'app web
```

Per aggiungere un'app, crea un file in `js/apps/`, chiama `OS.registerApp({ id, name, mount(root, ctx) { … } })`, aggiungi un'icona in `js/core/icons.js` e lo script in `index.html`.

## Limiti

- Molti siti vietano di essere mostrati dentro un'altra pagina, quindi in Safari alcuni restano vuoti; in quel caso compare un link per aprirli in una nuova scheda.
- Meteo, Mappe e la ricerca luoghi richiedono la connessione. Il Meteo ha dati di riserva offline.
- Una pagina web non può sostituire il vero sistema: su un iPhone vero i gesti dai bordi possono essere intercettati da Safari o da iOS.

## Note legali

Progetto amatoriale a scopo didattico, non affiliato né approvato da Apple Inc. "iOS", "iPhone" e "Liquid Glass" sono marchi dei rispettivi proprietari. Icone, sfondi, suoni e musica sono originali e generati dal codice. Il font Inter è distribuito con licenza SIL Open Font License 1.1 (`fonts/LICENSE-Inter.txt`).
