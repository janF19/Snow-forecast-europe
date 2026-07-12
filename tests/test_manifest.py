import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from freeride.match import write_manifest


class WriteManifestTests(unittest.TestCase):
    def test_manifest_records_filename_size_hash_and_timestamp(self):
        with tempfile.TemporaryDirectory() as tmp:
            osm_dir = Path(tmp)
            content = b'{"type": "FeatureCollection", "features": []}'
            fake_file = osm_dir / "ski_areas.geojson"
            fake_file.write_bytes(content)

            manifest = write_manifest(osm_dir)

            self.assertIn("retrieved_at", manifest)
            self.assertTrue(manifest["retrieved_at"])
            self.assertEqual(len(manifest["files"]), 1)
            entry = manifest["files"][0]
            self.assertEqual(entry["filename"], "ski_areas.geojson")
            self.assertEqual(entry["size_bytes"], len(content))
            self.assertEqual(entry["sha256"], hashlib.sha256(content).hexdigest())

            manifest_path = osm_dir / "manifest.json"
            self.assertTrue(manifest_path.exists())
            with manifest_path.open(encoding="utf-8") as handle:
                on_disk = json.load(handle)
            self.assertEqual(on_disk, manifest)

    def test_manifest_excludes_non_geojson_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            osm_dir = Path(tmp)
            (osm_dir / "notes.txt").write_text("ignore me", encoding="utf-8")

            manifest = write_manifest(osm_dir)

            self.assertEqual(manifest["files"], [])


if __name__ == "__main__":
    unittest.main()
