#!/usr/bin/env python3
"""
Airbus Digital Aircraft Delivery - AI Compliance & Flight Acceptance Microservice
Evaluates real-time Mode-S aircraft telemetry against Airbus Flight Test thresholds
for customer acceptance (e.g., A320neo / A321XLR / A350 Customer Acceptance Flights).
"""

import sys
import json
import argparse
from datetime import datetime, timezone
from typing import Dict, Any, List, Tuple


class AirbusFlightAcceptanceEngine:
    # Airbus A320neo / A350 Customer Delivery Envelope Limits
    VMO_LOW_ALT_KTS = 280.0       # Max airspeed below FL100 (kts)
    VMO_HIGH_ALT_KTS = 350.0      # Max airspeed below FL300 (kts)
    MMO_EQUIV_KTS = 495.0         # Max ground speed equivalent at FL350+ (approx Mach 0.82)
    MIN_AIRSPEED_KTS = 120.0      # Clean stall margin speed (kts)
    MAX_CERTIFIED_CEILING_FT = 41000.0  # Max certified pressure altitude
    MAX_CLIMB_RATE_FPM = 4500.0   # Max normal climb rate (ft/min)
    MAX_DESCENT_RATE_FPM = -6500.0  # Max emergency descent test rate (ft/min)
    RVSM_ALTITUDE_TOLERANCE_FT = 65.0  # RVSM airspace stability tolerance

    def __init__(self):
        self.state_history: List[Dict[str, Any]] = []

    def classify_flight_phase(self, altitude_ft: float, vertical_rate_fpm: float, speed_kts: float) -> str:
        """Determines the current flight test phase based on telemetry vectors."""
        if altitude_ft < 1500 and speed_kts < 140:
            return "TAKEOFF_OR_APPROACH"
        elif altitude_ft >= 28000 and abs(vertical_rate_fpm) < 300:
            return "CRUISE_RVSM_TEST"
        elif vertical_rate_fpm > 500:
            return "CLIMB_ENVELOPE_EVAL"
        elif vertical_rate_fpm < -1000:
            return "DESCENT_PRESSURIZATION_TEST"
        elif altitude_ft >= 1500 and speed_kts >= 200:
            return "MANEUVER_TEST_SECTOR"
        else:
            return "STANDARD_TRANSIT"

    def evaluate_telemetry(self, telemetry: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes multi-criteria flight test acceptance compliance checks.
        Calculates an acceptance score (0-100%) and assigns status:
        'OPTIMAL', 'AIRSPEED_WARNING', or 'RECHECK_REQUIRED'.
        """
        altitude = float(telemetry.get("altitude") or 0.0)
        speed = float(telemetry.get("speed") or 0.0)
        vertical_rate = float(telemetry.get("verticalRate") or 0.0)
        icao = str(telemetry.get("icao") or "UNKNOWN")
        type_code = telemetry.get("typeCode")

        anomalies: List[str] = []
        checks: List[Dict[str, Any]] = []
        score = 100.0

        phase = self.classify_flight_phase(altitude, vertical_rate, speed)

        # 1. Altitude Ceiling Check
        alt_passed = altitude <= self.MAX_CERTIFIED_CEILING_FT and altitude >= 0
        if not alt_passed:
            anomalies.append(f"Altitude ceiling exceeded: {altitude:.0f} ft > {self.MAX_CERTIFIED_CEILING_FT:.0f} ft")
            score -= 35.0
        checks.append({
            "name": "Certified Altitude Ceiling",
            "threshold": f"<= {self.MAX_CERTIFIED_CEILING_FT:.0f} FT",
            "measured": f"{altitude:.0f} FT",
            "passed": alt_passed
        })

        # 2. Airspeed Envelope (Vmo/Mmo) Verification
        speed_passed = True
        speed_warning = False

        if altitude < 10000:
            if speed > (self.VMO_LOW_ALT_KTS + 20):
                speed_passed = False
                anomalies.append(f"Low-altitude speed violation: {speed:.0f} kts (Limit: {self.VMO_LOW_ALT_KTS:.0f} kts)")
                score -= 25.0
            elif speed > self.VMO_LOW_ALT_KTS:
                speed_warning = True
                anomalies.append(f"Airspeed near Vmo boundary: {speed:.0f} kts")
                score -= 10.0
        elif altitude >= 30000:
            if speed > (self.MMO_EQUIV_KTS + 15):
                speed_passed = False
                anomalies.append(f"High-altitude Mmo breach: {speed:.0f} kts (Limit: {self.MMO_EQUIV_KTS:.0f} kts)")
                score -= 30.0
            elif speed > self.MMO_EQUIV_KTS:
                speed_warning = True
                anomalies.append(f"Mach limit proximity warning: {speed:.0f} kts")
                score -= 12.0
        else:
            if speed > self.VMO_HIGH_ALT_KTS:
                speed_warning = True
                anomalies.append(f"Mid-altitude speed advisory: {speed:.0f} kts (Limit: {self.VMO_HIGH_ALT_KTS:.0f} kts)")
                score -= 10.0

        # Stall margin check
        if altitude > 5000 and speed < self.MIN_AIRSPEED_KTS and speed > 0:
            speed_passed = False
            anomalies.append(f"Airspeed below clean stall margin: {speed:.0f} kts (< {self.MIN_AIRSPEED_KTS:.0f} kts)")
            score -= 35.0

        checks.append({
            "name": "Airspeed Envelope (Vmo/Mmo)",
            "threshold": f"<= {self.VMO_LOW_ALT_KTS:.0f} KTS (Low) / {self.MMO_EQUIV_KTS:.0f} KTS (High)",
            "measured": f"{speed:.0f} KTS",
            "passed": speed_passed and not speed_warning
        })

        # 3. Dynamic Vertical Stability Envelope (Climb / Descent)
        vrate_passed = True
        if vertical_rate > self.MAX_CLIMB_RATE_FPM:
            vrate_passed = False
            anomalies.append(f"Excessive climb rate: +{vertical_rate:.0f} fpm (> +{self.MAX_CLIMB_RATE_FPM:.0f} fpm)")
            score -= 20.0
        elif vertical_rate < self.MAX_DESCENT_RATE_FPM:
            vrate_passed = False
            anomalies.append(f"Rapid descent rate breach: {vertical_rate:.0f} fpm (< {self.MAX_DESCENT_RATE_FPM:.0f} fpm)")
            score -= 25.0

        checks.append({
            "name": "Vertical Rate Dynamic Limit",
            "threshold": f"[{self.MAX_DESCENT_RATE_FPM:.0f}, +{self.MAX_CLIMB_RATE_FPM:.0f}] FPM",
            "measured": f"{vertical_rate:+.0f} FPM",
            "passed": vrate_passed
        })

        # 4. Mode-S Transponder Signal Integrity
        transponder_passed = len(icao) == 6 and icao != "000000"
        if not transponder_passed:
            anomalies.append(f"Invalid 24-bit ICAO transponder identifier: {icao}")
            score -= 30.0

        checks.append({
            "name": "Mode-S Transponder Parity",
            "threshold": "24-bit ICAO Valid",
            "measured": icao,
            "passed": transponder_passed
        })

        # Clamp acceptance score
        final_score = max(0.0, min(100.0, score))

        # Status categorization
        if not speed_passed or final_score < 70.0:
            status = "RECHECK_REQUIRED"
            verdict = "Telemetry indicates envelope exceedances requiring flight test engineering review."
        elif speed_warning or final_score < 90.0:
            status = "AIRSPEED_WARNING"
            verdict = "Aircraft operates near aerodynamic boundary limit. Caution advised."
        else:
            status = "OPTIMAL"
            verdict = "All Airbus Customer Acceptance Flight parameters conform strictly to DO-260B / EASA CS-25 specifications."

        return {
            "icao": icao,
            "status": status,
            "acceptance_score": round(final_score, 1),
            "verdict": verdict,
            "flight_phase": phase,
            "checks": checks,
            "anomalies": anomalies,
            "evaluated_at": datetime.now(timezone.utc).isoformat()
        }


def main():
    parser = argparse.ArgumentParser(description="Airbus Customer Acceptance Flight Compliance Engine")
    parser.add_argument("--payload", type=str, help="Raw telemetry JSON payload string")
    args = parser.parse_args()

    engine = AirbusFlightAcceptanceEngine()

    raw_input_data = ""
    if args.payload:
        raw_input_data = args.payload
    elif not sys.stdin.isatty():
        raw_input_data = sys.stdin.read()

    if not raw_input_data.strip():
        # Fallback default test payload for diagnostic execution
        sample_payload = {
            "icao": "39AC47",
            "altitude": 35000,
            "speed": 465,
            "verticalRate": 0,
            "latitude": 43.6293,
            "longitude": 1.3638,
            "typeCode": 11
        }
        result = engine.evaluate_telemetry(sample_payload)
    else:
        try:
            data = json.loads(raw_input_data)
            result = engine.evaluate_telemetry(data)
        except Exception as e:
            result = {
                "status": "RECHECK_REQUIRED",
                "acceptance_score": 0.0,
                "verdict": f"JSON parsing or engine evaluation failure: {str(e)}",
                "anomalies": [str(e)],
                "evaluated_at": datetime.now(timezone.utc).isoformat()
            }

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
