import tempfile
import unittest
from pathlib import Path

from collect_costs import list_price_cost


class CostModelTests(unittest.TestCase):
    def test_applies_luna_list_rates_to_each_canonical_bucket(self):
        self.assertEqual(list_price_cost(1_000_000, 0, 0, 0), 1.0)
        self.assertEqual(list_price_cost(0, 1_000_000, 0, 0), 6.0)
        self.assertEqual(list_price_cost(0, 0, 1_000_000, 0), 0.1)
        self.assertEqual(list_price_cost(0, 0, 0, 1_000_000), 1.25)

    def test_does_not_double_charge_reasoning_tokens(self):
        # Reasoning is already a subset of canonical output tokens in Hermes.
        self.assertEqual(list_price_cost(100, 200, 300, 400), 0.00183)


if __name__ == '__main__':
    unittest.main()
