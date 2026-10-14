/**
 * Airbus Digital Aircraft Delivery - Backend Engine
 * Express REST API, Socket.io Broadcast Hub, Mode-S Bridge & AI Compliance Pipeline
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const { decodeModeSFrame } = require('./decoder');
const { AirbusFlightTestStreamer } = require('./telemetry_streamer');
const { evaluateFlightCompliance } = require('./compliance_bridge');
const { s3Mock, dynamoMock } = require('../../aws-mock/storage_adapter');

const PORT = process.env.PORT || 4000;
const app = express();
const server = http.createServer(app);

// Enable CORS
app.use(cors({ origin: '*' }));
app.use(express.json());

// Initialize WebSocket Hub
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Telemetry State & Metrics
let totalFramesIngested = 0;
let latestTelemetryPacket = null;
let latestComplianceVerdict = null;
const streamer = new AirbusFlightTestStreamer({
  msn: '11245',
  model: 'A321-271NX',
  callsign: 'AIB01NW',
  icao: '39AC47'
});

// Periodic Telemetry Ingestion Worker (2-second interval)
let streamerInterval = null;

async function processTelemetryCycle() {
  try {
    const rawStep = streamer.nextStep();
    totalFramesIngested++;

    // Evaluate compliance via Python AI Microservice
    const compliance = await evaluateFlightCompliance({
      ...rawStep.telemetry,
      typeCode: rawStep.metadata.typeCode
    });

    latestTelemetryPacket = rawStep;
    latestComplianceVerdict = compliance;

    const consolidatedPayload = {
      ...rawStep,
      compliance
    };

    // Broadcast over WebSockets
    io.emit('telemetry:update', consolidatedPayload);

    // Persist to AWS Mock Storage
    const timestampKey = new Date().toISOString().replace(/[:.]/g, '-');
    const s3Key = `telemetry/2026/10/14/${rawStep.telemetry.icao}_${timestampKey}.json`;
    await s3Mock.putObject(s3Key, consolidatedPayload, {
      contentType: 'application/json',
      aircraftMSN: rawStep.aircraft.msn
    });

    await dynamoMock.putItem({
      PK: `AIRCRAFT#${rawStep.telemetry.icao}`,
      SK: `TIMESTAMP#${rawStep.telemetry.timestamp}`,
      msn: rawStep.aircraft.msn,
      altitude: rawStep.telemetry.altitude,
      speed: rawStep.telemetry.speed,
      status: compliance.status,
      acceptanceScore: compliance.acceptance_score,
      flightPhase: compliance.flight_phase,
      verdict: compliance.verdict
    });

  } catch (error) {
    console.error('[Telemetry Pipeline Error]:', error.message);
  }
}

function startStreamer() {
  if (!streamerInterval) {
    // Run initial immediately
    processTelemetryCycle();
    streamerInterval = setInterval(processTelemetryCycle, 2000);
  }
}

function stopStreamer() {
  if (streamerInterval) {
    clearInterval(streamerInterval);
    streamerInterval = null;
  }
}

// REST Endpoints

/**
 * Health check endpoint required by Step 2
 */
app.get('/api/v1/telemetry/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'airbus-telemetry-ingestion-pipeline',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    framesIngested: totalFramesIngested,
    activeSockets: io.sockets.sockets.size,
    aircraftTarget: {
      msn: '11245',
      model: 'A321-271NX',
      icao: '39AC47',
      customerFleet: 'Airbus Acceptance Center / Test Fleet'
    }
  });
});

/**
 * Latest decoded telemetry snapshot & compliance status
 */
app.get('/api/v1/telemetry/latest', (req, res) => {
  if (!latestTelemetryPacket) {
    return res.status(503).json({ error: 'Telemetry ingestion warming up' });
  }
  res.json({
    telemetry: latestTelemetryPacket,
    compliance: latestComplianceVerdict
  });
});

/**
 * Manual frame injection endpoint (testing custom Mode-S hex frames)
 */
app.post('/api/v1/telemetry/inject', async (req, res) => {
  const { hex, refCoords } = req.body;
  if (!hex) {
    return res.status(400).json({ error: 'Missing required field: hex' });
  }

  try {
    const decoded = decodeModeSFrame(hex, refCoords);
    totalFramesIngested++;

    const compliance = await evaluateFlightCompliance({
      ...decoded,
      speed: decoded.speed || 350
    });

    const packet = {
      aircraft: {
        msn: 'CUSTOM-INJECTED',
        model: 'Airbus Test Vehicle',
        icao: decoded.icao
      },
      rawHex: hex,
      telemetry: decoded,
      compliance
    };

    io.emit('telemetry:update', packet);
    res.json({ success: true, packet });
  } catch (err) {
    res.status(422).json({ error: `Mode-S parsing error: ${err.message}` });
  }
});

/**
 * Audit log query from AWS mock store
 */
app.get('/api/v1/telemetry/audit', async (req, res) => {
  const icao = req.query.icao || '39AC47';
  const audits = await dynamoMock.queryByAircraft(icao, 25);
  const s3List = await s3Mock.listObjects(`telemetry/2026/10/14/${icao}`);

  res.json({
    aircraft: icao,
    auditTrailCount: audits.length,
    s3ObjectsArchived: s3List.keyCount,
    records: audits
  });
});

// Socket.io Connection Management
io.on('connection', (socket) => {
  console.log(`[WebSocket Hub] Client connected: ${socket.id}`);

  // Send immediate state on connect
  if (latestTelemetryPacket) {
    socket.emit('telemetry:update', {
      ...latestTelemetryPacket,
      compliance: latestComplianceVerdict
    });
  }

  socket.on('disconnect', () => {
    console.log(`[WebSocket Hub] Client disconnected: ${socket.id}`);
  });
});

// Start server if executed directly
if (require.main === module) {
  startStreamer();
  server.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(` AIRBUS DIGITAL AIRCRAFT DELIVERY - TELEMETRY INGESTION ENGINE `);
    console.log(` Port: ${PORT} | Health: http://localhost:${PORT}/api/v1/telemetry/health `);
    console.log(` WebSocket: ws://localhost:${PORT} `);
    console.log(` Mode-S Ingestion Cadence: 2000 ms`);
    console.log(`================================================================`);
  });
}

module.exports = {
  app,
  server,
  startStreamer,
  stopStreamer,
  processTelemetryCycle
};
