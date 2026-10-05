# Stato del progetto

Versione prodotta dal generatore in questo repository (build completa da `generator/build.py`).
I numeri sono quelli di `build/report.json` dell'ultima build completa e si rigenerano a ogni
build: livello di 341 MB in 1052 file, archivio `extreme_world.zip` di 117 MB.

## Ambiente e limiti

- BeamNG.drive **non è installato** nell'ambiente di sviluppo (contenitore Linux senza GPU né
  gioco): il caricamento del livello in gioco **non è stato provato**. Le prove da fare sono in
  [`TEST_MANUALE.md`](TEST_MANUALE.md).
- La versione del gioco non è verificabile. I formati sono stati ricavati da fonti consultabili
  in locale: il livello Utah2 (file di un livello BeamNG reale), l'importatore di livelli BeamNG
  per Blender, il sorgente di Torque3D (motore da cui deriva BeamNG) e beamngpy. Ogni formato
  usato e la sua fonte sono in [`FORMATI_BEAMNG.md`](FORMATI_BEAMNG.md).
- Il sito documentation.beamng.com non è raggiungibile dall'ambiente (criterio di rete
  dell'ambiente cloud): nessuna informazione è stata presa da lì.
- Dimensione: 4096 × 4096 vertici a 2 m = **8,19 × 8,19 km** (67 km²). È il massimo con il
  passo di 2 m consigliato per BeamNG sotto il limite pratico di 8192 vertici che si può
  costruire e verificare in tempi ragionevoli; il generatore è parametrico (`config/world.json`)
  per un'espansione successiva.

## Funzionalità completate

"Completata" significa: generata nei file del livello e controllata dal validatore statico e,
per le parti geometriche, nell'anteprima 3D dei file generati. Il comportamento in gioco
(fisica, collisioni, IA, prestazioni) resta da provare con il gioco.

| Area | Contenuto generato |
|---|---|
| Terreno | `theTerrain.ter` v8 4096², quote 136–1713 m; rilievo da punti di controllo + rumore + erosione idraulica e termica; **The Giant** (cima più alta, 1713 m, con una grande parete e creste), **The Crater** (cratere con cresta, conche, canaloni), **The Wall** (massiccio a pareti a gradoni), cime secondarie, creste, valli, canyon (Gola della Forra), calanchi, altipiani |
| Regioni A–F | sei regioni con transizioni sfumate (rilievo, vegetazione e materiali variano gradualmente) |
| Materiali del terreno | 16 materiali PBR procedurali (base color, normal, roughness, AO, height, con texture di dettaglio e macro) con groundmodel verificati (asfalto, ghiaia, terra, fango, erba, roccia, sabbia, neve, ...): l'aderenza cambia con la superficie |
| Rete stradale | 38 strade, 87 km: autostrada, tangenziale, statali, provinciali, urbane, locali, di montagna, strette, sterrate e sentieri; 3 rotatorie; 43 ponti e viadotti con pile e spalle; profili con pendenza limitata per classe (A1 5 %, statali 8,5 %, locali 12 %, ...) |
| Autostrada A1 | 7,4 km a carreggiate separate, 2 corsie per senso, spartitraffico con barriera, banchine, guardrail, segnaletica orizzontale (decal), 3 svincoli a rombo con corsie di decelerazione/accelerazione, viadotti, galleria a doppia canna di 724 m con testate, cartelli di uscita e di area di servizio, **7 piazzole di emergenza** (3 m oltre la banchina, raccordi, guardrail che gira intorno, cartello "PIAZZOLA SOS") |
| Aree di servizio | Montalba Sud e Nord sull'A1: parcheggio auto (44 stalli per lato), stalli camion, distributore con pensilina, edificio, area picnic; piazzali che seguono la corsia di servizio, pavimentazione continua dalla corsia ai piazzali |
| Tangenziale T1 | 2 corsie per senso, carreggiate separate, rotatorie alle estremità, svincolo a rombo con la SS1 (cavalcavia), collegata all'A1 tramite SP8 e SP9 e i rispettivi svincoli |
| Strade di montagna | tornanti posati sul pendio: ogni tratto sta dove il terreno ha la quota che la strada deve avere, con raggio minimo dei tornanti e distanza dai tratti sottostanti che cresce con il dislivello; SS4 Passo del Gigante (20 tornanti), SP10 (25), SP12 (14), SP14 (12), SP7 (3) |
| Piazzole panoramiche | 9 slarghi di 7 m dove il terreno scende di oltre 100 m o c'è un lago in vista (SP12, SP13, SP10, SP5, SS4, SS3, SS1), con cartello marrone e panchine |
| Percorsi speciali | **A** SP5 Strada sul Precipizio (mezzacosta a quota 905 m); **B** tornanti di SP10, SS4, SP12; **C** SP11 Strada della Forra (nella gola); **D** SP13 Strada di Cresta del Cratere (salita sul fianco del cratere e poi la cresta nord-est a 1400–1490 m, con viadotti sulle selle; pendenza fino al 25 %); **E** E1 Strada Distrutta (buche, cedimenti, frane, detriti con geometria reale); **F** F1 Salita Impossibile (408 m, pendenza media 41 %, massima 74 % su 20 m, superficie roccia/ghiaione con gradini di roccia); **G** E2 Sentiero dei Calanchi (fango, terra; anello senza tratti ripercorsi); **H** passaggio tra le rocce su E2 (tre strettoie da 2,92–3,07 m misurate sulle mesh, poi 14 massi da 0,36–0,76 m da scavalcare); **I** SP14 Spirale di Monte Spirale (tornanti e ricciolo in vetta che passa sopra se stesso su un ponte); **J** tratto allagato della SS3 sul Lago Grande (35 cm d'acqua sopra la carreggiata) |
| Buche | 400 buche reali in 16 tratti (mesh di asfalto deformato sopra il terreno abbassato) su PT (pista prove, 6 zone: buche piccole, medie, grandi, ondulazioni, avvallamenti, bordi sbrecciati) ed E1; le strade principali restano regolari |
| Acqua | Lago Grande, Lago Alto (valle montana), Bacino di Montalba (artificiale, con diga di 388 m alta 74 m); sponde chiuse da un cordone, da spiagge di ghiaia a sponde rocciose; 34 WaterBlock (copertura 99,6–100 %); 3 fiumi (Fiume Alba, Torrente Forra, Rio Est) come oggetti `River` sugli alvei scavati |
| Vegetazione | foresta (un oggetto `Forest`, istanze in `forest4.json`) con abeti, pini, faggi, mughi, cespugli, alberi secchi e massi: circa 360 000 istanze distribuite per quota, pendenza e regione, con limite del bosco, radure e fasce libere lungo strade e strutture; 2 GroundCover di erba con 12 tipi sui materiali erba/sottobosco/terra |
| Centri abitati | Montalba (251 edifici), Pratolungo (72), Forra (4), zona industriale (21 capannoni, magazzini e silos, collegata alla tangenziale tramite SP9), 6 cascine isolate; case con tetto a falde, chiesa, negozi, marciapiedi; collisione su mesh dedicata |
| Arredo stradale | cartelli direzionali con testo (22), segnali autostradali (8), frecce di curva (294), cartelli di pericolo (9), cartelli delle piazzole (22), panchine (18), lampioni (140), muri di contenimento continui (8,8 km), delineatori (1802), guardrail (54,8 km) e barriere (8,3 km); nulla sulla piattaforma di altre strade |
| Ambiente | cielo, sole e ombre, nebbia atmosferica, nebbia sott'acqua; 4 punti di partenza su strada |
| Ottimizzazione | LOD su tutte le mesh (dettagli per distanza, billboard per gli alberi lontani), mesh raggruppate per celle (678 mesh in tutto invece di decine di migliaia di oggetti), alberi come istanze di forest, atlanti di texture per facciate, cartelli ed erba |
| Strumenti | validatore statico, test automatici (mesh, tornanti, piazzole), anteprima 3D dei file generati, prova dei singoli moduli |

## Revisione del codice

Una revisione indipendente dei sei moduli (edifici, servizio, danni, rocce, arredo, erba) ha
segnalato 21 difetti verificati con dati della build; sono stati tutti corretti, tra cui: case
che potevano finire contro una parete rocciosa, piazzali dell'area di servizio staccati dalla
corsia, zone di danni sugli incroci di E1 con se stessa, massi sospesi sulla salita F1 e
"gradini" del giardino di massi quasi a filo del sentiero, frecce di curva sulla carreggiata nei
tornanti, cartelli USCITA sull'A1 senza uscita, oggetti sulla piattaforma delle rampe, muri di
contenimento a dente di sega e senza testate, bordi chiari dell'erba, pali dei cartelli sospesi.

Controllando i risultati è stato aggiunto al validatore il confronto fra la superficie di ogni
strada e il terreno: ha rivelato e fatto correggere strade sepolte dalle scarpate di altre strade,
rampe che scendevano sotto la carreggiata principale, la SS3 sovrapposta alla SS1, la SP13 in una
trincea profonda fino a 240 m e le strade a tornanti (SS4, SP14, SP12, SP10) scavate 50–100 m nel
pendio: ora le scarpate non toccano mai la piattaforma di un'altra strada e i tornanti seguono il
terreno.

## Parziali o semplificate

- **Collegamento tangenziale–autostrada**: indiretto (T1 → rotatoria → SP8/SP9 → svincolo A1),
  non con uno svincolo diretto tra le due strade.
- **Edifici**: solo esterni (nessun interno), forme semplici; le officine non sono un tipo a parte.
- **Fiumi**: oggetti `River` di BeamNG sugli alvei; la corrente e la resa visiva vanno provate in
  gioco. Nessun ruscello minore oltre ai tre corsi d'acqua.
- **Strada allagata (J)**: acqua ferma di un WaterBlock sopra la carreggiata; l'effetto
  sul veicolo dipende dalla simulazione dell'acqua del gioco.
- **IA**: le DecalRoad del grafo dell'IA sono generate per strade e svincoli, ma la guida
  dell'IA non è stata provata.
- **Strada di cresta (D)**: la cresta del cratere ha selle e gradini del 50–80 %; la strada segue
  il tratto di cresta più continuo (nord-est) e supera le selle con viadotti (488 m).

## Non implementate

- Cascate.
- Interni degli edifici; parcheggi urbani dedicati (esistono quelli delle aree di servizio).
- Script Lua o scenari: il livello è solo Freeroam.

## Problemi noti

Avvisi del validatore nell'ultima build (nessun errore):

- RA_OVEST: un punto in cui la pendenza del terreno quantizzato cambia di 12,8 cm su 1 m;
- due WaterBlock del Bacino di Montalba coprono più di una zona sotto il livello dell'acqua;
- Lago Grande: 235 vertici sotto il livello fuori dai WaterBlock (profondità massima 4,7 m), non
  collegati all'acqua del lago (avvallamenti asciutti).

Altri limiti noti, misurati sulla build:

- SS4 sale una parete con pendenza superiore al 100 %: i tornanti sono sovrapposti a terrazze,
  con scavi a monte fino a 42 m (95 % del tracciato sotto i 28 m);
- le rampe dello svincolo SV_ZI hanno tratti all'8,6–8,8 % (massimo previsto 8 %): la loro
  lunghezza è limitata dalla galleria e dai viadotti vicini; l'ultimo tratto della SS3 (12 m) si
  innesta sulla SS1 al 9,6 % (massimo 8,5 %);
- i tornanti più stretti di SS4 hanno raggio di circa 6 m sull'asse (manovra lenta).

## Prove eseguite

| Prova | Esito |
|---|---|
| `python3 generator/validate.py build` sulla build completa: formati, materiali e texture, groundmodel, scena, mesh Collada (pycollada e gerarchia), spawn, pendenze delle strade sul terreno quantizzato, superficie delle strade sul terreno fuori da ponti e gallerie, sponde dei laghi e copertura dei WaterBlock, foresta, GroundCover | 0 errori, 4 avvisi (elencati sopra) |
| `pytest tests`: orientamento e volume delle mesh, tornanti su un pendio sintetico (la strada sale con la pendenza voluta, nessuna inversione di marcia), profilo degli allargamenti delle piazzole | 6 superati |
| Controlli sulla rete stradale: scavi e riporti per strada, distanza fra strade diverse a quote diverse, rami della stessa strada troppo vicini, raggi di curvatura sotto il minimo del tipo | eseguiti a ogni modifica; risultati riportati sopra |
| `tools/dev/run_module.py` per ciascun modulo su terreno e strade reali, con verifica di validità e orientamento delle facce delle mesh | superati |
| Revisione indipendente del codice dei moduli con prove sulla build (più semi casuali per edifici e servizio) | 21 difetti trovati, tutti corretti |
| Anteprima 3D (three.js in Chromium headless) dei file generati: gallerie e imbocchi, ponti, diga, svincoli, edifici, area di servizio, buche, rocce, cartelli, foreste, tornanti di SS4, SP7 e SP14, cresta della SP13, piazzola sull'A1 | controllo visivo; i difetti trovati sono stati corretti |
| Lettura del `.ter` scritto e confronto con `terrain.json` e config; integrità dell'archivio zip | superate |

**Non eseguite** (servono il gioco o hardware con GPU): caricamento in BeamNG.drive, guida
sulle strade, collisioni di edifici/rocce/guardrail, comportamento delle buche sulle sospensioni,
acqua e fiumi in gioco, IA, prestazioni (FPS, tempo di caricamento, memoria).
