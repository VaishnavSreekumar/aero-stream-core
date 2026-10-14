import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  Plane,
  Radio,
  Gauge,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  Terminal,
  Navigation,
  Compass,
  ArrowUpRight,
  ArrowDownRight,
  FileCheck,
  Send,
  RefreshCw,
  Cpu,
  Layers,
  Database
} from 'lucide-react';

export default function AircraftDeliveryDashboard() {
  const [socketConnected, setSocketConnected] = useState(false);
  const [telemetry, setTelemetry] = useState({
    icao: '39AC47',
    altitude: 35000,
    speed: 465,
    heading: 295,
    verticalRate: 0,
    latitude: 44.4000,
    longitude: -2.1000,
    squawk: '1000',
    timestamp: new Date().toISOString()
  });

  const [aircraftInfo, setAircraftInfo] = useState({
    msn: '11245',
    model: 'A321-271NX',
    callsign: 'AIB01NW',
    customer: 'Airbus Acceptance Center / Test Fleet'
  });

  const [compliance, setCompliance] = useState({
    status: 'OPTIMAL',
    acceptance_score: 98.4,
    verdict: 'All Airbus Customer Acceptance Flight parameters conform strictly to DO-260B / EASA CS-25 specifications.',
    flight_phase: 'CRUISE_RVSM_TEST',
    checks: [
      { name: 'Certified Altitude Ceiling', threshold: '<= 41000 FT', measured: '35000 FT', passed: true },
      { name: 'Airspeed Envelope (Vmo/Mmo)', threshold: '<= 280 KTS (Low) / 495 KTS (High)', measured: '465 KTS', passed: true },
      { name: 'Vertical Dynamic Stability', threshold: '[-6500, +4500] FPM', measured: '+0 FPM', passed: true },
      { name: 'Mode-S Transponder Parity', threshold: '24-bit ICAO Valid', measured: '39AC47', passed: true }
    ],
    anomalies: []
  });

  const [hexFrames, setHexFrames] = useState([
    { hex: '8D39AC47580F5120BC53452863A7', time: new Date().toLocaleTimeString(), tc: 11, desc: 'TC 11 Airborne Position (Even)' },
    { hex: '8D39AC47990404134000002863A7', time: new Date().toLocaleTimeString(), tc: 19, desc: 'TC 19 Airborne Velocity Subtype 1' }
  ]);

  const [flightHistory, setFlightHistory] = useState([
    { lat: 43.6293, lon: 1.3638, name: 'LFBO' },
    { lat: 44.0200, lon: 1.3500, name: 'MONTAUBAN' },
    { lat: 44.2000, lon: 0.6200, name: 'AGEN' },
    { lat: 43.8900, lon: -0.5000, name: 'MONT_DE_MARSAN' },
    { lat: 44.4000, lon: -2.1000, name: 'BISCAY_TEST' }
  ]);

  const [customHex, setCustomHex] = useState('');
  const [injectStatus, setInjectStatus] = useState(null);
  const [showCertModal, setShowCertModal] = useState(false);
  const [framesCount, setFramesCount] = useState(42);

  const socketRef = useRef(null);

  // Connect to Node.js Backend WebSocket Hub
  useEffect(() => {
    // In dev or docker, connect to backend at :4000 or relative
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
    const socket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('telemetry:update', (data) => {
      if (data.telemetry) {
        setTelemetry(data.telemetry);
        setFramesCount(prev => prev + 1);

        // Update breadcrumb flight track
        if (data.telemetry.latitude && data.telemetry.longitude) {
          setFlightHistory(prev => {
            const next = [...prev, { lat: data.telemetry.latitude, lon: data.telemetry.longitude }];
            return next.slice(-25); // keep last 25 positions
          });
        }
      }

      if (data.aircraft) {
        setAircraftInfo(data.aircraft);
      }

      if (data.compliance) {
        setCompliance(data.compliance);
      }

      if (data.rawHex) {
        setHexFrames(prev => [
          {
            hex: data.rawHex,
            time: new Date().toLocaleTimeString(),
            tc: data.metadata?.typeCode || 11,
            desc: data.metadata?.typeCode === 19 ? 'Airborne Velocity (TC 19)' : 'Airborne Position (TC 11)'
          },
          ...prev.slice(0, 19)
        ]);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Handle manual hex frame injection
  const handleInjectFrame = async (e) => {
    e.preventDefault();
    if (!customHex.trim()) return;

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
      const res = await fetch(`${backendUrl}/api/v1/telemetry/inject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hex: customHex.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setInjectStatus({ type: 'success', msg: `Frame Ingested! ICAO: ${data.packet.telemetry.icao}` });
        setCustomHex('');
      } else {
        setInjectStatus({ type: 'error', msg: data.error || 'Ingestion failed' });
      }
    } catch (err) {
      setInjectStatus({ type: 'error', msg: `Network error: ${err.message}` });
    }

    setTimeout(() => setInjectStatus(null), 4000);
  };

  const statusClass = compliance.status.toLowerCase();
  const machEquivalent = (telemetry.speed / 580).toFixed(2);

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.5rem' }}>
      
      {/* Top Airbus Cockpit Header */}
      <header style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '1.25rem 1.75rem',
        background: 'rgba(10, 19, 41, 0.85)',
        border: '1px solid var(--border-glow)',
        borderRadius: '16px',
        marginBottom: '1.5rem',
        boxShadow: '0 8px 30px rgba(0, 32, 91, 0.35)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #00205B, #00A3E0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px var(--airbus-cyan-glow)'
          }}>
            <Plane color="#ffffff" size={26} style={{ transform: 'rotate(-45deg)' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
                AIRBUS <span style={{ color: 'var(--airbus-cyan)' }}>DIGITAL AIRCRAFT DELIVERY</span>
              </h1>
              <span style={{
                background: 'rgba(0, 163, 224, 0.15)',
                color: 'var(--airbus-cyan)',
                border: '1px solid var(--airbus-cyan)',
                fontSize: '0.65rem',
                fontWeight: 700,
                padding: '0.2rem 0.5rem',
                borderRadius: '4px'
              }}>
                LEVEL-D TEST PIPELINE
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Real-time ADS-B / Mode-S Telemetry Ingestion, AI Safety Envelope Compliance & Live Delivery Track
            </p>
          </div>
        </div>

        {/* Live Stream Status Badge & Quick Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.5rem 1rem',
            background: 'rgba(5, 10, 21, 0.8)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px'
          }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: socketConnected ? '#10B981' : '#EF4444',
              boxShadow: socketConnected ? '0 0 10px #10B981' : '0 0 10px #EF4444'
            }} className="live-indicator" />
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: socketConnected ? '#34D399' : '#F87171' }}>
              {socketConnected ? 'SOCKET.IO LIVE (2s SYNC)' : 'WS DISCONNECTED'}
            </span>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>| {framesCount} Frames</span>
          </div>

          <button
            onClick={() => setShowCertModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.55rem 1.1rem',
              background: 'linear-gradient(135deg, #00A3E0, #005696)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(0, 163, 224, 0.35)',
              transition: 'transform 0.15s ease'
            }}
          >
            <FileCheck size={16} />
            Acceptance Dossier
          </button>
        </div>
      </header>

      {/* STEP 4 REQUIRED: 4 PRIMARY METRIC CARDS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1.25rem',
        marginBottom: '1.5rem'
      }}>
        
        {/* CARD 1: Aircraft MSN / ICAO Identifier */}
        <div className="cockpit-card" id="metric-card-msn">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Aircraft Identification
            </span>
            <Plane size={18} color="var(--airbus-cyan)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span className="avionics-num" style={{ fontSize: '2rem', fontWeight: 800, color: '#fff' }}>
              MSN {aircraftInfo.msn}
            </span>
            <span style={{ fontSize: '0.9rem', color: 'var(--airbus-cyan)', fontWeight: 700 }}>
              {aircraftInfo.model}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>24-bit ICAO: <strong className="mono-text" style={{ color: '#fff' }}>{telemetry.icao}</strong></span>
            <span>Squawk: <strong className="mono-text" style={{ color: '#34D399' }}>{telemetry.squawk || '1000'}</strong></span>
          </div>
          <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            Callsign: <strong style={{ color: '#93c5fd' }}>{aircraftInfo.callsign}</strong> • Mode-S Transponder Active
          </div>
        </div>

        {/* CARD 2: Pressure Altitude (ft) */}
        <div className="cockpit-card" id="metric-card-altitude">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Calibrated Altitude
            </span>
            <Gauge size={18} color="var(--airbus-cyan)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span className="avionics-num" style={{ fontSize: '2rem', fontWeight: 800, color: '#fff' }}>
              {Number(telemetry.altitude).toLocaleString()}
            </span>
            <span style={{ fontSize: '0.9rem', color: 'var(--airbus-cyan)', fontWeight: 700 }}>FT</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              FL{Math.round(telemetry.altitude / 100)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
            {telemetry.verticalRate >= 0 ? (
              <span style={{ color: '#34D399', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                <ArrowUpRight size={16} /> +{telemetry.verticalRate} FPM
              </span>
            ) : (
              <span style={{ color: '#F87171', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                <ArrowDownRight size={16} /> {telemetry.verticalRate} FPM
              </span>
            )}
            <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>• 25ft Resolution</span>
          </div>
          <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            RVSM Ceiling Limit: <strong style={{ color: '#fff' }}>41,000 FT</strong>
          </div>
        </div>

        {/* CARD 3: Ground Speed (kts) */}
        <div className="cockpit-card" id="metric-card-speed">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Ground Speed (GS)
            </span>
            <Navigation size={18} color="var(--airbus-cyan)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span className="avionics-num" style={{ fontSize: '2rem', fontWeight: 800, color: '#fff' }}>
              {telemetry.speed || '---'}
            </span>
            <span style={{ fontSize: '0.9rem', color: 'var(--airbus-cyan)', fontWeight: 700 }}>KTS</span>
            <span style={{ fontSize: '0.85rem', color: '#93C5FD', marginLeft: 'auto', fontWeight: 600 }}>
              M {machEquivalent}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>Heading: <strong className="mono-text" style={{ color: '#fff' }}>{telemetry.heading}°</strong></span>
            <span>Vmo Limit: <strong className="mono-text" style={{ color: '#FBBF24' }}>350 KTS</strong></span>
          </div>
          <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            Airborne Velocity: <strong style={{ color: '#34D399' }}>TC 19 Subtype 1 Decoded</strong>
          </div>
        </div>

        {/* CARD 4: AI Flight Test Acceptance Status */}
        <div className="cockpit-card" id="metric-card-compliance">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              AI Acceptance Engine
            </span>
            <ShieldCheck size={18} color={compliance.status === 'OPTIMAL' ? '#34D399' : '#FBBF24'} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
            <span className={`status-badge ${statusClass}`} style={{ fontSize: '0.85rem' }}>
              {compliance.status === 'OPTIMAL' && <CheckCircle2 size={14} />}
              {compliance.status === 'AIRSPEED_WARNING' && <AlertTriangle size={14} />}
              {compliance.status === 'RECHECK_REQUIRED' && <XCircle size={14} />}
              {compliance.status}
            </span>
            <div style={{ textAlign: 'right' }}>
              <span className="avionics-num" style={{ fontSize: '1.4rem', fontWeight: 800, color: compliance.status === 'OPTIMAL' ? '#34D399' : '#FBBF24' }}>
                {compliance.acceptance_score}%
              </span>
            </div>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.3', height: '32px', overflow: 'hidden' }}>
            {compliance.verdict}
          </p>
          <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            Flight Phase: <strong style={{ color: 'var(--airbus-cyan)' }}>{compliance.flight_phase}</strong>
          </div>
        </div>

      </div>

      {/* Main Interactive Grid: Flight Radar Corridor & Customer Acceptance Matrix */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(340px, 1.4fr) minmax(300px, 1fr)',
        gap: '1.5rem',
        marginBottom: '1.5rem'
      }}>

        {/* Tactical Flight Radar Display */}
        <div className="cockpit-card" style={{ minHeight: '440px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Compass color="var(--airbus-cyan)" size={18} />
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                Toulouse - Bay of Biscay Flight Test Corridor
              </h2>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              LAT: {telemetry.latitude?.toFixed(4)}°N | LON: {telemetry.longitude?.toFixed(4)}°E
            </span>
          </div>

          {/* SVG Tactical Radar Display */}
          <div style={{
            flex: 1,
            position: 'relative',
            background: 'radial-gradient(circle at center, #091a38 0%, #040915 85%)',
            border: '1px solid rgba(0, 163, 224, 0.25)',
            borderRadius: '8px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {/* Rotating Radar Sweep Arm */}
            <div className="radar-sweep-arm" />

            {/* Radar Range Rings and Crosshairs */}
            <svg width="100%" height="100%" viewBox="-150 -150 300 300" style={{ position: 'absolute', top: 0, left: 0 }}>
              <circle cx="0" cy="0" r="130" fill="none" stroke="rgba(0, 163, 224, 0.15)" strokeWidth="1" strokeDasharray="3,3" />
              <circle cx="0" cy="0" r="90" fill="none" stroke="rgba(0, 163, 224, 0.2)" strokeWidth="1" />
              <circle cx="0" cy="0" r="50" fill="none" stroke="rgba(0, 163, 224, 0.25)" strokeWidth="1" />
              <circle cx="0" cy="0" r="15" fill="none" stroke="rgba(0, 163, 224, 0.4)" strokeWidth="1" />
              <line x1="-140" y1="0" x2="140" y2="0" stroke="rgba(0, 163, 224, 0.12)" strokeWidth="1" />
              <line x1="0" y1="-140" x2="0" y2="140" stroke="rgba(0, 163, 224, 0.12)" strokeWidth="1" />

              {/* Waypoints */}
              <g id="radar-waypoints">
                <text x="80" y="80" fill="#93C5FD" fontSize="8" fontFamily="var(--font-mono)">LFBO (Toulouse)</text>
                <circle cx="70" cy="70" r="3" fill="#00A3E0" />

                <text x="50" y="20" fill="#64748B" fontSize="7" fontFamily="var(--font-mono)">MONTAUBAN</text>
                <circle cx="45" cy="15" r="2" fill="#64748B" />

                <text x="-90" y="-70" fill="#FBBF24" fontSize="8" fontFamily="var(--font-mono)">BISCAY TEST BOX</text>
                <rect x="-95" y="-85" width="80" height="50" fill="none" stroke="rgba(245, 158, 11, 0.3)" strokeDasharray="4,4" />
              </g>

              {/* Aircraft Trail Path */}
              {flightHistory.length > 1 && (
                <polyline
                  points={flightHistory.map((pt, i) => {
                    // Map geo coordinates into SVG space roughly centered on SW France
                    const x = ((pt.lon - (-0.5)) / 4.5) * 220 - 20;
                    const y = -((pt.lat - 44.0) / 2.0) * 180;
                    return `${x},${y}`;
                  }).join(' ')}
                  fill="none"
                  stroke="#00A3E0"
                  strokeWidth="2"
                  strokeOpacity="0.75"
                />
              )}

              {/* Active Aircraft Symbol */}
              {(() => {
                const acX = ((telemetry.longitude - (-0.5)) / 4.5) * 220 - 20;
                const acY = -((telemetry.latitude - 44.0) / 2.0) * 180;
                return (
                  <g transform={`translate(${acX}, ${acY})`}>
                    <circle cx="0" cy="0" r="8" fill="rgba(0, 163, 224, 0.25)" className="live-indicator" />
                    <g transform={`rotate(${telemetry.heading})`}>
                      <polygon points="0,-10 6,8 0,4 -6,8" fill="#FFFFFF" stroke="#00A3E0" strokeWidth="1" />
                    </g>
                    <text x="12" y="3" fill="#FFFFFF" fontSize="9" fontWeight="bold" fontFamily="var(--font-mono)">
                      {aircraftInfo.callsign}
                    </text>
                    <text x="12" y="14" fill="#93C5FD" fontSize="7" fontFamily="var(--font-mono)">
                      {Math.round(telemetry.altitude / 100)} / {telemetry.speed}KTS
                    </text>
                  </g>
                );
              })()}
            </svg>

            {/* Radar Overlay Controls */}
            <div style={{
              position: 'absolute',
              bottom: '10px',
              left: '10px',
              background: 'rgba(5, 10, 21, 0.85)',
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.1)',
              fontSize: '0.75rem',
              color: 'var(--text-muted)'
            }}>
              Range: <strong style={{ color: '#fff' }}>150 NM</strong> • Mode-S DF17 Active Target
            </div>
          </div>
        </div>

        {/* Customer Acceptance Compliance Checks */}
        <div className="cockpit-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck color="#34D399" size={18} />
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                Acceptance Criteria Verification
              </h2>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#34D399', fontWeight: 600 }}>
              DO-260B / CS-25
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
            {compliance.checks.map((chk, idx) => (
              <div key={idx} style={{
                background: 'rgba(5, 10, 21, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '8px',
                padding: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                    {chk.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                    Threshold: {chk.threshold}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: chk.passed ? '#34D399' : '#F87171' }}>
                    {chk.measured}
                  </div>
                  <span style={{
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    color: chk.passed ? '#34D399' : '#F87171',
                    textTransform: 'uppercase'
                  }}>
                    {chk.passed ? 'PASSED' : 'OUT_OF_BOUNDS'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* AWS Cloud Mock Persistence Status */}
          <div style={{
            marginTop: '1rem',
            padding: '0.75rem',
            background: 'rgba(0, 32, 91, 0.25)',
            border: '1px solid rgba(0, 163, 224, 0.3)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.75rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Database size={16} color="var(--airbus-cyan)" />
              <span>AWS Storage Sink: <strong style={{ color: '#fff' }}>S3 & DynamoDB Active</strong></span>
            </div>
            <span style={{ color: '#34D399' }}>✓ Synced</span>
          </div>
        </div>

      </div>

      {/* Mode-S Hex Frame Inspector & Manual Frame Injection Terminal */}
      <div className="cockpit-card">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Terminal color="var(--airbus-cyan)" size={18} />
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
              Mode-S / ADS-B Extended Squitter Frame Stream (112-bit Transponder)
            </h2>
          </div>
          
          {/* Frame Inject Form */}
          <form onSubmit={handleInjectFrame} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, maxWidth: '560px' }}>
            <input
              type="text"
              placeholder="Inject Raw Mode-S Hex (e.g., 8D40621D58C382D690C8AC2863A7)"
              value={customHex}
              onChange={(e) => setCustomHex(e.target.value)}
              className="mono-text"
              style={{
                flex: 1,
                background: 'rgba(5, 10, 21, 0.8)',
                border: '1px solid var(--border-glow)',
                borderRadius: '6px',
                padding: '0.5rem 0.75rem',
                color: '#fff',
                fontSize: '0.8rem',
                outline: 'none'
              }}
            />
            <button
              type="submit"
              style={{
                background: 'var(--airbus-cyan)',
                border: 'none',
                color: '#fff',
                padding: '0.5rem 0.9rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              <Send size={14} /> Inject
            </button>
          </form>
        </div>

        {injectStatus && (
          <div style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '6px',
            marginBottom: '0.75rem',
            fontSize: '0.8rem',
            background: injectStatus.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
            color: injectStatus.type === 'success' ? '#34D399' : '#F87171',
            border: `1px solid ${injectStatus.type === 'success' ? '#10B981' : '#EF4444'}`
          }}>
            {injectStatus.msg}
          </div>
        )}

        {/* Streaming Hex Console */}
        <div style={{
          background: '#030712',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          padding: '0.75rem',
          maxHeight: '190px',
          overflowY: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem'
        }}>
          {hexFrames.map((frame, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              padding: '0.3rem 0',
              borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
              color: i === 0 ? '#38BDF8' : 'var(--text-muted)'
            }}>
              <span style={{ color: 'var(--text-dim)', minWidth: '70px' }}>[{frame.time}]</span>
              <span style={{ color: '#FBBF24', fontWeight: 600, minWidth: '45px' }}>TC {frame.tc}</span>
              <span style={{ color: '#F8FAFC', letterSpacing: '0.08em', fontWeight: 500 }}>
                {frame.hex}
              </span>
              <span style={{ color: 'var(--text-dim)', marginLeft: 'auto', fontSize: '0.7rem' }}>
                {frame.desc}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Acceptance Dossier Modal */}
      {showCertModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#0B132B',
            border: '1px solid var(--airbus-cyan)',
            borderRadius: '16px',
            maxWidth: '650px',
            width: '100%',
            padding: '2rem',
            boxShadow: '0 20px 50px rgba(0, 32, 91, 0.6)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>
                  AIRBUS CUSTOMER ACCEPTANCE CERTIFICATE
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Digital Delivery Acceptance & Telemetry Verification Dossier
                </p>
              </div>
              <button
                onClick={() => setShowCertModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{
              background: 'rgba(5, 10, 21, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.25rem',
              fontSize: '0.85rem'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div>Aircraft MSN: <strong style={{ color: '#fff' }}>{aircraftInfo.msn}</strong></div>
                <div>Model: <strong style={{ color: '#fff' }}>{aircraftInfo.model}</strong></div>
                <div>24-bit ICAO: <strong style={{ color: '#fff' }}>{telemetry.icao}</strong></div>
                <div>Acceptance Score: <strong style={{ color: '#34D399' }}>{compliance.acceptance_score}%</strong></div>
              </div>
              <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                Compliance Verdict: <span style={{ color: '#38BDF8' }}>{compliance.verdict}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => setShowCertModal(false)}
                style={{
                  padding: '0.6rem 1.2rem',
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([JSON.stringify({ aircraft: aircraftInfo, telemetry, compliance }, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `Airbus_Delivery_MSN_${aircraftInfo.msn}_Acceptance_Report.json`;
                  a.click();
                }}
                style={{
                  padding: '0.6rem 1.2rem',
                  background: 'var(--airbus-cyan)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Download JSON Dossier
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
