from pathlib import Path

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
OSM_DIR = DATA / "openskimap"
DEM_DIR = DATA / "dem"
SKI_AREAS_URL = "https://tiles.openskimap.org/geojson/ski_areas.geojson"
RUNS_URL = "https://tiles.openskimap.org/geojson/runs.geojson"
RESORTS_JSON = BASE.parent / "resorts_for_forecast.json"
TERRAIN_JSON = BASE.parent / "freeride_terrain.json"
OVERRIDES_JSON = DATA / "resort_overrides.json"
