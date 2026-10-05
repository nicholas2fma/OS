# Architettura del generatore

Il livello è prodotto interamente da `generator/build.py` a partire dai file di `config/`.
Ogni fase scrive dati reali del livello BeamNG; i formati usati e le loro fonti sono in
[`FORMATI_BEAMNG.md`](FORMATI_BEAMNG.md).

## Dati di ingresso (`config/`)

| File | Contenuto |
|---|---|
| `world.json` | nome del livello, seme, griglia del terreno (4096 × 4096 vertici, passo 2 m, quota massima 1800 m), parametri di erosione |
| `landforms.json` | punti di controllo del rilievo, cime (The Giant, The Crater, The Wall, ...), creste, valli, spianate dei centri abitati, altipiani, canyon, laghi, invaso con diga, fiumi, regioni A–F, calanchi |
| `road_types.json` | parametri per classe di strada: larghezze, pendenza massima, raggio minimo, sopraelevazione, scarpate, soglie per ponti e gallerie, decal, layer del terreno, guidabilità per l'IA |
| `roads.json` | una strada per riga: punti, agganci ad altre strade, direttive (tornanti, curve di livello, sponde dei laghi, fiumi, canyon, ricciolo, cresta del cratere, svincoli a rombo, rotatorie, tratti allagati) |
| `spawns.json` | punti di partenza sulle strade |

## Pipeline (`build.py`)

1. **Terreno naturale** (`ew/terrain.py`, `ew/erosion.py`, `ew/noise.py`, `ew/water.py`):
   campo di base per interpolazione RBF dei punti di controllo, rumore fBm/ridged con domain
   warping, cime e creste, valli, erosione idraulica a gocce ed erosione termica (numba), pareti
   a gradoni, rifinitura a piena risoluzione; spianate, canyon, laghi (fondale e cordone di
   sponda chiuso), invaso, alvei dei fiumi. Il risultato è in cache (`build/cache/`).
2. **Strade** (`ew/roads/network.py`, `router.py`): tracciati da punti; A* sul terreno con costo
   di pendenza, ricalcolato rendendo più costose le zone in cui la strada ripasserebbe troppo
   vicino a sé stessa; tornanti posati sul pendio (ogni tratto dove il terreno ha la quota che la
   strada deve avere, raggio minimo, distanza dai tratti sottostanti che cresce con il dislivello
   e dalle altre strade); curve di livello, sponde, cresta del cratere, ricciolo; arrotondamento
   degli spigoli alle giunzioni fra tratti; profilo altimetrico a minimi quadrati con vincoli
   (ancoraggi agli incroci e alla quota della strada principale finché le piattaforme si
   sovrappongono, franchi dei cavalcavia, quote minime sopra laghi e fiumi) e limite di pendenza;
   sopraelevazione; ponti e gallerie dove riporto o copertura superano le soglie; svincoli a rombo
   con corsie di decelerazione/accelerazione che seguono il tracciato; rotatorie.
   **Piazzole** (`ew/slarghi.py`): di emergenza sull'A1 e panoramiche, scelte sul terreno naturale
   e registrate come allargamenti della piattaforma (`Road.bay_ext`).
   Il terreno viene modellato lungo ogni strada (piattaforma con le piazzole, banchine, scarpate
   in scavo e riporto che non toccano mai la piattaforma di un'altra strada, raccordo alle
   giunzioni) e il cordone dei laghi viene ripristinato.
3. **Acqua finale**: maschere dei laghi sul terreno definitivo, distanza dai fiumi.
4. **Densità della vegetazione** (`ew/vegetation.py`): regioni sfumate, quota (limite del bosco),
   pendenza, radure, distanze da strade, acqua, centri abitati, strutture.
5. **Materiali del terreno e layer map** (`ew/materials.py`, `ew/textures.py`): 16 materiali PBR
   procedurali (erba, erba secca, sottobosco, terra, polvere, fango, ghiaia, ghiaione, ciottoli,
   roccia, roccia scura, sabbia, neve, asfalto, asfalto vecchio, cemento) con groundmodel
   verificati; assegnazione per quota, pendenza, rumore, acqua, strade e scarpate.
6. **Scena**: cielo e ambiente, `TerrainBlock`, materiali di strade e oggetti, DecalRoad visibili
   e del grafo dell'IA (`ew/roads/decals.py`), impalcati `MeshRoad`; strutture (`ew/structures.py`):
   ponti con pile e spalle, guardrail e spartitraffico, diga, gallerie a doppia canna con
   testate, gusci e terreno di riporto, fori nel terreno solo dove servono.
7. **Moduli** (`build.py`, lista `MODULES`), ciascuno con `run(ctx)`:
   `ew/edifici.py` (centri abitati, zona industriale, cascine), `ew/servizio.py` (area di
   servizio dell'A1, in un riferimento che segue la corsia), `ew/rocce.py` (percorsi speciali F e
   H), `ew/danni.py` (buche e danni con geometria reale), `ew/arredo.py` (cartelli, cartelli e
   panchine delle piazzole, lampioni, muri di sostegno, delineatori),
   `ew/erba.py` (GroundCover). Restituiscono materiali, statistiche e zone senza vegetazione.
8. **Acqua** (`ew/level/environment.py`): `WaterBlock` a rettangoli (anche ruotati) che coprono
   i laghi senza uscire dalle sponde, oggetti `River` lungo gli alvei.
9. **File del terreno**: `theTerrain.ter` (v8) e `theTerrain.terrain.json`, materiali del terreno.
10. **Vegetazione**: mesh e materiali degli alberi, `art/forest/managedItemData.json`,
    posa sul terreno definitivo, `forest/<tipo>.forest4.json`.
11. **Spawn, scena, anteprime, `info.json`, resoconto `report.json`, archivio zip.**

## Mesh

`ew/mesh/collada.py` costruisce le mesh (riquadri, parallelepipedi, estrusioni di profili,
prismi) e scrive Collada 1.4.1 con la gerarchia BeamNG (`base00` → `start01` →
`<nome>_a<px>`, `Colmesh-1`, `nulldetail<px>`, `bb_autobillboard<px>`). L'ordine dei vertici è
coerente con le normali (le facce sono visibili dal lato giusto: verificato dai test in
`tests/test_mesh.py` e nell'anteprima 3D). Le regole dei LOD seguono il codice di Torque3D
(un dettaglio di dimensione N si usa finché l'oggetto supera N pixel).

## Verifica

- `generator/validate.py`: formati, materiali e texture, groundmodel, mesh (pycollada,
  gerarchia), scena (genitori, persistentId), spawn, pendenze delle strade sul terreno
  quantizzato, superficie di ogni strada sul terreno fuori da ponti, gallerie e incroci (rivela
  strade sepolte o sospese), sponde dei laghi e copertura dei WaterBlock, foresta, GroundCover.
- `tests/test_mesh.py`: orientamento e volume delle mesh di base; `tests/test_roads.py`:
  tornanti su un pendio sintetico, profilo degli allargamenti delle piazzole.
- `tools/dev/run_module.py`: prova di un modulo sul contesto salvato con `--dump-ctx`.
- `tools/preview3d/`: rendering three.js dei file del livello (terreno, strade, strutture con
  texture, vegetazione istanziata) per il controllo visivo.
