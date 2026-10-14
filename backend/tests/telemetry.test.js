const request = require('supertest');
const { app } = require('../src/server');
const { decodeModeSFrame, encodeModeSFrame } = require('../src/decoder');
const { AirbusFlightTestStreamer } = require('../src/telemetry_streamer');
const { s3Mock, dynamoMock } = require('../../aws-mock/storage_adapter');

describe('Airbus Digital Aircraft Delivery - Telemetry Ingestion Pipeline', () => {

  describe('1. Mode-S & ADS-B Decoder Engine', () => {
    it('should correctly decode a real 112-bit DF17 extended squitter frame', () => {
      // Standard Boeing/Airbus ADS-B extended squitter
      const hexFrame = '8D40621D58C382D690C8AC2863A7';
      const decoded = decodeModeSFrame(hexFrame);

      expect(decoded).toBeDefined();
      expect(decoded.icao).toBe('40621D');
      expect(decoded.df).toBe(17);
      expect(decoded.typeCode).toBe(11); // Airborne Position
      expect(decoded.altitude).toBe(38000);
      expect(decoded.rawHex).toBe(hexFrame);
      expect(decoded.latitude).toBeCloseTo(46.257, 1);
    });

    it('should throw an error for malformed hex frames', () => {
      expect(() => {
        decodeModeSFrame('INVALID_HEX_XYZ');
      }).toThrow();
    });

    it('should encode and decode synthetic Mode-S frames round-trip', () => {
      const syntheticHex = encodeModeSFrame({
        icao: '39AC47',
        altitude: 32000,
        speed: 440,
        heading: 280,
        lat: 43.6293,
        lon: 1.3638,
        isOdd: false,
        type: 'position'
      });

      expect(syntheticHex).toHaveLength(28);
      const decoded = decodeModeSFrame(syntheticHex);
      expect(decoded.icao).toBe('39AC47');
      expect(decoded.df).toBe(17);
      expect(decoded.altitude).toBe(32000);
    });
  });

  describe('2. Flight Test Trajectory Streamer', () => {
    it('should step through test corridor waypoints and produce telemetry', () => {
      const streamer = new AirbusFlightTestStreamer({ msn: '11245', icao: '39AC47' });
      const step = streamer.nextStep();

      expect(step.aircraft.msn).toBe('11245');
      expect(step.telemetry.icao).toBe('39AC47');
      expect(step.telemetry.altitude).toBeGreaterThan(0);
      expect(step.telemetry.speed).toBeGreaterThan(0);
      expect(step.rawHex).toHaveLength(28);
    });
  });

  describe('3. REST API & Health Endpoints', () => {
    it('GET /api/v1/telemetry/health returns 200 and system metadata', async () => {
      const res = await request(app).get('/api/v1/telemetry/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('HEALTHY');
      expect(res.body.service).toBe('airbus-telemetry-ingestion-pipeline');
      expect(res.body.aircraftTarget.icao).toBe('39AC47');
      expect(res.body.aircraftTarget.msn).toBe('11245');
    });

    it('POST /api/v1/telemetry/inject processes a custom Mode-S frame', async () => {
      const res = await request(app)
        .post('/api/v1/telemetry/inject')
        .send({ hex: '8D40621D58C382D690C8AC2863A7' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.packet.telemetry.icao).toBe('40621D');
      expect(res.body.packet.compliance).toBeDefined();
    });

    it('POST /api/v1/telemetry/inject rejects missing hex frame', async () => {
      const res = await request(app)
        .post('/api/v1/telemetry/inject')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('4. AWS Mock Storage Adapter Layer', () => {
    it('should write and retrieve telemetry slices in S3 mock', async () => {
      const key = 'telemetry/test/A321_slice.json';
      const payload = { test: true, msn: '11245' };

      const putRes = await s3Mock.putObject(key, payload);
      expect(putRes.key).toBe(key);

      const getRes = await s3Mock.getObject(key);
      expect(JSON.parse(getRes.body)).toEqual(payload);
    });

    it('should persist and query compliance audit items in DynamoDB mock', async () => {
      await dynamoMock.putItem({
        PK: 'AIRCRAFT#39AC47',
        SK: 'TIMESTAMP#2026-10-14T10:00:00Z',
        status: 'OPTIMAL',
        acceptanceScore: 99.5
      });

      const records = await dynamoMock.queryByAircraft('39AC47');
      expect(records.length).toBeGreaterThan(0);
      expect(records[0].status).toBe('OPTIMAL');
    });
  });

});
