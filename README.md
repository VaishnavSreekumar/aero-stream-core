# Airbus Digital Aircraft Delivery: Telemetry Ingestion & Compliance Pipeline

[![CI/CD Pipeline](https://github.com/VaishnavSreekumar/airbus-digital-aircraft-delivery/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/VaishnavSreekumar/airbus-digital-aircraft-delivery/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Aviation Standard: DO-260B](https://img.shields.io/badge/Aviation%20Standard-RTCA%20DO--260B-00205B.svg)](https://www.rtca.org)
[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-339933.svg?logo=node.js)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB.svg?logo=python)](https://python.org)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react)](https://react.dev)
[![Docker](https://img.shields.io/badge/Docker-Multi--Stage-2496ED.svg?logo=docker)](https://docker.com)

An enterprise-grade, production-ready telemetry ingestion and AI-driven compliance pipeline engineered for **Airbus Customer Acceptance Flights** (e.g., A321neo / A350-1000 delivery test programs out of the Airbus Delivery Centre in Toulouse, France).

The system continuously ingests raw 112-bit Mode-S / ADS-B transponder frames, decodes positional data via Compact Position Reporting (CPR) algorithms, evaluates flight vectors against Airbus safety flight test envelopes using an AI compliance engine, and streams real-time flight telemetry to a dark-mode React avionics dashboard over WebSockets.

---

## 1. System Architecture

```
       +-------------------------------------------------------------------------+
       |           AIRBUS DIGITAL AIRCRAFT DELIVERY PLATFORM ARCHITECTURE        |
       +-------------------------------------------------------------------------+
                                                                                  
  +----------------------+      Raw Hex Mode-S      +---------------------------+
  | Flight Test Vehicle  | -----------------------> | Node.js Telemetry Engine  |
  | (A321neo / A350-1000)|   (DF17 Extended Squit)  | - Express REST API        |
  | MSN 11245 / F-WZNW   |                          | - Bitwise Frame Parser    |
  +----------------------+                          | - Socket.io WebSocket Hub |
                                                    +-------------+-------------+
                                                                  |
                                      +---------------------------+---------------------------+
                                      | IPC Stream / Process Exec                             | Event Stream
                                      v                                                       v
                       +-----------------------------+                         +-----------------------------+
                       | Python 3.11 Compliance AI   |                         | React Delivery Dashboard    |
                       | - Flight Envelope Validator |                         | - Dark Cockpit Theme        |
                       | - Speed/Alt Compliance Eval |                         | - Primary Metric Cards      |
                       | - Acceptance Score (0-100%) |                         | - Live Radar Flight Track   |
                       +--------------+--------------+                         | - Real-time Mode-S Terminal |
                                      |                                        +-----------------------------+
                                      | Compliance Payload                                    ^
                                      +---------------------------+---------------------------+
                                                                  |
                                                                  v
                                                    +---------------------------+
                                                    | AWS Mock Storage Adapter  |
                                                    | - S3 Telemetry Archive    |
                                                    | - DynamoDB Compliance Log |
                                                    +---------------------------+
```

---

## 2. Key Modules & Technology Stack

### 🚀 Backend Ingestion Engine (`/backend`)
- **Node.js (v20+) & Express**: High-throughput REST API and WebSocket event hub.
- **Bitwise Mode-S / ADS-B Decoder (`src/decoder.js`)**:
  - Full decoding of 112-bit Downlink Format 17 (`DF17`) extended squitter frames.
  - Extracts 24-bit ICAO aircraft addresses (e.g., `39AC47` for Airbus Flight Test MSN 11245).
  - Bitwise decoding of Type Codes (TC 11 Airborne Position and TC 19 Airborne Velocity).
  - Implements **Compact Position Reporting (CPR)** local decoding mathematics relative to receiver stations (e.g., Toulouse-Blagnac LFBO: `43.6293°N, 1.3638°E`).
- **Telemetry Streamer (`src/telemetry_streamer.js`)**:
  - Simulates an authentic Customer Acceptance Flight profile along the **Toulouse -> Bay of Biscay Supersonic/Cruise Test Corridor**.
  - Broadcasts synthesized 28-character hex frames (`8D39AC47...`) at a steady 2-second interval over Socket.io.

### 🧠 AI Flight Test Acceptance Microservice (`/analytics`)
- **Python 3.11 Compliance Engine (`compliance_engine.py`)**:
  - Evaluates aircraft telemetry vectors against certified Airbus flight test limits:
    - **Airspeed Envelope ($V_{MO} / M_{MO}$)**: Enforces $280\text{ kts}$ below FL100, $350\text{ kts}$ below FL300, and $M_{MO} \approx 0.82$ ($495\text{ kts}$ GS) at cruise.
    - **Altitude Ceiling**: $41,000\text{ ft}$ certified limit.
    - **Vertical Dynamic Stability**: Climb limit $\le +4,500\text{ fpm}$, Emergency descent simulation $\ge -6,500\text{ fpm}$.
    - **Mode-S Parity Integrity**: Validates 24-bit ICAO parity and transponder health.
  - Computes a weighted **Customer Acceptance Score ($0 - 100\%$)** and categorizes flight status:
    - `OPTIMAL`: Full envelope compliance ($>90\%$).
    - `AIRSPEED_WARNING`: Boundary limit proximity ($70\% - 90\%$).
    - `RECHECK_REQUIRED`: Structural or aerodynamic parameter exceedance ($<70\%$).

### 🖥️ React Delivery Cockpit Dashboard (`/frontend`)
- **React 19 & Vanilla CSS Glassmorphism**:
  - Airbus Corporate Navy (`#00205B`) and Cyan (`#00A3E0`) cockpit aesthetic.
  - **4 Primary Metric Cards**:
    1. **Aircraft MSN / ICAO**: MSN 11245, A321-271NX, ICAO `39AC47`, Squawk 1000.
    2. **Calibrated Altitude**: Real-time altitude with vertical speed trend indicator ($+2,240\text{ fpm}$) and FL indicator.
    3. **Ground Speed**: Speed in knots, Mach equivalent ($M\text{ }0.78$), and $V_{MO}$ limit bar.
    4. **AI Acceptance Status**: Dynamic badge (`OPTIMAL`, `AIRSPEED_WARNING`, `RECHECK_REQUIRED`) and real-time score ($98.4\%$).
  - **Tactical Flight Radar Display**: SVG radar with rotating sweep arm, waypoints, range rings, and aircraft heading vector.
  - **Live Mode-S Hex Stream Console**: Real-time inspection of 112-bit hex frames with manual frame injection capability.
  - **Customer Acceptance Dossier Export**: Generate and download JSON delivery compliance dossiers.

### ☁️ Cloud & DevOps Infrastructure
- **AWS Mock Storage Adapter (`/aws-mock`)**:
  - Amazon S3 mock bucket (`airbus-telemetry-archive`) storing partitioned JSON flight slices.
  - Amazon DynamoDB mock table (`AirbusFlightAcceptanceAudits`) indexed with partition key `PK: AIRCRAFT#<ICAO>` and sort key `SK: TIMESTAMP#<ISO>`.
- **Docker Compose**: Containerized multi-stage builds on shared bridge network `airbus-delivery-net`.
- **GitHub Actions CI/CD (`.github/workflows/ci-cd.yml`)**: Automated unit testing (Jest + Python unittest) and Docker build validation.

---

## 3. Mode-S Hex Frame Format (DF17 ADS-B)

A standard 112-bit Extended Squitter frame consists of 28 hexadecimal characters (14 bytes):

```
+-------+--------+------------------+------------------------------+--------------------+
| Bits  | 1 - 5  | 6 - 8  | 9 - 32  | 33 - 88                      | 89 - 112           |
+-------+--------+--------+---------+------------------------------+--------------------+
| Field | DF (17)| CA     | ICAO    | ME (Message Extended ADS-B)  | PI (Parity/CRC)    |
| Length| 5 bits | 3 bits | 24 bits | 56 bits (TC, Alt, Pos/Vel)   | 24 bits            |
+-------+--------+--------+---------+------------------------------+--------------------+
```

Example frame decoded by the pipeline:
`8D40621D58C382D690C8AC2863A7`
- `DF`: 17 (Extended Squitter)
- `ICAO`: `40621D` (British Airways A320)
- `Type Code`: 11 (Airborne Position with barometric altitude)
- `Altitude`: 38,000 FT (FL380)

---

## 4. REST API & WebSocket Specification

### REST Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/telemetry/health` | Service health status, uptime, ingested frame count, and target aircraft |
| `GET` | `/api/v1/telemetry/latest` | Returns latest decoded telemetry frame and AI compliance evaluation |
| `POST` | `/api/v1/telemetry/inject` | Ingests a raw Mode-S hex frame: `{"hex": "8D40621D58C382D690C8AC2863A7"}` |
| `GET` | `/api/v1/telemetry/audit` | Retrieves persisted compliance audit logs from DynamoDB mock store |

### Sample Health Response (`GET /api/v1/telemetry/health`)
```json
{
  "status": "HEALTHY",
  "service": "airbus-telemetry-ingestion-pipeline",
  "timestamp": "2026-10-14T10:11:15.000Z",
  "uptimeSeconds": 142,
  "framesIngested": 71,
  "activeSockets": 1,
  "aircraftTarget": {
    "msn": "11245",
    "model": "A321-271NX",
    "icao": "39AC47",
    "customerFleet": "Airbus Acceptance Center / Test Fleet"
  }
}
```

### WebSocket Events (`ws://localhost:4000`)
- `telemetry:update`: Broadcast every 2 seconds containing:
  - `aircraft`: MSN, model, callsign
  - `rawHex`: 28-character raw Mode-S frame
  - `telemetry`: Decoded `{ icao, altitude, speed, heading, verticalRate, latitude, longitude }`
  - `compliance`: AI evaluation `{ status, acceptance_score, verdict, checks, anomalies }`

---

## 5. Quickstart & Execution

### Prerequisites
- Node.js v20+ and npm
- Python 3.11+
- (Optional) Docker and Docker Compose

### Local Execution

```bash
# 1. Clone repository
git clone https://github.com/VaishnavSreekumar/airbus-digital-aircraft-delivery.git
cd airbus-digital-aircraft-delivery

# 2. Run all backend and analytics unit tests
npm test

# 3. Start the Backend Ingestion Engine (Port 4000)
npm run start:backend

# 4. In a new terminal, launch the React Dashboard (Port 5173)
npm run start:frontend
```

Access the dashboard at `http://localhost:5173`.

### Docker Compose Execution

```bash
docker compose up --build
```
- Frontend Dashboard: `http://localhost:3000`
- Backend API & WebSockets: `http://localhost:4000`
- Health Endpoint: `http://localhost:4000/api/v1/telemetry/health`

---

## 6. Test Suite Verification

Run the unified test runner:
```bash
npm test
```

Test Results Output:
```
> airbus-digital-aircraft-delivery@1.0.0 test
> npm run test:backend && npm run test:analytics

PASS tests/telemetry.test.js
  Airbus Digital Aircraft Delivery - Telemetry Ingestion Pipeline
    1. Mode-S & ADS-B Decoder Engine
      √ should correctly decode a real 112-bit DF17 extended squitter frame (7 ms)
      √ should throw an error for malformed hex frames (14 ms)
      √ should encode and decode synthetic Mode-S frames round-trip (2 ms)
    2. Flight Test Trajectory Streamer
      √ should step through test corridor waypoints and produce telemetry (1 ms)
    3. REST API & Health Endpoints
      √ GET /api/v1/telemetry/health returns 200 and system metadata (61 ms)
      √ POST /api/v1/telemetry/inject processes a custom Mode-S frame (118 ms)
      √ POST /api/v1/telemetry/inject rejects missing hex frame (16 ms)
    4. AWS Mock Storage Adapter Layer
      √ should write and retrieve telemetry slices in S3 mock (2 ms)
      √ should persist and query compliance audit items in DynamoDB mock (1 ms)

Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
Time:        1.019 s

Ran 4 tests in 0.000s
OK (4 passed, 0 failed)
```

---

## 7. Resume Highlights for Airbus "Digital for Aircraft Delivery"

Tailored impact bullet points highlighting full-stack aerospace engineering competencies:

- **Avionics Telemetry Pipeline & Mode-S Ingestion**: Architected an enterprise-grade telemetry ingestion pipeline in Node.js (Express & Socket.io) that parses 112-bit Mode-S / ADS-B Downlink Format 17 (DF17) frames in real-time, extracting 24-bit ICAO addresses, altitude, and velocity via bitwise buffer manipulation and Compact Position Reporting (CPR) algorithms.
- **Flight Acceptance AI & Safety Envelope Modeling**: Engineered a Python microservice simulating Airbus Customer Acceptance Flight envelope checks (EASA CS-25 & DO-260B), evaluating $V_{MO} / M_{MO}$ airspeed limits, altitude ceilings, and vertical dynamic stability to generate multi-criteria acceptance scores ($0 - 100\%$) and automated compliance verdicts.
- **Real-Time Avionics Cockpit Dashboard**: Developed a high-performance React dashboard with dark-mode Airbus cockpit glassmorphism, rendering 4 primary flight metric cards, a live tactical radar trajectory display over the Toulouse-Bay of Biscay corridor, and an interactive raw Mode-S hex frame inspector with zero UI flickering.
- **Cloud Architecture & CI/CD DevOps**: Designed a mock AWS persistence layer implementing S3 telemetry archiving and DynamoDB compliance audit tables; containerized microservices using multi-stage Dockerfiles and Docker Compose; automated linting, Jest testing, and image builds via GitHub Actions CI/CD workflows.

---

## 8. License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
