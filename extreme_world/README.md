# Extreme World — mappa per BeamNG.drive

Mondo aperto generato proceduralmente da codice Python: rilievi estremi (The Giant, The Crater,
The Wall e molte cime secondarie), autostrada a carreggiate separate con svincoli, viadotti e
galleria a doppia canna, tangenziale, strade statali e di montagna con tornanti, percorsi speciali,
laghi, fiumi, diga, canyon, foreste e paesi.

Tutto il contenuto del livello (terreno, texture, mesh, materiali, scena) è prodotto dal
generatore in `generator/`: nessun asset di terze parti viene copiato.

> Stato del progetto, funzioni completate e non implementate, prove eseguite: vedi
> [`docs/STATO.md`](docs/STATO.md). Prove da fare in gioco: [`docs/TEST_MANUALE.md`](docs/TEST_MANUALE.md).

## Installazione della mod

1. Generare il livello (sezione successiva) oppure usare un archivio `extreme_world.zip` già prodotto.
2. Copiare `extreme_world.zip` **così com'è** (senza estrarlo) nella sottocartella `mods` della
   cartella utente di BeamNG.drive (la cartella utente si apre dal launcher del gioco).
3. Avviare il gioco, scegliere *Freeroam* e la mappa **Extreme World**. Il punto di partenza
   predefinito è sulla sponda sud del Lago Grande; altri spawn: autostrada, Montalba, Passo del Gigante.

L'archivio contiene la cartella `levels/extreme_world/` con la struttura di un livello BeamNG
(`info.json`, `main/**/items.level.json`, `theTerrain.ter`, `theTerrain.terrain.json`,
`art/...`, `forest/...`).

## Generazione dal sorgente

Requisiti: Python 3.10+ con `numpy`, `scipy`, `pillow`, `numba`, `scikit-image`; per la
verifica delle mesh `pycollada` (facoltativo).

```bash
cd extreme_world/generator
python3 build.py                  # livello in ../build/levels/extreme_world + ../build/extreme_world.zip
python3 build.py --no-zip         # senza archivio
python3 validate.py ../build      # verifica statica del livello generato (0 errori attesi)
```

La prima build calcola il rilievo (erosione idraulica e termica) e lo memorizza in
`build/cache/`; le build successive riusano la cache finché non cambiano i parametri del terreno.
Il resoconto `build/report.json` riporta strade, strutture, acqua, vegetazione e moduli.

Strumenti di sviluppo:

- `python3 build.py --dump-ctx <file.pkl>` salva terreno, strade e maschere per provare un singolo
  modulo con `ew/devctx.py` senza rifare la build;
- `tools/preview3d/`: anteprima 3D (three.js in Chromium headless) di una porzione del livello
  generato, per controllare visivamente strutture, strade e vegetazione
  (`npm install` nella cartella, poi `export_scene.py` e `render.mjs`).

## Struttura

```
extreme_world/
  config/            parametri del mondo (rilievi, laghi, regioni, strade, tipi di strada, spawn)
  generator/
    build.py         pipeline completa del livello
    validate.py      validatore statico
    ew/              libreria del generatore (terreno, acqua, strade, strutture, vegetazione, ...)
  docs/              formati BeamNG verificati, architettura, stato, prove manuali
  tests/             test automatici (mesh)
  tools/preview3d/   anteprima 3D
```

Dettagli tecnici: [`docs/ARCHITETTURA.md`](docs/ARCHITETTURA.md) e
[`docs/FORMATI_BEAMNG.md`](docs/FORMATI_BEAMNG.md) (ogni formato con la sua fonte).
