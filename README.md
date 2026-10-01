# iOS 27 Web

Una ricreazione di iOS 27, con il suo materiale **Liquid Glass** e Siri nella Dynamic Island, fatta interamente con HTML, CSS e JavaScript. Non ci sono librerie, non c'è un passaggio di build e non serve installare niente.

Su computer appare un iPhone con cornice, tasti laterali e una legenda dei comandi. Su telefono la pagina occupa tutto lo schermo e diventa il telefono.

## Novità di iOS 27

- **Liquid Glass regolabile:** in *Impostazioni › Aspetto › Liquid Glass* un cursore va da trasparente a colorato, con un'anteprima che cambia mentre lo trascini. Vale in tutto il sistema. Il vetro ha anche bordi più scuri e riflessi più luminosi.
- **Nuova sezione Aspetto** in Impostazioni: modalità chiara, scura e automatica, Liquid Glass e icone, prima sparse in *Schermo e luminosità*.
- **Siri nella Dynamic Island:** tieni premuto il tasto laterale, oppure scorri giù dal centro in alto per **Cerca o chiedi**, che sostituisce Spotlight. Durante l'elaborazione compare una pillola luminosa; la risposta arriva come scheda di vetro scuro che esce dall'isola. C'è anche l'app **Siri** per la conversazione completa.
- **Nuova mappa dei gesti** (con Siri AI attiva): in alto a sinistra il Centro Notifiche, al centro Cerca o chiedi, a destra il Centro di Controllo. I banner delle notifiche entrano da sinistra.
- **Widget extra-large (4×6)** a pagina intera per Meteo, Calendario, Musica e Foto. In modalità modifica una maniglia nell'angolo cambia la taglia del widget.
- **Schermata di blocco:** orologio compatto nella riga dei widget, cursore del volume, Now Playing che si cancella scorrendo a sinistra (sparisce anche dalla Dynamic Island). Per personalizzarla tieni premuto sulla schermata di blocco.
- **Centro di Controllo:** sopra un'app compare il pulsante per aprire le impostazioni di quell'app.
- **Fotocamera:** pannello dei controlli con i sei punti (flash, Live, timer, esposizione, stile, griglia, formato), con *Modifica* per scegliere quali mostrare in alto; nuova **modalità Siri** che analizza l'inquadratura.
- **Messaggi:** disegni a mano libera dal pulsante "+".
- **Promemoria in linguaggio naturale:** scrivi «Chiamare il dentista venerdì alle 10» e data e ora vengono compilate da sole.

Con Siri AI disattivata (*Impostazioni › Apple Intelligence e Siri*) i gesti tornano quelli di iOS 26.

## Animazioni

Ogni movimento usa la fisica delle molle di iOS, con gli stessi parametri di SwiftUI (*response* e *damping*), invece di durate e curve fisse. Si vede soprattutto in tre cose:

- **Seguono il dito:** quando lo stacchi, l'animazione riparte dalla velocità del gesto. Una spinta veloce arriva lontano, un rilascio lento torna indietro.
- **Si possono interrompere:** se riprendi un elemento mentre si muove, lo afferri da dov'è e con la sua velocità.
- **Si allungano oltre il bordo:** liste, pagine e pannelli trascinati oltre il limite fanno da elastico con la formula usata da iOS, poi tornano a posto.

Dove si vede:

- **Sblocco:** la schermata di blocco segue il dito e un tocco la fa saltellare. Le icone entrano a fuoco da più vicino. Al risveglio lo schermo si assesta con un leggero zoom.
- **App:** si aprono dall'icona e la Home si avvicina all'icona. Col gesto Home la finestra si rimpicciolisce sotto il dito; se la lanci torna nella sua icona. Se ti fermi compare il multitasking. Scorrendo lungo la barra Home passi da un'app all'altra. Nel multitasking le schede si lanciano e si buttano via con la velocità del dito.
- **Pannelli:** nel Centro di Controllo i moduli crescono dall'angolo, prima i più vicini, e tirando oltre si allungano. Anche Centro Notifiche, Cerca, banner e notifiche (cancellate con uno scorrimento) seguono il dito. Nella Dynamic Island il contenuto appare con sfocatura e scala, e la seconda attività si stacca come una goccia.
- **Home:** le pagine scorrono a scatti come una lista a pagine, con l'elastico ai bordi. Il dock lascia spazio alla Libreria app. In modifica ogni icona trema con un suo ritmo.
- **Controlli:**
  - Navigazione push e pop. Per tornare indietro puoi scorrere da qualsiasi punto, come in iOS 26.
  - Fogli trascinabili. I fogli grandi spingono indietro lo schermo.
  - Menu che nascono dal pulsante: tieni premuto e scorri su una voce per sceglierla.
  - Interruttori trascinabili.
  - Tab bar e controlli segmentati con la lente di vetro che si allunga in movimento e si trascina tra le voci.
  - Toccando un vetro si accende una luce sotto il dito.
- **Scorrimento col mouse:** si trascina come col dito, con inerzia, elastico ai bordi (anche con rotella e trackpad) e titolo grande che si ingrandisce.
- **Foto:** la foto si apre dalla sua miniatura. Trascinandola giù rimpicciolisce e torna al suo posto nella griglia.

Con *Impostazioni › Accessibilità › Riduci movimento* le molle non rimbalzano e le app si aprono in dissolvenza.

## Perché il web e non Godot

Un sistema operativo per telefono è fatto soprattutto di testo, liste, scorrimenti, animazioni a molla e materiali traslucidi. Il browser offre tutto questo in modo nativo:

- **Vetro vero:** `backdrop-filter` sfoca e satura in hardware ciò che sta dietro a ogni elemento. Nei browser Chromium un filtro SVG di spostamento rifrange lo sfondo ai bordi, come una lente.
- **Testo e interfaccia:** tipografia, scorrimento inerziale, campi di testo, accessibilità e selezione funzionano già. In un motore di gioco andrebbero ricostruiti da zero.
- **Gira ovunque:** basta aprire un link, anche su un iPhone vero, e lo si può aggiungere alla schermata Home a schermo intero.
- **Accesso al dispositivo:** fotocamera, bussola, batteria, geolocalizzazione, audio, dettatura e sintesi vocale, dati in rete (meteo e mappe reali).

## Come avviarlo

**Il modo più semplice:** apri `index.html` con un doppio clic.

**Con un server locale**, consigliato perché fotocamera e dettatura funzionano solo su `localhost` o `https`:

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
| Personalizzare il blocco | Tieni premuto sulla schermata di blocco | — |
| Tornare alla Home | Scorri in alto dalla barra in basso, oppure clic sulla barra | `Esc` / `H` |
| Multitasking | Scorri in alto dalla barra e fermati; nelle schede scorri di lato, butta via un'app verso l'alto | `M` |
| Cerca o chiedi | Scorri giù dal centro in alto (anche dentro le app) o dal centro della Home | `/` |
| Siri | Tieni premuto il tasto laterale destro | `S` |
| Centro Notifiche | Scorri giù dall'alto a sinistra | `N` |
| Centro di Controllo | Scorri giù dall'alto a destra | `C` |
| Cambiare pagina | Scorri a sinistra o a destra | `←` `→` |
| Menu rapido / modifica Home | Tieni premuta un'icona; in modifica trascina le icone o usa la maniglia dei widget | — |
| Bloccare / spegnere lo schermo | Premi il tasto laterale destro | `L` |
| Modalità silenziosa | Tasto Azione (in alto a sinistra) | — |
| Volume | Tasti volume | — |

## Cosa chiedere a Siri

Siri capisce richieste in italiano, ad esempio:

- «Che tempo fa domani a Milano?» · «Che ore sono?» · «Quanto fa 18 per 24?»
- «Imposta un timer di 5 minuti» · «Svegliami domani alle 7:30»
- «Ricordami di comprare il pane stasera» · «Crea una nota: idee per le vacanze»
- «Chiama mamma» · «Scrivi a Giulia che arrivo tardi» · «Cosa ho in programma oggi?»
- «Riproduci musica» · «Prossima canzone» · «Accendi la torcia» · «Disattiva il Wi-Fi»
- «Attiva la modalità scura» · «Alza la luminosità» · «Rendi il Liquid Glass più trasparente»
- «Apri Mappe»

Quando non capisce, propone una ricerca sul web. Le risposte possono anche essere lette ad alta voce (*Risposte vocali*).

## Cosa c'è

**Sistema:** schermata di blocco, Home con più pagine e widget, dock e pulsante "Cerca" in vetro, badge, Libreria app, modifica con riordino tra pagine e dock, stili icone (Predefinito, Scuro, Trasparente, Colorato), apertura delle app con zoom dall'icona, multitasking a schede, Dynamic Island con attività live (timer, musica, chiamata, Siri), Centro di Controllo, Centro Notifiche, banner, 7 sfondi generati in SVG.

**App (16)**

| App | Cosa fa |
| --- | --- |
| Impostazioni | Aspetto e Liquid Glass, Apple Intelligence e Siri, Wi-Fi, Bluetooth, Batteria, Sfondo, impostazioni per ogni app, Info, ripristino |
| Siri | Conversazione con Siri, suggerimenti, dettatura dove il browser la supporta |
| Calcolatrice | Espressioni con precedenza degli operatori, formato italiano (1.234,5), tastiera fisica |
| Orologio | Ora nel mondo, sveglie che suonano davvero, cronometro con giri, timer nella Dynamic Island |
| Meteo | Dati reali da Open-Meteo per 4 città, previsioni orarie e a 10 giorni; dati dimostrativi se offline |
| Note | Note salvate, ricerca, note fissate, titolo automatico dalla prima riga |
| Promemoria | Elenchi, elenchi smart, date e ore scritte in linguaggio naturale |
| Calendario | Vista mensile, agenda del giorno, creazione ed eliminazione di eventi |
| Foto | Libreria di foto generate al momento, album, preferiti, visualizzatore |
| Fotocamera | Fotocamera vera o simulata, controlli personalizzabili, timer, formati, stili, modalità Siri |
| Messaggi | Conversazioni con risposte simulate, disegni, notifiche e badge |
| Telefono | Preferiti, Recenti, Contatti, tastierino con toni DTMF, chiamata nella Dynamic Island |
| Musica | 8 brani generati dal vivo con Web Audio, mini player, player a schermo intero |
| Safari | Pagina iniziale, preferiti, barra indirizzi in vetro, navigazione dove i siti lo consentono |
| Mappe | OpenStreetMap, ricerca luoghi con Nominatim, livelli, posizione |
| Bussola | Sensori del telefono oppure ghiera da ruotare col mouse |

Note, promemoria, eventi, messaggi, sveglie, foto scattate, conversazione con Siri, disposizione della Home e impostazioni sono salvati nel browser (`localStorage`). Chi aveva usato la versione iOS 26 ritrova i propri dati. Per ripartire da zero: *Impostazioni › Generali › Trasferisci o inizializza iPhone*.

## Come è fatto il Liquid Glass

- `css/glass.css` definisce la classe `.glass`. Ogni contesto (sopra lo sfondo, app chiare, app scure) dichiara due estremi, trasparente e colorato, che vengono mescolati con `color-mix()` in base alla variabile `--gt` del cursore. Anche sfocatura e saturazione seguono il cursore. Bordo speculare con una maschera, bordo scurito e riflesso interno.
- `js/core/glass.js` aggiunge la rifrazione nei browser Chromium: genera una mappa di spostamento con la forma della lente e la applica con un filtro SVG usato come `backdrop-filter: url(#…)`.
- Chromium sposta l'origine dei filtri SVG in base all'ombra esterna dell'elemento: per questo il filtro vive su un livello interno `.lg-lens` senza ombre.

## Struttura

```
index.html               struttura della pagina e caricamento degli script
css/base.css             cornice del dispositivo, colori di sistema, temi
css/glass.css            materiale Liquid Glass con livello di trasparenza continuo
css/system.css           barra di stato, Dynamic Island, Siri, Home, widget, blocco, Centro di Controllo…
css/ui.css               componenti: navigazione, liste, interruttori, tab bar, fogli, avvisi
css/apps.css             stili delle singole app
js/core/os.js            stato, impostazioni, eventi, formattazione in italiano
js/core/motion.js        molle (response/damping), velocità del dito, elastico, curve CSS dalle molle
js/core/scroll.js        scorrimento col mouse con inerzia ed elastico ai bordi
js/core/siri.js          comprensione delle richieste, date in linguaggio naturale, scheda nell'isola
js/core/appmanager.js    apertura e chiusura delle app, gesto Home, multitasking
js/core/homescreen.js    pagine, dock, widget, modalità modifica, Libreria app
js/core/widgets.js       widget in taglia piccola, media ed extra-large
js/core/…                blocco, notifiche, Centro di Controllo, isola, audio, icone, sfondi, gesti
js/apps/*.js             le 16 app
fonts/, icons/           font Inter (licenza OFL) e icone dell'app web
```

Per aggiungere un'app, crea un file in `js/apps/`, chiama `OS.registerApp({ id, name, mount(root, ctx) { … } })`, aggiungi un'icona in `js/core/icons.js` e lo script in `index.html`.

## Limiti

- **Siri è simulata:** capisce un insieme ampio ma limitato di richieste con regole scritte a mano; non è un modello di intelligenza artificiale e non sa rispondere a domande di cultura generale (in quel caso propone la ricerca web).
- **Dettatura:** usa il riconoscimento vocale del browser. In Chrome l'audio viene elaborato dai server di Google; in alcuni browser non è disponibile e Siri si apre per scrivere.
- **Modalità Siri della Fotocamera:** analizza colori, luce, cielo e vegetazione dell'inquadratura; non riconosce oggetti specifici.
- Molti siti vietano di essere mostrati dentro un'altra pagina, quindi in Safari alcuni restano vuoti; compare un link per aprirli in una nuova scheda.
- Meteo, Mappe e la ricerca luoghi richiedono la connessione. Il Meteo ha dati di riserva offline.
- Su un iPhone vero i gesti dai bordi possono essere intercettati da Safari o da iOS.

## Note legali

Progetto amatoriale a scopo didattico, non affiliato né approvato da Apple Inc. "iOS", "iPhone", "Siri" e "Liquid Glass" sono marchi dei rispettivi proprietari. Icone, sfondi, suoni e musica sono originali e generati dal codice. Il font Inter è distribuito con licenza SIL Open Font License 1.1 (`fonts/LICENSE-Inter.txt`).
