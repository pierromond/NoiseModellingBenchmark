# Contrats de compatibilité

Tout ce qui suit est l'interface observable du benchmark. Aucun refactoring ne
doit la modifier : les garde-fous de `tools/` le vérifient.

## Points d'entrée

- `bash benchmark/drivers/benchmark_run_clisson.sh [--version <v> | --aggregate-only]`
- `bash benchmark/drivers/benchmark_run_montagne.sh [--version <v> | --aggregate-only]`
- `.github/workflows/benchmark-pr.yml` (manuel) : `pr`, `dataset`, `publish`, `comment`.
- Variables d'environnement CI : `GITHUB_REPOSITORY`, `GITHUB_REF_NAME`,
  `GITHUB_SHA`, `GITHUB_RUN_ID`.
- Java : `v6*` → Java 25, sinon Java 11 ; pour une PR, la version est lue dans `pom.xml`.

## Entrées

- `benchmark/versions.json` : `version -> URL` ; une seule entrée avec URL vide = version
  « head » (binaire fourni par un artefact CI).
- `benchmark/config/benchmark.json` : source unique des paramètres, datasets et constantes.
- `benchmark/input/clisson/`, `benchmark/input/montagne/` : datasets (ne pas modifier).

## Arborescence produite

```
benchmark/output/<v>/{stats_<v>.json, RECEIVERS_LEVEL.geojson, ISO_CONTOUR.geojson, profile.csv, simulation.log}
benchmark/output/montagne/<v>/{stats_<v>_<campagne>_<scenario>.json, RECEIVERS_LEVEL_<campagne>_<scenario>.geojson, rays_<campagne>_<scenario>.geojson, ...}
website/data/{results.json, comparisons.json, settings.json, build.json, start.json, <v>/...}
website/data/montagne/{results.json, comparisons.json, measure_comparison.json, layers/..., measure/..., <v>/...}
website/data/pr/{index.json, <pr>/manifest.json, <pr>/{clisson,montagne}/...}
website/index.html
```

Le namespace `website/data/pr/` est **hors résultats officiels** : il est produit
uniquement par `benchmark/scripts/bench_pr.sh` / `.github/workflows/benchmark-pr.yml`
et ne doit jamais alimenter `results.json`, `comparisons.json`, `build.json` ou
`start.json`. Un résultat de PR porte un label unique
(`v<version>-pr<numéro>-<sha7>`), jamais une clé de `benchmark/versions.json`.

La Montagne lance deux scénarios météo par campagne (`homogene` = occurrences
favorables nulles (0 partout) ; `favorable` = 1 partout). La température et
l'humidité restent celles mesurées pour la campagne. Les noms « legacy »
sans suffixe de scénario (`stats_<v>.json`, `RECEIVERS_LEVEL.geojson`,
`RECEIVERS_LEVEL_<campagne>.geojson`, `rays_<campagne>.geojson`) sont des alias du
scénario **homogène** (celui affiché sur la carte).

## Schémas des artefacts

| Fichier | Schéma |
|---|---|
| `benchmark/output/**/stats_*.json` | `schemas/stats.schema.json` |
| `website/data{/montagne}/results.json` | `schemas/results.schema.json` |
| `website/data{/montagne}/comparisons.json` | `schemas/comparisons.schema.json` |
| `website/data/montagne/measure_comparison.json` | `schemas/measure_comparison.schema.json` |
| `website/data/settings.json` | `schemas/settings.schema.json` |
| `website/data/build.json` | `schemas/build.schema.json` |
| `website/data/start.json` | `schemas/start.schema.json` |
| `website/data/pr/index.json` | `schemas/pr_index.schema.json` |
| `website/data/pr/<pr>/manifest.json` | `schemas/pr_manifest.schema.json` |
| `website/data/pr/<pr>/*/comparisons.json` | `schemas/comparisons.schema.json` |
| `website/data/pr/<pr>/montagne/measure_comparison.json` | `schemas/measure_comparison.schema.json` |
| `website/data/pr/<pr>/<dataset>/baseline_results.json` | `schemas/results.schema.json` |

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
- Branche de publication des PR : `pr-data` (index à la racine, données dans `<numéro>/`).
  Elle est lue par l'onglet « Pull requests » et n'est jamais incluse dans les résultats officiels.

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
