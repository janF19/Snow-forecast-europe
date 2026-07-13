import unittest
from validation.metrics import mae, bias, contingency, elevation_band, lead_bucket


class TestMetrics(unittest.TestCase):
    def test_mae_and_bias(self):
        pairs = [(10, 8), (5, 6), (0, 0)]  # errors +2,-1,0
        self.assertAlmostEqual(mae(pairs), 1.0)
        self.assertAlmostEqual(bias(pairs), (2 - 1 + 0) / 3)

    def test_rain_contingency_precision_recall(self):
        # threshold 1.0mm; forecast>=1 & obs>=1 = TP
        pairs = [(2.0, 3.0), (2.0, 0.0), (0.0, 3.0), (0.0, 0.0)]
        c = contingency(pairs, 1.0)
        self.assertEqual((c["tp"], c["fp"], c["fn"], c["tn"]), (1, 1, 1, 1))
        self.assertAlmostEqual(c["precision"], 0.5)
        self.assertAlmostEqual(c["recall"], 0.5)

    def test_elevation_band_and_lead_bucket(self):
        self.assertEqual(elevation_band(1000), "0-1500")
        self.assertEqual(elevation_band(2000), "1500-2200")
        self.assertEqual(elevation_band(2500), "2200-9000")
        self.assertEqual(lead_bucket(30), 48)   # rounds up to next bucket
        self.assertEqual(lead_bucket(24), 24)
        self.assertEqual(lead_bucket(200), 168)  # clamps to last bucket
