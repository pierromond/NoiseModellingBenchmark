# Contrats de compatibilité

Tout ce qui suit est l'interface observable du benchmark. Aucun refactoring ne
doit la modifier : les garde-fous de `tools/` le vérifient.

## Points d'entrée

- `bash benchmark_run_clisson.sh [--version <v> | --aggregate-only]`
- `bash benchmark_run_montagne.sh [--version <v> | --aggregate-only]`
- Variables d'environnement CI : `GITHUB_REPOSITORY`, `GITHUB_REF_NAME`,
  `GITHUB_SHA`, `GITHUB_RUN_ID`.
- Java : `v6*` → Java 25, sinon Java 11.

## Entrées

- `versions.json` : `version -> URL` ; une seule entrée avec URL vide = version
  « head » (binaire fourni par un artefact CI).
- `config/benchmark.json` : source unique des paramètres, datasets et constantes.
- `input/clisson/`, `input/montagne/` : datasets (ne pas modifier).

## Arborescence produite

```
output/<v>/{stats_<v>.json, RECEIVERS_LEVEL.geojson, ISO_CONTOUR.geojson, profile.csv, simulation.log}
output/montagne/<v>/{stats_<v>.json, RECEIVERS_LEVEL.geojson, profile.csv, simulation.log}
website/data/{results.json, comparisons.json, settings.json, build.json, start.json, <v>/...}
website/data/montagne/{results.json, comparisons.json, measure_comparison.json, layers/..., measure/..., <v>/...}
website/index.html
```

## Schémas des artefacts

| Fichier | Schéma |
|---|---|
| `output/**/stats_*.json` | `schemas/stats.schema.json` |
| `website/data{/montagne}/results.json` | `schemas/results.schema.json` |
| `website/data{/montagne}/comparisons.json` | `schemas/comparisons.schema.json` |
| `website/data/montagne/measure_comparison.json` | `schemas/measure_comparison.schema.json` |
| `website/data/settings.json` | `schemas/settings.schema.json` |
| `website/data/build.json` | `schemas/build.schema.json` |
| `website/data/start.json` | `schemas/start.schema.json` |

Validation : `python3 tools/validate_outputs.py`.

## Noms figés

- Propriétés GeoJSON : `LAEQ`, `PERIOD`, `IDRECEIVER`.
- Colonne profiler acceptée : `receiver_median_rays` **ou**
  `receiver_median_profiles_count`.
- Paramètres `Noise_level_from_source` : `tableBuilding`, `tableSources`,
  `tableReceivers`, `tableDEM`, `tableGroundAbs`, `confRaysName`,
  `confReflOrder`, `confMaxReflDist`, `confDiffVertical`, `confMaxSrcDist`,
  `confDiffHorizontal`, `confTemperature`, `confExportSourceId`,
  `confSkipLevening`, `confSkipLnight`, `confSkipLden`, `confMaxError`,
  `confFavorableOccurrencesDay` (v4) / `confFavorableOccurrencesDefault` (v5+),
  `confRecordProfile`.
- Clés `localStorage` du site : `nm-benchmark-state-v1`, `nm-theme`.

## Garde-fous (`tools/run_checks.sh`)

| Outil | Ce qu'il verrouille |
|---|---|
| `snapshot.py` / `check.py` | sorties du pipeline Python + site (hash normalisé) |
| `sim_spec.py` | contrat de simulation (script + paramètres par version) vs baseline |
| `check_groovy.py` | parse AST de tous les scripts Groovy |
| `test_noisebench.py` | logique partagée `lib/NoiseBench.groovy` |
| `validate_outputs.py` | conformité des artefacts aux JSON Schemas |

Baselines dans `tools/baseline/`. Mise à jour volontaire :
`python3 tools/snapshot.py --update` / `python3 tools/sim_spec.py --update`.
