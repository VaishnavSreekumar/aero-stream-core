#!/usr/bin/env python3
"""
Unit test suite for Airbus Flight Acceptance AI Compliance Engine.
"""

import unittest
from compliance_engine import AirbusFlightAcceptanceEngine


class TestAirbusComplianceEngine(unittest.TestCase):
    def setUp(self):
        self.engine = AirbusFlightAcceptanceEngine()

    def test_optimal_cruise_flight(self):
        telemetry = {
            "icao": "39AC47",
            "altitude": 35000,
            "speed": 460,
            "verticalRate": 0,
            "latitude": 43.62,
            "longitude": 1.36
        }
        res = self.engine.evaluate_telemetry(telemetry)
        self.assertEqual(res["status"], "OPTIMAL")
        self.assertGreaterEqual(res["acceptance_score"], 90.0)
        self.assertEqual(res["flight_phase"], "CRUISE_RVSM_TEST")
        self.assertEqual(len(res["anomalies"]), 0)

    def test_airspeed_warning_low_altitude(self):
        # 290 kts below 10,000 ft (near Vmo boundary)
        telemetry = {
            "icao": "39AC47",
            "altitude": 5000,
            "speed": 290,
            "verticalRate": 1500,
            "latitude": 43.7,
            "longitude": 1.4
        }
        res = self.engine.evaluate_telemetry(telemetry)
        self.assertIn(res["status"], ["AIRSPEED_WARNING", "RECHECK_REQUIRED"])
        self.assertLess(res["acceptance_score"], 95.0)
        self.assertTrue(any("Vmo" in a or "speed" in a.lower() for a in res["anomalies"]))

    def test_recheck_required_on_critical_violation(self):
        # Severe low altitude overspeed and excessive climb rate
        telemetry = {
            "icao": "39AC47",
            "altitude": 4000,
            "speed": 340,
            "verticalRate": 6000,
            "latitude": 43.8,
            "longitude": 1.5
        }
        res = self.engine.evaluate_telemetry(telemetry)
        self.assertEqual(res["status"], "RECHECK_REQUIRED")
        self.assertLess(res["acceptance_score"], 70.0)

    def test_altitude_ceiling_breach(self):
        telemetry = {
            "icao": "39AC47",
            "altitude": 43000,
            "speed": 450,
            "verticalRate": 0
        }
        res = self.engine.evaluate_telemetry(telemetry)
        self.assertEqual(res["status"], "RECHECK_REQUIRED")
        self.assertTrue(any("ceiling" in a.lower() for a in res["anomalies"]))


if __name__ == "__main__":
    unittest.main()
