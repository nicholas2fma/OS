# Prove manuali in BeamNG.drive

Il livello non è stato caricato nel gioco durante lo sviluppo (BeamNG.drive non era disponibile).
Questa lista serve a verificarlo in gioco nell'ordine consigliato. Per ogni punto annotare
esito, versione del gioco e, in caso di problemi, le righe del log del gioco (`beamng.log` nella
cartella utente) e una schermata.

Coordinate: metri nel sistema del livello (x verso est, y verso nord, z quota), le stesse che
mostra il World Editor del gioco. Il centro della mappa è (0, 0); i bordi sono a ±4096 m.

## 0. Installazione

1. Copiare `extreme_world.zip` (senza estrarlo) nella cartella `mods` della cartella utente.
2. Avviare il gioco. Nel gestore delle mod la mod deve risultare attiva.
3. *Freeroam* → la mappa **Extreme World** deve comparire con l'immagine di anteprima e la
   descrizione.

Se la mappa non compare: controllare nel log gli errori su `levels/extreme_world/info.json`.

## 1. Caricamento

| # | Prova | Atteso |
|---|---|---|
| 1.1 | Caricare la mappa dallo spawn predefinito (Lago Grande - sponda sud) | caricamento senza errori; veicolo appoggiato sulla strada SS1 |
| 1.2 | Tempo di caricamento e memoria | annotare (il terreno 4096² e circa 359 000 istanze di vegetazione sono la parte più pesante) |
| 1.3 | Log del gioco | nessun errore su materiali, texture, mesh (`.dae`), forest o terreno |
| 1.4 | Gli altri spawn (Autostrada A1, Montalba, Tornanti del Passo del Gigante su un rettilineo della SS4 a 557 m) | veicolo sulla strada, non sospeso né interrato |

## 2. Terreno e materiali

| # | Prova | Atteso |
|---|---|---|
| 2.1 | Guardare The Giant (cima a circa (-450, 2750)), The Crater (circa (-2900, 1100)) e The Wall | rilievi imponenti, creste irregolari, rocce sui pendii ripidi, neve solo in vetta |
| 2.2 | Passare da erba a terra, ghiaia, roccia, sabbia | texture coerenti, nessun materiale rosa o mancante |
| 2.3 | Guidare fuori strada su erba, fango, ghiaione e roccia | aderenza diversa per superficie (groundmodel) |
| 2.4 | Cercare buchi o fessure nel terreno, specie presso gli imbocchi della galleria A1 | nessun foro visibile tranne quelli coperti dalla galleria |

## 3. Autostrada A1 e tangenziale

| # | Prova | Atteso |
|---|---|---|
| 3.1 | Percorrere tutta l'A1 da (-1830, -2800) a (3132, -701), circa 7,4 km | due corsie per senso, spartitraffico, banchine, segnaletica; nessun gradino tra i tratti |
| 3.2 | Galleria a doppia canna (imbocchi a (3420, -1515) e (3349, -856)) | entrata e uscita senza urti; pareti e soffitto con collisione; nessun foro verso il vuoto |
| 3.3 | Viadotti e ponti sull'A1 (es. viadotto tra s 5053 e 5423 m) | impalcato percorribile, guardrail con collisione, raccordo pulito con la strada |
| 3.4 | Svincoli a rombo: SP8 (circa (1190, -3210)), SP9 (circa (3265, -2045)), T1/SS1 | uscire e rientrare: rampe percorribili, corsie di decelerazione/accelerazione |
| 3.5 | Aree di servizio Montalba Sud e Nord (A1 tra x 150 e 770, y circa -3260) | ingresso e uscita dall'A1, parcheggio, distributore, edificio; collisioni |
| 3.6 | Cartelli di uscita e di area di servizio | testo leggibile e non speculare, rivolto verso chi arriva |
| 3.7 | Tangenziale T1 (da (1262, -2446) a (2770, -2297)) e rotatorie | due corsie per senso, rotatorie percorribili, sottopasso della SS1 |
| 3.8 | Piazzole di emergenza dell'A1, carreggiata verso est: (-1538, -3076), (-555, -3258), (1681, -3151), (2583, -2967); verso ovest: (-890, -3197), (-54, -3251), (2895, -2829) | cartello blu "PIAZZOLA SOS" 150 m prima dell'inizio dello slargo; slargo asfaltato di 3 m oltre la banchina con raccordi; il guardrail gira intorno allo slargo senza aperture; ci si ferma e si riparte senza urti |

## 4. Strade ordinarie e percorsi speciali

| # | Percorso | Dove inizia | Atteso |
|---|---|---|---|
| 4.1 | A — SP5 Strada sul Precipizio | (2862, 2312) a quota 904 m | strada stretta di mezzacosta, parete da un lato e vuoto dall'altro |
| 4.2 | B — tornanti: SP10 verso il Lago Alto e SS4 Passo del Gigante | SP10 dalla SS3 a (-952, 1077); SS4 dalla SS3 a (954, 1441) | strade appoggiate al pendio (non in trincea); SP10 25 tornanti fino a 1152 m, SS4 20 tornanti a terrazze su una parete ripidissima fino a 1001 m; tornanti percorribili da un'auto normale (SS4: i più stretti richiedono una manovra lenta) |
| 4.3 | C — SP11 Strada della Forra | (-1240, -2475) | strada nella gola, ponte sul Torrente Forra |
| 4.4 | D — SP13 Strada di Cresta del Cratere | fine della SP12 (-2905, 650) | salita stretta e ripida (fino al 25 %) sul fianco del cratere, poi la cresta nord-est tra 1400 e 1490 m con due viadotti sulle selle (circa (-2741, 1535) e (-3179, 1433)); arrivo a (-3328, 1269) |
| 4.5 | E — E1 Strada Distrutta | (-1938, -2725) | buche, cedimenti, frane e detriti percorribili lentamente; ruote che entrano nelle buche |
| 4.6 | F — F1 Salita Impossibile | (-2158, 10) a 738 m, arrivo (-2293, 392) a 903 m | 408 m al 41 % medio (74 % su 20 m): un'auto normale non deve riuscire a salire; provare con fuoristrada |
| 4.7 | G — E2 Sentiero dei Calanchi | dalla E1 a (-2700, -2450) | fango, terra, gradini; solo fuoristrada |
| 4.8 | H — Passaggio tra le rocce sulla E2 | (-3305, -3249) | tre strettoie da 2,92–3,07 m tra massi con collisione, poi 14 massi da 0,4–0,8 m da scavalcare; nessun masso sospeso |
| 4.9 | I — SP14 Spirale di Monte Spirale | dalla SS1 a (1478, 244) | 12 tornanti sul fianco del monte, poi in vetta un ricciolo che passa sopra se stesso su un ponte (circa (1885, 620)); fine a (1895, 563) |
| 4.10 | J — SS3 tratto allagato | (-420, 1390) – (-330, 1405) | strada sotto 35 cm d'acqua del Lago Grande |
| 4.11 | SP7 Salita della Diga | fine dell'A1 (3130, -700) | ponte sul Rio Est (circa (3181, -608)), tre tornanti sul versante est, tratto a mezzacosta e arrivo alla spalla est della diga sulla SP6 (3132, 193) |
| 4.12b | Piazzole panoramiche: SP12 (-2083, -142) e (-1854, -1416), SP13 (-2587, 1411), SP10 (-1484, 2217), SP5 (3102, 1072) e (3424, 2041), SS4 (998, 1669), SS3 (19, 1401), SS1 (-655, 672) | cartello marrone "PUNTO PANORAMICO" 150 m prima dello slargo in entrambi i sensi; slargo di 7 m con due panchine; guardrail sul lato del dirupo |
| 4.12 | Pista Prove Buche PT | (-1905, -2769) | buche di dimensioni diverse con profondità reale; nessun sobbalzo anomalo ai bordi |
| 4.13 | Raccordi tra strade (tutte le giunzioni percorse sopra) | — | nessun gradino verticale, nessuna caduta attraverso la superficie |

## 5. Acqua

| # | Prova | Atteso |
|---|---|---|
| 5.1 | Lago Grande, Lago Alto, Bacino di Montalba | superficie dell'acqua continua fino alle sponde, nessun fondale scoperto sotto il livello, nessuna acqua fuori dal lago |
| 5.2 | Diga (da (2880, 175) a (3090, 145)) | coronamento percorribile dalla SP6, paramento con collisione |
| 5.3 | Fiumi (Fiume Alba, Torrente Forra, Rio Est) | acqua nell'alveo; annotare se la corrente è visibile o agisce sui veicoli |
| 5.4 | Entrare in acqua con un veicolo | galleggiamento/annegamento del motore secondo la simulazione del gioco |

## 6. Edifici, vegetazione, arredo

| # | Prova | Atteso |
|---|---|---|
| 6.1 | Montalba (circa (2050, -2350)), Pratolungo (circa (-700, -2500)), Forra (circa (-1250, -2150)), zona industriale (circa (3560, -2020), in fondo alla SP9) | edifici appoggiati al terreno, non sospesi; urtarli: collisione presente |
| 6.2 | Foreste in montagna e in valle | conifere in quota, latifoglie in basso, limite del bosco, nessun albero sulla carreggiata; urto con un tronco: collisione |
| 6.3 | Erba (GroundCover) sui prati | erba visibile vicino alla telecamera, senza riquadri neri o bianchi |
| 6.4 | Lampioni, cartelli, muri di contenimento, delineatori, guardrail | posizionati a bordo strada, con collisione |
| 6.5 | Passaggio dei LOD avvicinandosi ad alberi ed edifici | nessuna sparizione improvvisa a breve distanza |

## 7. IA e prestazioni

| # | Prova | Atteso |
|---|---|---|
| 7.1 | Aggiungere veicoli dell'IA (traffico) sull'A1 e nei paesi | l'IA segue le strade e gli svincoli |
| 7.2 | FPS in tre punti: centro di Montalba, foresta fitta, vista da The Giant | annotare; se troppo bassi, ridurre la densità in `ew/vegetation.py` e rigenerare |
