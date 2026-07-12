import json
import tempfile
import unittest
from pathlib import Path

from freeride.batch import index_runs_for_area_ids, run_batch
from freeride.validation import validate_payload

SQUARE = {"type": "Polygon", "coordinates": [[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]]}
ELSEWHERE = {"type": "Polygon", "coordinates": [[[10, 10], [10, 12], [12, 12], [12, 10], [10, 10]]]}


def _area(area_id, name, geometry):
    return {"type": "Feature", "properties": {"id": area_id, "name": name}, "geometry": geometry}


def _run(area_id, difficulty, grooming, heights, resolution):
    return {
        "type": "Feature",
        "properties": {"skiAreas": [area_id], "difficulty": difficulty, "grooming": grooming},
        "geometry": {"type": "LineString", "coordinates": [[1, 1], [1, 1.001]]},
        "elevationProfile": {"heights": heights, "resolution": resolution},
    }


class RunBatchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def _write(self, name, payload):
        path = self.tmp_path / name
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def _run_batch(self, resorts, areas, runs, **kwargs):
        resorts_path = self._write("resorts.json", resorts)
        areas_path = self._write("areas.json", {"features": areas})
        runs_path = self._write("runs.json", {"features": runs})
        return run_batch(areas_path=areas_path, runs_path=runs_path, resorts_path=resorts_path,
                          output_path=self.tmp_path / "out.json", dry_run=True, **kwargs)

    def test_run_index_keeps_only_runs_linked_to_matched_areas(self):
        matching_run = _run("area-1", "freeride", "classic", [2000, 1700], 25)
        unrelated_run = _run("area-2", "freeride", "classic", [2000, 1700], 25)

        runs_by_area = index_runs_for_area_ids(
            iter([matching_run, unrelated_run]), {"area-1"}
        )

        self.assertEqual(runs_by_area, {"area-1": [matching_run]})

    def test_contains_match_with_mapped_runs_is_measured(self):
        resorts = [{"resort": "Measured Resort", "longitude": 1.0, "latitude": 1.0}]
        areas = [_area("area-1", "Area One", SQUARE)]
        runs = [_run("area-1", "freeride", "classic", [2000, 1700], 25)]
        payload = self._run_batch(resorts, areas, runs)
        entry = payload["Measured Resort"]
        self.assertEqual(entry["source"], "measured")
        self.assertGreater(entry["score"], 0)
        self.assertEqual(entry["freeride_run_count"], 1)
        self.assertNotIn("dem", entry)
        validate_payload(payload)

    def test_matched_area_with_no_qualifying_runs_is_unavailable(self):
        resorts = [{"resort": "Empty Resort", "longitude": 1.0, "latitude": 1.0}]
        areas = [_area("area-1", "Area One", SQUARE)]
        runs = [_run("area-1", "easy", "classic", [2000, 1990], 25)]
        payload = self._run_batch(resorts, areas, runs)
        entry = payload["Empty Resort"]
        self.assertEqual(entry, {
            "score": None, "source": "unavailable", "reason": "no_mapped_routes",
            "ski_area_name": "Area One", "match_method": "contains",
        })
        validate_payload(payload)

    def test_unmatched_resort_is_unavailable_no_match(self):
        resorts = [{"resort": "Far Resort", "longitude": 50.0, "latitude": 50.0}]
        areas = [_area("area-1", "Area One", SQUARE)]
        payload = self._run_batch(resorts, areas, [])
        self.assertEqual(payload["Far Resort"], {
            "score": None, "source": "unavailable", "reason": "no_match",
            "ski_area_name": None, "match_method": None,
        })
        validate_payload(payload)

    def test_ambiguous_resort_is_unavailable_even_with_contains_match_and_runs(self):
        resorts = [{"resort": "Dachstein West", "longitude": 1.0, "latitude": 1.0}]
        areas = [_area("area-1", "Area One", SQUARE)]
        runs = [_run("area-1", "freeride", "classic", [2000, 1700], 25)]
        payload = self._run_batch(resorts, areas, runs, ambiguous={"Dachstein West": {"reason": "identity conflict"}})
        self.assertEqual(payload["Dachstein West"], {
            "score": None, "source": "unavailable", "reason": "ambiguous",
            "ski_area_name": None, "match_method": None,
        })
        validate_payload(payload)

    def test_areas_path_run_still_loads_committed_ambiguous_list_by_default(self):
        # Regression: passing --areas/--runs (a pinned-manifest style run) must not
        # silently skip freeride/data/ambiguous_resorts.json just because the caller
        # didn't pass ambiguous= explicitly. This is the actual committed denylist,
        # not a synthetic one, and it must be honored by default.
        resorts = [{"resort": "Dachstein West", "longitude": 1.0, "latitude": 1.0}]
        areas = [_area("area-1", "Area One", SQUARE)]
        runs = [_run("area-1", "freeride", "classic", [2000, 1700], 25)]
        payload = self._run_batch(resorts, areas, runs)
        self.assertEqual(payload["Dachstein West"]["source"], "unavailable")
        self.assertEqual(payload["Dachstein West"]["reason"], "ambiguous")

    def test_no_dem_import_anywhere_in_batch_module(self):
        import freeride.batch as batch_module
        source = Path(batch_module.__file__).read_text(encoding="utf-8")
        self.assertNotIn("score_dem", source)
        self.assertNotIn("import rasterio", source)
        self.assertNotIn('"dem"', source)


if __name__ == "__main__":
    unittest.main()
