# Formati BeamNG.drive usati da Extreme World

Questo documento elenca **solo** i formati che il generatore scrive e da dove è stata
ricavata ogni informazione. Il gioco non è installato nell'ambiente di sviluppo e la
documentazione ufficiale (`documentation.beamng.com`) era bloccata dalla rete, quindi le
fonti sono:

| Sigla | Fonte | Uso |
|-------|-------|-----|
| **U2** | Livello reale "Utah2" salvato dal World Editor di BeamNG (repo pubblico `MattB70/BeamNG-Utah2`) | Riferimento primario: file analizzati byte per byte |
| **PY** | `BeamNG/beamngpy`, libreria Python ufficiale di BeamNG (MIT), `templates/prefab.json` | Campi di `DecalRoad` e `MeshRoad` |
| **LI** | `PrzemekWolw/BeamNGLevelImporter`, importatore Blender di livelli BeamNG (MIT) | Lettura di `.ter`, `WaterBlock`, `MeshRoad`, foreste |
| **DOC** | Estratti della documentazione ufficiale ottenuti tramite motore di ricerca | Conferme su info.json, groundmodel, gerarchia DAE |
| **T3D** | Sorgente di Torque3D (`TorqueGameEngines/Torque3D`, MIT), il motore da cui deriva BeamNG | Geometria di `WaterBlock` e `MeshRoad` |

Nessun contenuto proprietario (texture, mesh, dati) è stato copiato: sono stati letti solo
la struttura e i nomi dei campi.

## Struttura della cartella del livello (U2)

```
levels/extreme_world/
  info.json                         metadati, spawn point (DOC)
  main/items.level.json             SimGroup radice "MissionGroup"
  main/MissionGroup/items.level.json         figli diretti
  main/MissionGroup/<Gruppo>/items.level.json  un file per sotto-gruppo
  theTerrain.ter                    terreno binario
  theTerrain.terrain.json           descrizione del terreno
  art/terrains/main.materials.json  TerrainMaterial + TerrainMaterialTextureSet
  forest/<tipo>.forest4.json        istanze della foresta (una riga per albero)
  art/forest/managedItemData.json   definizioni ForestItemData (DOC, LI)
```

`items.level.json` è **JSON delimitato da righe**: ogni riga è un oggetto completo con
`class`, `persistentId` (UUID), `__parent` (nome del gruppo padre) e i campi dell'oggetto.
Le sotto-cartelle replicano la gerarchia dei `SimGroup` (U2, DOC).

## Terreno `.ter` versione 8 (U2, verificato sui byte)

Little-endian, nell'ordine:

| Campo | Tipo | Note |
|-------|------|------|
| version | `u8` | 8 |
| size | `u32` | lato in vertici (potenza di 2) |
| heightMap | `u16 × size²` | riga per riga, indice `x + y·size`, origine nell'angolo (x min, y min) |
| layerMap | `u8 × size²` | indice del materiale; **255 = buco** (usato per i tunnel) |
| layerTextureMap | `4 byte × size²` | materiali dei 4 angoli del quadrato: indici lineari `i, i+1, i+size, i+size+1` (clamp a fine array). Regola ricavata e verificata: ricostruisce il file reale identico |
| numero materiali | `u32` | |
| nomi materiali | `u8 lunghezza + caratteri` | `internalName` dei TerrainMaterial |

Verifica: per Utah2 `5 + 7·2048² + 140 = 29 360 273` byte, identico alla dimensione del file.

Altezza in metri: `position.z + h / 65535 · maxHeight` (U2: `maxHeight` 200, valori 1..65535;
LI usa `/65536`, la differenza è trascurabile). Posizione del vertice:
`position.x + x·squareSize`, `position.y + y·squareSize` (LI).

`theTerrain.terrain.json` (U2): `binaryFormat`, `datafile`, `heightMapItemSize` 2,
`heightMapSize`, `heightmapImage`, `layerMapItemSize` 1, `layerMapSize`, `materials`,
`size`, `version` 8.

Oggetto (U2): `{"class":"TerrainBlock","position":[x,y,z],"baseTexSize":…, "materialTextureSet":"…",
"maxHeight":…, "terrainFile":"/levels/…/theTerrain.ter"}`; `squareSize` facoltativo (default 1, LI).

Limiti pratici (DOC/forum): 8192 è il massimo utilizzabile, ~2 m/vertice il massimo
consigliato. Extreme World usa **4096 × 4096 a 2 m = 8,19 × 8,19 km**.

## Materiali del terreno (U2)

`art/terrains/main.materials.json` è un dizionario `nome → oggetto`.

* `TerrainMaterialTextureSet`: `baseTexSize`, `detailTexSize`, `macroTexSize` (tutte le texture
  di un tipo devono avere quella dimensione: sono array di texture).
* `TerrainMaterial` v1.5: per ognuno dei canali `baseColor`, `normal`, `roughness`, `ao`,
  `height` esistono `<canale>BaseTex`, `<canale>DetailTex`, `<canale>MacroTex`, i relativi
  `…TexSize` (metri coperti da una ripetizione) e `…Strength` (`[vicino, lontano]`), più
  `detailDistances`, `macroDistances`, `detailDistAtten`, `macroDistAtten`, `groundmodelName`.
  In U2 le texture *Base* sono un'unica mappa colore dell'intero terreno condivisa da tutti i
  materiali; il generatore fa lo stesso.

## Groundmodel (fisica delle superfici) (DOC)

Nomi globali disponibili (v0.39.1.0): `ASPHALT`, `ASPHALT_WET`, `ROCK`, `DIRT`, `DIRT_DUSTY`,
`SAND`, `SANDY_ROAD`, `MUD`, `GRAVEL`, `GRASS`, `ICE`, `SNOW`, … Il generatore usa solo nomi di
questa lista, quindi non deve definire un proprio `groundmodels.json`.

## Strade

`DecalRoad` (PY, U2): `nodes` = `[[x,y,z,larghezza],…]`, `material`, `drivability`
(>0 entra nel grafo di navigazione dell'IA), `improvedSpline`, `oneWay`, `flipDirection`,
`overObjects`, `breakAngle`, `renderPriority`, `textureLength`, `startEndFade`, `distanceFade`.
Una DecalRoad è solo grafica: **la superficie fisica è il terreno**, che il generatore modella
lungo ogni strada.

`MeshRoad` (PY, LI): `nodes` = `[[x,y,z,larghezza,profondità,nx,ny,nz],…]`, `topMaterial`,
`bottomMaterial`, `sideMaterial`, `textureLength`, `breakAngle`, `widthSubdivisions`.
Genera geometria con collisione: usata per ponti e viadotti. La quota del nodo è il **piano
superiore**; il fondo è a `z - profondità` (T3D, `meshRoad.cpp`).

## Acqua

`WaterBlock` (U2, T3D): volume d'acqua con galleggiamento. Dal sorgente di Torque3D
(`Engine/source/environment/waterBlock.cpp`, motore da cui deriva BeamNG): box oggetto
`[-0.5, 0.5]³` scalato da `scale`, quindi **centrato su `position` con dimensione totale
`scale`**; la superficie è a `position.z` (`getSurfaceHeight`, confermato da DOC) e il volume
d'acqua scende di `scale.z / 2`. Supporta `rotationMatrix`.
Texture d'acqua di sistema usate anche da U2: `core/art/water/foam.dds`,
`core/art/water/ripple.dds`, `core/art/water/depthcolor_ramp.png`.

`River` (U2): `nodes` = `[[x,y,z,larghezza,profondità,nx,ny,nz],…]`, `flowMagnitudePhysics`.

## Convenzione di `rotationMatrix` (U2, verificata)

I 9 valori sono le immagini nel mondo degli assi locali, in sequenza:
`[Xx, Xy, Xz, Yx, Yy, Yz, Zx, Zy, Zz]`. Prova: tutte le 52 `CameraBookmark` di U2 hanno rollio
nullo (asse X locale orizzontale, `m[2] = 0`) solo con questa lettura; con la lettura
trasposta nessuna. Per una rotazione di angolo `a` (antiorario attorno a Z):
`[cos a, sin a, 0, -sin a, cos a, 0, 0, 0, 1]`. Lo spawn sull'autostrada di U2 è allineato
alla carreggiata con questa convenzione (scarto di 5°).

## Altri oggetti (U2)

`LevelInfo`, `ScatterSky`, `TimeOfDay`, `CloudLayer`, `SpawnSphere`
(`dataBlock: "SpawnSphereMarker"`), `TSStatic` (`shapeName`, `position`, `rotationMatrix`
3×3 per righe, `scale`), `Forest`, `ForestWindEmitter`, `GroundCover`, `CameraBookmark`.

## info.json (DOC)

`title`, `description`, `previews`, `size`, `authors`, `biome`, `roads`, `suitablefor`,
`features`, `defaultSpawnPointName`, `spawnPoints: [{translationId, objectname, preview}]`.
`objectname` deve corrispondere al nome di uno `SpawnSphere`.

## Mesh Collada (.dae) (DOC)

Gerarchia: `base00 → start01 → <mesh>_a<px>` (LOD: il numero finale è la dimensione in pixel
alla quale avviene il cambio, preceduto da una lettera), `nulldetail<px>` per la distanza di
sparizione, `Colmesh-1` per la mesh di collisione, `bb_autobillboard<px>` per gli impostori
automatici. Il nome del materiale nel DAE corrisponde a `mapTo` di un `Material` in un
`*.materials.json` del livello (`Stages[0].baseColorMap`, `normalMap`, `roughnessMap`, …,
`version` 1.5). `TSStatic.collisionType`: `Collision Mesh`, `Visible Mesh`,
`Visible Mesh Final`, `Bounds`, `None`.

## Forest (U2)

`forest/<tipo>.forest4.json`: una riga per istanza
`{"pos":[x,y,z],"rotationMatrix":[9 valori],"scale":s,"type":"<ForestItemData>"}`;
nella scena un singolo oggetto `{"class":"Forest","name":"theForest"}`.
