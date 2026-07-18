# Freeride terrain batch

Install the batch-only dependencies with `python -m pip install -r freeride/requirements.txt`.

Run the complete refresh with:

```text
python -m freeride.batch
```

The job downloads and caches OpenSkiMap ski areas and runs, matches all resorts by
coordinates, scores mapped runs, uses a local DEM raster when available for matched
resorts without qualifying runs, and atomically writes `freeride_terrain.json`.

Use `--areas`, `--runs`, and `--output` for reproducible local fixtures or `--dry-run`
to inspect metadata without replacing the existing output.
