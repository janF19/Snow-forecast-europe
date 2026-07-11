"""Optional DEM fallback. The track pipeline remains usable without rasterio."""
from pathlib import Path


def score_dem_file(path):
    try:
        import numpy as np
        import rasterio
        from rasterio.features import geometry_mask
        from shapely.geometry import shape
    except ImportError as exc:
        raise RuntimeError("DEM fallback requires rasterio, numpy, and shapely") from exc
    with rasterio.open(path) as src:
        values = src.read(1).astype("float64")
        if src.nodata is not None:
            values[values == src.nodata] = np.nan
        valid = ~np.isnan(values)
        if not valid.any():
            return {"combined": 0.0, "S": 0.0, "A": 0.0, "V": 0.0, "n_pixels": 0}
        gy, gx = np.gradient(values, abs(src.transform.a))
        slope = np.degrees(np.arctan(np.hypot(gx, gy)))
        sweet = valid & (slope >= 30) & (slope <= 45)
        s = float(sweet.sum()) / int(valid.sum())
        drop = float(np.nanmax(values[valid]) - np.nanmin(values[valid]))
        v = min(drop / 1500.0, 1.0)
        a = 0.65 if sweet.any() else 0.0
        return {"combined": round(100 * (0.5 * s + 0.3 * a + 0.2 * v), 1), "S": s, "A": a, "V": v, "n_pixels": int(valid.sum())}


def find_dem(dem_dir, resort_name, ski_area_name):
    dem_dir = Path(dem_dir)
    candidates = [dem_dir / f"{ski_area_name}_cop30.tif", dem_dir / f"{resort_name}_cop30.tif"]
    return next((path for path in candidates if path.exists()), None)
