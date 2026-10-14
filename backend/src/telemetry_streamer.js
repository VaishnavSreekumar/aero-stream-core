/**
 * Airbus Digital Aircraft Delivery - Flight Test Trajectory & Mode-S Streamer
 * Simulates Airbus Customer Acceptance Flight profile MSN 11245 (A321neo / F-WZNW)
 * Operating out of Airbus Delivery Center Toulouse-Blagnac (LFBO) to Bay of Biscay Test Corridor
 */

const { encodeModeSFrame, decodeModeSFrame } = require('./decoder');

class AirbusFlightTestStreamer {
  constructor(options = {}) {
    this.msn = options.msn || '11245';
    this.model = options.model || 'A321-271NX';
    this.callsign = options.callsign || 'AIB01NW';
    this.icao = options.icao || '39AC47';
    this.intervalMs = options.intervalMs || 2000;

    // Flight Waypoints across Toulouse -> Bay of Biscay Acceptance Corridor
    this.waypoints = [
      { name: 'LFBO_DEP', lat: 43.6293, lon: 1.3638, alt: 500, spd: 145, vrate: 2200 },
      { name: 'MONTAUBAN', lat: 44.0200, lon: 1.3500, alt: 9500, spd: 260, vrate: 2800 },
      { name: 'AGEN_VORTAC', lat: 44.2000, lon: 0.6200, alt: 18500, spd: 320, vrate: 2400 },
      { name: 'MONT_DE_MARSAN', lat: 43.8900, lon: -0.5000, alt: 29000, spd: 390, vrate: 1800 },
      { name: 'BISCAY_TEST_ALPHA', lat: 44.4000, lon: -2.1000, alt: 35000, spd: 465, vrate: 0 },
      { name: 'BISCAY_MACH_RUN', lat: 44.9500, lon: -3.2000, alt: 35000, spd: 485, vrate: 0 },
      { name: 'RAPID_DESCENT_SIM', lat: 44.6000, lon: -2.8000, alt: 21000, spd: 380, vrate: -4200 },
      { name: 'ARCACHON_TURN', lat: 44.6500, lon: -1.1500, alt: 14000, spd: 290, vrate: -1800 },
      { name: 'AUCH_INBOUND', lat: 43.6800, lon: 0.6000, alt: 4500, spd: 210, vrate: -1200 },
      { name: 'LFBO_ILS_32L', lat: 43.6350, lon: 1.3700, alt: 750, spd: 140, vrate: -700 }
    ];

    this.currentWaypointIndex = 0;
    this.progress = 0.0; // 0.0 to 1.0 between current and next waypoint
    this.currentPosition = { ...this.waypoints[0] };
    this.heading = 310;
    this.isOddFrame = false;
    this.tickCounter = 0;
  }

  /**
   * Advances trajectory simulation step by step
   */
  nextStep() {
    this.tickCounter++;
    this.isOddFrame = !this.isOddFrame;

    const wpA = this.waypoints[this.currentWaypointIndex];
    const nextIndex = (this.currentWaypointIndex + 1) % this.waypoints.length;
    const wpB = this.waypoints[nextIndex];

    // Progress interpolation
    this.progress += 0.08;
    if (this.progress >= 1.0) {
      this.progress = 0.0;
      this.currentWaypointIndex = nextIndex;
    }

    const t = this.progress;
    // Linear / sinusoidal interpolation with realistic atmospheric jitter
    const jitterAlt = (Math.random() - 0.5) * 15;
    const jitterSpd = (Math.random() - 0.5) * 4;

    const lat = wpA.lat + (wpB.lat - wpA.lat) * t;
    const lon = wpA.lon + (wpB.lon - wpA.lon) * t;
    const alt = Math.round(wpA.alt + (wpB.alt - wpA.alt) * t + jitterAlt);
    const spd = Math.round(wpA.spd + (wpB.spd - wpA.spd) * t + jitterSpd);
    const vrate = Math.round(wpA.vrate + (wpB.vrate - wpA.vrate) * t);

    // Calculate heading in degrees
    const dLon = (wpB.lon - wpA.lon) * Math.cos(((wpA.lat + wpB.lat) / 2) * Math.PI / 180);
    const dLat = wpB.lat - wpA.lat;
    this.heading = Math.round((Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360);

    this.currentPosition = {
      lat: Number(lat.toFixed(6)),
      lon: Number(lon.toFixed(6)),
      alt: Math.max(0, alt),
      spd: Math.max(0, spd),
      vrate
    };

    // Synthesize authentic Mode-S Extended Squitter hex frame (DF17)
    const rawHex = encodeModeSFrame({
      icao: this.icao,
      altitude: this.currentPosition.alt,
      speed: this.currentPosition.spd,
      heading: this.heading,
      lat: this.currentPosition.lat,
      lon: this.currentPosition.lon,
      isOdd: this.isOddFrame,
      type: this.tickCounter % 2 === 0 ? 'position' : 'velocity'
    });

    // Run through our decoder to ensure full end-to-end integrity
    const decoded = decodeModeSFrame(rawHex, {
      latitude: this.currentPosition.lat,
      longitude: this.currentPosition.lon
    });

    return {
      aircraft: {
        msn: this.msn,
        model: this.model,
        callsign: this.callsign,
        customer: 'Airbus Acceptance Center / Test Fleet'
      },
      rawHex,
      telemetry: {
        icao: this.icao,
        altitude: this.currentPosition.alt,
        speed: this.currentPosition.spd,
        heading: this.heading,
        verticalRate: this.currentPosition.vrate,
        latitude: this.currentPosition.lat,
        longitude: this.currentPosition.lon,
        squawk: '1000',
        timestamp: new Date().toISOString()
      },
      metadata: {
        downlinkFormat: decoded.df,
        typeCode: decoded.typeCode,
        isOddFrame: this.isOddFrame,
        currentWaypoint: wpA.name,
        nextWaypoint: wpB.name,
        flightPhase: alt > 30000 ? 'CRUISE_RVSM' : (vrate > 500 ? 'CLIMB' : (vrate < -1000 ? 'DESCENT' : 'TRANSIT'))
      }
    };
  }
}

module.exports = {
  AirbusFlightTestStreamer
};
