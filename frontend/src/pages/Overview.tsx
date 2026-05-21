import React, { useState, useEffect, useRef } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine 
} from 'recharts';
import { 
  Thermometer, Activity, Zap, Droplets, Wind, RefreshCw, 
  Wifi, WifiOff, AlertTriangle, CheckCircle, Clock, Trash2
} from 'lucide-react';
import axios from 'axios';

// Interface matching the backend models
interface TelemetryPoint {
  node_id: string;
  timestamp: string;
  temperature?: number | null;
  vibration?: number | null;
  current?: number | null;
  voltage?: number | null;
  humidity?: number | null;
  gas_level?: number | null;
}

interface AnomalyLog {
  id?: number;
  node_id: string;
  timestamp: string;
  metric: string;
  value: number;
  threshold: number;
  message: string;
}

export default function Overview() {
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING'>('DISCONNECTED');
  
  // Latest values for metrics cards
  const [node1Latest, setNode1Latest] = useState<TelemetryPoint | null>(null);
  const [node2Latest, setNode2Latest] = useState<TelemetryPoint | null>(null);

  // History buffers (max 50 points, deduplicated, sorted)
  const [node1History, setNode1History] = useState<TelemetryPoint[]>([]);
  const [node2History, setNode2History] = useState<TelemetryPoint[]>([]);
  
  // Recent anomalies
  const [recentAnomalies, setRecentAnomalies] = useState<AnomalyLog[]>([]);
  
  // Threshold values from API — 6 metric sesuai arsitektur TA
  const [thresholds, setThresholds] = useState<{
    temp_machine: number;
    vibration: number;
    current: number;
    temp_room: number;
    humidity: number;
    gas_level: number;
  }>({
    temp_machine: 70.0,
    vibration: 1.5,
    current: 10.0,
    temp_room: 35.0,
    humidity: 80.0,
    gas_level: 300.0,
  });

  // Dynamic Chart Controls Configuration
  const [chart1PointsCount, setChart1PointsCount] = useState<number>(10);
  const [chart2PointsCount, setChart2PointsCount] = useState<number>(10);
  const [chart1Type, setChart1Type] = useState<'area' | 'line'>('area');
  const [chart2Type, setChart2Type] = useState<'area' | 'line'>('area');
  // Chart 1 Node 1: temperature (mesin), vibration, current
  const [chart1VisibleMetrics, setChart1VisibleMetrics] = useState<string[]>(['temperature', 'vibration', 'current']);
  // Chart 2 Node 2: temperature (ruangan), humidity, gas_level
  const [chart2VisibleMetrics, setChart2VisibleMetrics] = useState<string[]>(['temperature', 'humidity', 'gas_level']);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const isMounted = useRef<boolean>(true);

  // Throttling buffers to prevent high-frequency rendering lag
  const node1BufferRef = useRef<TelemetryPoint[]>([]);
  const node2BufferRef = useRef<TelemetryPoint[]>([]);
  const node1LatestRef = useRef<TelemetryPoint | null>(null);
  const node2LatestRef = useRef<TelemetryPoint | null>(null);
  const hasNewAnomaliesRef = useRef<boolean>(false);

  // Fetch Thresholds
  const fetchThresholds = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:8000/api/thresholds/');
      if (res.status === 200 && Array.isArray(res.data) && isMounted.current) {
        const tm = res.data.find((t: any) => t.metric === 'temp_machine')?.value ?? 70.0;
        const vib = res.data.find((t: any) => t.metric === 'vibration')?.value ?? 1.5;
        const cur = res.data.find((t: any) => t.metric === 'current')?.value ?? 10.0;
        const tr = res.data.find((t: any) => t.metric === 'temp_room')?.value ?? 35.0;
        const hum = res.data.find((t: any) => t.metric === 'humidity')?.value ?? 80.0;
        const gas = res.data.find((t: any) => t.metric === 'gas_level')?.value ?? 300.0;
        setThresholds({
          temp_machine: tm,
          vibration: vib,
          current: cur,
          temp_room: tr,
          humidity: hum,
          gas_level: gas
        });
      }
    } catch (err) {
      console.error('Error fetching thresholds for Overview:', err);
    }
  };

  // Prefetch data on load
  const prefetchData = async () => {
    try {
      // Fetch thresholds first
      await fetchThresholds();

      // 1. Fetch telemetry history
      const telemetryRes = await axios.get('http://127.0.0.1:8000/api/telemetry/?limit=100');
      if (telemetryRes.status === 200 && isMounted.current) {
        const rawData: TelemetryPoint[] = telemetryRes.data;
        
        // Parse and sort history points
        const n1Data = rawData
          .filter(d => d.node_id === 'node_1')
          .reverse(); // old to new
        const n2Data = rawData
          .filter(d => d.node_id === 'node_2')
          .reverse();

        // Process and deduplicate history, keeping last 50
        const n1Processed = deduplicateHistory(n1Data).slice(-50);
        const n2Processed = deduplicateHistory(n2Data).slice(-50);

        node1BufferRef.current = n1Processed;
        node2BufferRef.current = n2Processed;

        setNode1History(n1Processed);
        setNode2History(n2Processed);

        // Set latest stats
        const latest1 = rawData.find(d => d.node_id === 'node_1');
        const latest2 = rawData.find(d => d.node_id === 'node_2');
        if (latest1) {
          setNode1Latest(latest1);
          node1LatestRef.current = latest1;
        }
        if (latest2) {
          setNode2Latest(latest2);
          node2LatestRef.current = latest2;
        }
      }

      // 2. Fetch recent anomalies
      const anomaliesRes = await axios.get('http://127.0.0.1:8000/api/anomalies/?limit=5');
      if (anomaliesRes.status === 200 && isMounted.current) {
        setRecentAnomalies(anomaliesRes.data);
      }
    } catch (err) {
      console.error('Error prefetching dashboard data:', err);
    }
  };

  // Helper: Deduplicate data by HH:mm:ss timestamp to prevent duplicate render glitches
  const deduplicateHistory = (points: TelemetryPoint[]): TelemetryPoint[] => {
    const map = new Map<string, TelemetryPoint>();
    points.forEach(p => {
      const timeStr = formatTimestamp(p.timestamp);
      map.set(timeStr, p); // Overwrites duplicate seconds
    });
    return Array.from(map.values()).sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  };

  // Helper: Clean timestamp format (HH:mm:ss)
  const formatTimestamp = (isoString?: string): string => {
    if (!isoString) return '--:--:--';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('id-ID', { hour12: false });
    } catch {
      return '--:--:--';
    }
  };

  const getBackendHost = () => window.location.hostname || '127.0.0.1';
  const getWebSocketUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${getBackendHost()}:8000/ws/telemetry/`;
  };

  // Native WebSocket connection with auto-reconnect
  const connectWebSocket = () => {
    if (!isMounted.current) return;
    
    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.onclose = null; // Prevent triggering the onclose reconnect loop!
      wsRef.current.close();
    }

    setConnectionStatus('RECONNECTING');
    
    const wsUrl = getWebSocketUrl();
    console.log('Menghubungkan ke WebSocket:', wsUrl);
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMounted.current) return;
      console.log('Koneksi WebSocket Terbuka.');
      setConnectionStatus('CONNECTED');
    };

    ws.onmessage = (event) => {
      if (!isMounted.current) return;
      try {
        const message = JSON.parse(event.data);
        
        // Handle incoming real-time telemetry updates
        if (message.event === 'telemetry_update') {
          const wsPoint = message.data;
          
          // Map nested sensor structure to flat TelemetryPoint type to match REST API
          const flatPoint: TelemetryPoint = {
            node_id: wsPoint.node_id,
            timestamp: wsPoint.timestamp,
            temperature: wsPoint.sensor?.temperature !== undefined ? wsPoint.sensor.temperature : wsPoint.temperature,
            vibration: wsPoint.sensor?.vibration !== undefined ? wsPoint.sensor.vibration : wsPoint.vibration,
            current: wsPoint.sensor?.current !== undefined ? wsPoint.sensor.current : wsPoint.current,
            voltage: wsPoint.sensor?.voltage !== undefined ? wsPoint.sensor.voltage : wsPoint.voltage,
            humidity: wsPoint.sensor?.humidity !== undefined ? wsPoint.sensor.humidity : wsPoint.humidity,
            gas_level: wsPoint.sensor?.gas_level !== undefined ? wsPoint.sensor.gas_level : wsPoint.gas_level,
          };
          
          if (flatPoint.node_id === 'node_1') {
            node1LatestRef.current = flatPoint;
            node1BufferRef.current = deduplicateHistory([...node1BufferRef.current, flatPoint]).slice(-50);
          } else if (flatPoint.node_id === 'node_2') {
            node2LatestRef.current = flatPoint;
            node2BufferRef.current = deduplicateHistory([...node2BufferRef.current, flatPoint]).slice(-50);
          }

          // Flag that an anomaly fetch is needed on the next throttled interval tick
          hasNewAnomaliesRef.current = true;
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      if (!isMounted.current) return;
      console.log('Koneksi WebSocket terputus. Mencoba menghubungkan kembali...');
      setConnectionStatus('DISCONNECTED');
      
      // Attempt reconnect after 3 seconds
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connectWebSocket();
      }, 3000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
      ws.close();
    };
  };

  useEffect(() => {
    isMounted.current = true;
    
    // Initial fetch
    prefetchData();
    // Establish socket
    connectWebSocket();

    // High performance throttle interval to batch state updates (1Hz tick rate)
    const flushInterval = setInterval(() => {
      if (!isMounted.current) return;

      let hasUpdate = false;
      if (node1LatestRef.current) {
        setNode1Latest(node1LatestRef.current);
        setNode1History([...node1BufferRef.current]);
        node1LatestRef.current = null;
        hasUpdate = true;
      }
      if (node2LatestRef.current) {
        setNode2Latest(node2LatestRef.current);
        setNode2History([...node2BufferRef.current]);
        node2LatestRef.current = null;
        hasUpdate = true;
      }

      if (hasNewAnomaliesRef.current) {
        hasNewAnomaliesRef.current = false;
        axios.get('http://127.0.0.1:8000/api/anomalies/?limit=5')
          .then(res => {
            if (isMounted.current) setRecentAnomalies(res.data);
          })
          .catch(console.error);
      }
    }, 1000);

    return () => {
      isMounted.current = false;
      clearInterval(flushInterval);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent triggering the onclose reconnect loop!
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  // Clear anomaly alert logs
  const clearAnomalies = () => {
    setRecentAnomalies([]);
  };

  // Status pills
  const statusColor = {
    CONNECTED: 'bg-emerald-500 text-white',
    DISCONNECTED: 'bg-rose-500 text-white',
    RECONNECTING: 'bg-amber-500 text-white animate-pulse'
  };

  return (
    <div className="space-y-6">
      {/* Upper Panel: Title & WebSocket Control */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Smart Factory Dashboard</h2>
          <p className="text-xs text-slate-500">Pemantauan mesin dan sensor lingkungan real-time terdistribusi.</p>
        </div>

        <div className="flex items-center gap-3">
          {/* WebSocket Status Pill */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Status WebSocket:</span>
            <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${statusColor[connectionStatus]}`}>
              {connectionStatus === 'CONNECTED' ? (
                <>
                  <Wifi className="h-3.5 w-3.5" />
                  <span>CONNECTED</span>
                </>
              ) : connectionStatus === 'RECONNECTING' ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>RECONNECTING</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5" />
                  <span>DISCONNECTED</span>
                </>
              )}
            </span>
          </div>

          <button 
            onClick={prefetchData}
            className="p-2 text-slate-500 hover:text-dashboard-blue border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
            title="Sinkronisasi Data"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 1. REALTIME METRICS GRID - 6 REUSABLE SENSOR CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Node 1: Machine Temperature */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-dashboard-blue" />
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Node 1 (Mesin)</span>
            <Thermometer className="h-5 w-5 text-dashboard-blue" />
          </div>
          <h3 className="text-slate-500 text-sm font-medium mt-2">Suhu Mesin</h3>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-3xl font-extrabold text-slate-800">
              {node1Latest?.temperature?.toFixed(1) ?? '--.-'}
            </span>
            <span className="text-sm font-semibold text-slate-500">°C</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-4">
            <Clock className="h-3 w-3" />
            <span>Terakhir: {formatTimestamp(node1Latest?.timestamp)}</span>
          </div>
        </div>

        {/* Node 1: Machine Vibration */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500" />
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Node 1 (Mesin)</span>
            <Activity className="h-5 w-5 text-indigo-500" />
          </div>
          <h3 className="text-slate-500 text-sm font-medium mt-2">Getaran Mesin</h3>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-3xl font-extrabold text-slate-800">
              {node1Latest?.vibration?.toFixed(2) ?? '-.--'}
            </span>
            <span className="text-sm font-semibold text-slate-500">g</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-4">
            <Clock className="h-3 w-3" />
            <span>Terakhir: {formatTimestamp(node1Latest?.timestamp)}</span>
          </div>
        </div>

        {/* Node 1: Current Consumption */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Node 1 (Mesin)</span>
            <Zap className="h-5 w-5 text-amber-500" />
          </div>
          <h3 className="text-slate-500 text-sm font-medium mt-2">Arus Listrik</h3>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-3xl font-extrabold text-slate-800">
              {node1Latest?.current?.toFixed(2) ?? '-.--'}
            </span>
            <span className="text-sm font-semibold text-slate-500">A</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-4">
            <Clock className="h-3 w-3" />
            <span>Terakhir: {formatTimestamp(node1Latest?.timestamp)}</span>
          </div>
        </div>

        {/* Node 2: Environment Temperature */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-teal-500" />
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Node 2 (Ruang)</span>
            <Wind className="h-5 w-5 text-teal-500" />
          </div>
          <h3 className="text-slate-500 text-sm font-medium mt-2">Suhu Lingkungan</h3>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-3xl font-extrabold text-slate-800">
              {node2Latest?.temperature?.toFixed(1) ?? '--.-'}
            </span>
            <span className="text-sm font-semibold text-slate-500">°C</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-4">
            <Clock className="h-3 w-3" />
            <span>Terakhir: {formatTimestamp(node2Latest?.timestamp)}</span>
          </div>
        </div>

        {/* Node 2: Environment Humidity */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Node 2 (Ruang)</span>
            <Droplets className="h-5 w-5 text-emerald-500" />
          </div>
          <h3 className="text-slate-500 text-sm font-medium mt-2">Kelembaban Udara</h3>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-3xl font-extrabold text-slate-800">
              {node2Latest?.humidity?.toFixed(1) ?? '--.-'}
            </span>
            <span className="text-sm font-semibold text-slate-500">%</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-4">
            <Clock className="h-3 w-3" />
            <span>Terakhir: {formatTimestamp(node2Latest?.timestamp)}</span>
          </div>
        </div>

        {/* Node 2: Gas Sensor (MQ-2) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500" />
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Node 2 (Ruang)</span>
            <AlertTriangle className="h-5 w-5 text-rose-500" />
          </div>
          <h3 className="text-slate-500 text-sm font-medium mt-2">Kadar Gas Sensor</h3>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-3xl font-extrabold text-slate-800">
              {node2Latest?.gas_level?.toFixed(0) ?? '----'}
            </span>
            <span className="text-sm font-semibold text-slate-500">ppm</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-4">
            <Clock className="h-3 w-3" />
            <span>Terakhir: {formatTimestamp(node2Latest?.timestamp)}</span>
          </div>
        </div>

      </div>

      {/* 2. REALTIME CHARTS SECTION - SIDE-BY-SIDE INTEGRATION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Node 1 - Realtime Machine Chart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Node 1: Telemetry Mesin</h3>
              <p className="text-xs text-slate-400">Suhu mesin (°C), getaran (g)</p>
              <p className="text-xs text-slate-400"> dan arus listrik (A) dari ESP32 #1.</p>
            </div>
            
            {/* Control Bar for Chart 1 */}
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
              {/* Metric Toggles */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  onClick={() => 
                    setChart1VisibleMetrics(prev => 
                      prev.includes('temperature') 
                        ? prev.filter(m => m !== 'temperature') 
                        : [...prev, 'temperature']
                    )
                  }
                  className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all cursor-pointer ${
                    chart1VisibleMetrics.includes('temperature') 
                      ? 'bg-dashboard-blue text-white shadow-xs' 
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Suhu
                </button>
                <button
                  onClick={() => 
                    setChart1VisibleMetrics(prev => 
                      prev.includes('vibration') 
                        ? prev.filter(m => m !== 'vibration') 
                        : [...prev, 'vibration']
                    )
                  }
                  className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all cursor-pointer ${
                    chart1VisibleMetrics.includes('vibration') 
                      ? 'bg-indigo-600 text-white shadow-xs' 
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Getaran
                </button>
                <button
                  onClick={() => 
                    setChart1VisibleMetrics(prev => 
                      prev.includes('current') 
                        ? prev.filter(m => m !== 'current') 
                        : [...prev, 'current']
                    )
                  }
                  className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all cursor-pointer ${
                    chart1VisibleMetrics.includes('current') 
                      ? 'bg-amber-500 text-white shadow-xs' 
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Arus
                </button>
              </div>

              {/* Time Window Dropdown */}
              <select
                value={chart1PointsCount}
                onChange={(e) => setChart1PointsCount(Number(e.target.value))}
                className="px-2 py-1 bg-slate-50 text-[10px] font-bold text-slate-600 border border-slate-200 rounded-lg outline-none cursor-pointer focus:ring-1 focus:ring-dashboard-blue focus:border-dashboard-blue"
              >
                <option value={10}>10 Data</option>
                <option value={20}>20 Data</option>
                <option value={30}>30 Data</option>
                <option value={50}>50 Data</option>
              </select>

              {/* Chart Type Switcher */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  onClick={() => setChart1Type('area')}
                  className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all cursor-pointer ${
                    chart1Type === 'area' 
                      ? 'bg-white text-slate-800 shadow-xs' 
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Area
                </button>
                <button
                  onClick={() => setChart1Type('line')}
                  className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all cursor-pointer ${
                    chart1Type === 'line' 
                      ? 'bg-white text-slate-800 shadow-xs' 
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Line
                </button>
              </div>
            </div>
          </div>
          
          <div className="h-64 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              {chart1Type === 'area' ? (
                <AreaChart data={node1History.slice(-chart1PointsCount)} margin={{ top: 10, right: 10, left: -25, bottom: 20 }}>
                  <defs>
                    <linearGradient id="colorTemp1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0984e3" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#0984e3" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorVib1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorCur1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={formatTimestamp} 
                    tick={{ fontSize: 9, fill: '#94a3b8' }}
                    dx={-8}
                    dy={8}
                    angle={-30}
                    textAnchor="end"
                    height={45}
                  />
                  <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} />
                  <Tooltip 
                    labelFormatter={(lbl, items) => {
                      const item = items[0]?.payload as TelemetryPoint;
                      return item ? `Waktu: ${new Date(item.timestamp).toLocaleString('id-ID')}` : '';
                    }}
                    formatter={(val, name) => [
                      val,
                      name === 'temperature' ? 'Suhu Mesin (°C)' :
                      name === 'vibration'   ? 'Getaran Mesin (g)' : 'Arus Listrik (A)'
                    ]}
                  />
                  {chart1VisibleMetrics.includes('temperature') && (
                    <Area 
                      type="monotone" 
                      dataKey="temperature" 
                      stroke="#0984e3" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorTemp1)" 
                      name="temperature"
                      isAnimationActive={false}
                    />
                  )}
                  {chart1VisibleMetrics.includes('vibration') && (
                    <Area 
                      type="monotone" 
                      dataKey="vibration" 
                      stroke="#6366f1" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorVib1)" 
                      name="vibration"
                      isAnimationActive={false}
                    />
                  )}
                  {chart1VisibleMetrics.includes('current') && (
                    <Area 
                      type="monotone" 
                      dataKey="current" 
                      stroke="#f59e0b" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorCur1)" 
                      name="current"
                      isAnimationActive={false}
                    />
                  )}
                  {chart1VisibleMetrics.includes('temperature') && (
                    <ReferenceLine 
                      y={thresholds.temp_machine} 
                      stroke="#ef4444" 
                      strokeDasharray="4 4" 
                      label={{ 
                        value: `Limit Suhu: ${thresholds.temp_machine}°C`, 
                        fill: '#ef4444', 
                        fontSize: 9, 
                        position: 'top',
                        fontWeight: 'bold'
                      }} 
                    />
                  )}
                  {chart1VisibleMetrics.includes('vibration') && (
                    <ReferenceLine 
                      y={thresholds.vibration} 
                      stroke="#6366f1" 
                      strokeDasharray="4 4" 
                      label={{ 
                        value: `Limit Getar: ${thresholds.vibration}g`, 
                        fill: '#6366f1', 
                        fontSize: 9, 
                        position: 'top',
                        fontWeight: 'bold'
                      }} 
                    />
                  )}
                  {chart1VisibleMetrics.includes('current') && (
                    <ReferenceLine 
                      y={thresholds.current} 
                      stroke="#f59e0b" 
                      strokeDasharray="4 4" 
                      label={{ 
                        value: `Limit Arus: ${thresholds.current}A`, 
                        fill: '#f59e0b', 
                        fontSize: 9, 
                        position: 'top',
                        fontWeight: 'bold'
                      }} 
                    />
                  )}
                </AreaChart>
              ) : (
                <LineChart data={node1History.slice(-chart1PointsCount)} margin={{ top: 10, right: 10, left: -25, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={formatTimestamp} 
                    tick={{ fontSize: 9, fill: '#94a3b8' }}
                    dx={-8}
                    dy={8}
                    angle={-30}
                    textAnchor="end"
                    height={45}
                  />
                  <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} />
                  <Tooltip 
                    labelFormatter={(lbl, items) => {
                      const item = items[0]?.payload as TelemetryPoint;
                      return item ? `Waktu: ${new Date(item.timestamp).toLocaleString('id-ID')}` : '';
                    }}
                    formatter={(val, name) => [
                      val,
                      name === 'temperature' ? 'Suhu Mesin (°C)' :
                      name === 'vibration'   ? 'Getaran Mesin (g)' : 'Arus Listrik (A)'
                    ]}
                  />
                  {chart1VisibleMetrics.includes('temperature') && (
                    <Line 
                      type="monotone" 
                      dataKey="temperature" 
                      stroke="#0984e3" 
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      activeDot={{ r: 4 }}
                      name="temperature"
                      isAnimationActive={false}
                    />
                  )}
                  {chart1VisibleMetrics.includes('vibration') && (
                    <Line 
                      type="monotone" 
                      dataKey="vibration" 
                      stroke="#6366f1" 
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      activeDot={{ r: 4 }}
                      name="vibration"
                      isAnimationActive={false}
                    />
                  )}
                  {chart1VisibleMetrics.includes('current') && (
                    <Line 
                      type="monotone" 
                      dataKey="current" 
                      stroke="#f59e0b" 
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      activeDot={{ r: 4 }}
                      name="current"
                      isAnimationActive={false}
                    />
                  )}
                  {chart1VisibleMetrics.includes('temperature') && (
                    <ReferenceLine 
                      y={thresholds.temp_machine} 
                      stroke="#ef4444" 
                      strokeDasharray="4 4" 
                      label={{ 
                        value: `Limit Suhu: ${thresholds.temp_machine}°C`, 
                        fill: '#ef4444', 
                        fontSize: 9, 
                        position: 'top',
                        fontWeight: 'bold'
                      }} 
                    />
                  )}
                  {chart1VisibleMetrics.includes('vibration') && (
                    <ReferenceLine 
                      y={thresholds.vibration} 
                      stroke="#6366f1" 
                      strokeDasharray="4 4" 
                      label={{ 
                        value: `Limit Getar: ${thresholds.vibration}g`, 
                        fill: '#6366f1', 
                        fontSize: 9, 
                        position: 'top',
                        fontWeight: 'bold'
                      }} 
                    />
                  )}
                  {chart1VisibleMetrics.includes('current') && (
                    <ReferenceLine 
                      y={thresholds.current} 
                      stroke="#f59e0b" 
                      strokeDasharray="4 4" 
                      label={{ 
                        value: `Limit Arus: ${thresholds.current}A`, 
                        fill: '#f59e0b', 
                        fontSize: 9, 
                        position: 'top',
                        fontWeight: 'bold'
                      }} 
                    />
                  )}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Node 2 - Realtime Environment Chart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Node 2: Telemetry Lingkungan</h3>
              <p className="text-xs text-slate-400">Suhu ruangan (°C), kelembaban (%)</p>
              <p className="text-xs text-slate-400"> dan kadar gas (ppm) dari ESP32 #2.</p>
            </div>
            
            {/* Control Bar for Chart 2 */}
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
              {/* Metric Toggles */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  onClick={() => 
                    setChart2VisibleMetrics(prev => 
                      prev.includes('temperature') 
                        ? prev.filter(m => m !== 'temperature') 
                        : [...prev, 'temperature']
                    )
                  }
                  className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all cursor-pointer ${
                    chart2VisibleMetrics.includes('temperature') 
                      ? 'bg-teal-600 text-white shadow-xs' 
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Suhu
                </button>
                <button
                  onClick={() => 
                    setChart2VisibleMetrics(prev => 
                      prev.includes('humidity') 
                        ? prev.filter(m => m !== 'humidity') 
                        : [...prev, 'humidity']
                    )
                  }
                  className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all cursor-pointer ${
                    chart2VisibleMetrics.includes('humidity') 
                      ? 'bg-emerald-600 text-white shadow-xs' 
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Kelembaban
                </button>
                <button
                  onClick={() => 
                    setChart2VisibleMetrics(prev => 
                      prev.includes('gas_level') 
                        ? prev.filter(m => m !== 'gas_level') 
                        : [...prev, 'gas_level']
                    )
                  }
                  className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all cursor-pointer ${
                    chart2VisibleMetrics.includes('gas_level') 
                      ? 'bg-rose-600 text-white shadow-xs' 
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Kadar Gas
                </button>
              </div>

              {/* Time Window Dropdown */}
              <select
                value={chart2PointsCount}
                onChange={(e) => setChart2PointsCount(Number(e.target.value))}
                className="px-2 py-1 bg-slate-50 text-[10px] font-bold text-slate-600 border border-slate-200 rounded-lg outline-none cursor-pointer focus:ring-1 focus:ring-dashboard-blue focus:border-dashboard-blue"
              >
                <option value={10}>10 Data</option>
                <option value={20}>20 Data</option>
                <option value={30}>30 Data</option>
                <option value={50}>50 Data</option>
              </select>

              {/* Chart Type Switcher */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  onClick={() => setChart2Type('area')}
                  className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all cursor-pointer ${
                    chart2Type === 'area' 
                      ? 'bg-white text-slate-800 shadow-xs' 
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Area
                </button>
                <button
                  onClick={() => setChart2Type('line')}
                  className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all cursor-pointer ${
                    chart2Type === 'line' 
                      ? 'bg-white text-slate-800 shadow-xs' 
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Line
                </button>
              </div>
            </div>
          </div>
          
          <div className="h-64 w-full mt-2">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              {chart2Type === 'area' ? (
                <AreaChart data={node2History.slice(-chart2PointsCount)} margin={{ top: 10, right: 10, left: -25, bottom: 20 }}>
                  <defs>
                    <linearGradient id="colorTempRoom2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorHumid2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorGas2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={formatTimestamp} 
                    tick={{ fontSize: 9, fill: '#94a3b8' }}
                    dx={-8}
                    dy={8}
                    angle={-30}
                    textAnchor="end"
                    height={45}
                  />
                  <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} />
                  <Tooltip 
                    labelFormatter={(lbl, items) => {
                      const item = items[0]?.payload as TelemetryPoint;
                      return item ? `Waktu: ${new Date(item.timestamp).toLocaleString('id-ID')}` : '';
                    }}
                    formatter={(val, name) => [
                      val,
                      name === 'temperature' ? 'Suhu Ruangan (°C)' :
                      name === 'humidity'    ? 'Kelembaban (%)' : 'Kadar Gas (ppm)'
                    ]}
                  />
                  {chart2VisibleMetrics.includes('temperature') && (
                    <Area 
                      type="monotone" 
                      dataKey="temperature" 
                      stroke="#14b8a6" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorTempRoom2)" 
                      name="temperature"
                      isAnimationActive={false}
                    />
                  )}
                  {chart2VisibleMetrics.includes('humidity') && (
                    <Area 
                      type="monotone" 
                      dataKey="humidity" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorHumid2)" 
                      name="humidity"
                      isAnimationActive={false}
                    />
                  )}
                  {chart2VisibleMetrics.includes('gas_level') && (
                    <Area 
                      type="monotone" 
                      dataKey="gas_level" 
                      stroke="#f43f5e" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorGas2)" 
                      name="gas_level"
                      isAnimationActive={false}
                    />
                  )}
                  {chart2VisibleMetrics.includes('temperature') && (
                    <ReferenceLine 
                      y={thresholds.temp_room} 
                      stroke="#14b8a6" 
                      strokeDasharray="4 4" 
                      label={{ 
                        value: `Limit Suhu: ${thresholds.temp_room}°C`, 
                        fill: '#14b8a6', 
                        fontSize: 9, 
                        position: 'top',
                        fontWeight: 'bold'
                      }} 
                    />
                  )}
                  {chart2VisibleMetrics.includes('humidity') && (
                    <ReferenceLine 
                      y={thresholds.humidity} 
                      stroke="#10b981" 
                      strokeDasharray="4 4" 
                      label={{ 
                        value: `Limit Lembab: ${thresholds.humidity}%`, 
                        fill: '#10b981', 
                        fontSize: 9, 
                        position: 'top',
                        fontWeight: 'bold'
                      }} 
                    />
                  )}
                  {chart2VisibleMetrics.includes('gas_level') && (
                    <ReferenceLine 
                      y={thresholds.gas_level} 
                      stroke="#ef4444" 
                      strokeDasharray="4 4" 
                      label={{ 
                        value: `Limit Gas: ${thresholds.gas_level} ppm`, 
                        fill: '#ef4444', 
                        fontSize: 9, 
                        position: 'top',
                        fontWeight: 'bold'
                      }} 
                    />
                  )}
                </AreaChart>
              ) : (
                <LineChart data={node2History.slice(-chart2PointsCount)} margin={{ top: 10, right: 10, left: -25, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={formatTimestamp} 
                    tick={{ fontSize: 9, fill: '#94a3b8' }}
                    dx={-8}
                    dy={8}
                    angle={-30}
                    textAnchor="end"
                    height={45}
                  />
                  <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} />
                  <Tooltip 
                    labelFormatter={(lbl, items) => {
                      const item = items[0]?.payload as TelemetryPoint;
                      return item ? `Waktu: ${new Date(item.timestamp).toLocaleString('id-ID')}` : '';
                    }}
                    formatter={(val, name) => [
                      val,
                      name === 'temperature' ? 'Suhu Ruangan (°C)' :
                      name === 'humidity'    ? 'Kelembaban (%)' : 'Kadar Gas (ppm)'
                    ]}
                  />
                  {chart2VisibleMetrics.includes('temperature') && (
                    <Line 
                      type="monotone" 
                      dataKey="temperature" 
                      stroke="#14b8a6" 
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      activeDot={{ r: 4 }}
                      name="temperature"
                      isAnimationActive={false}
                    />
                  )}
                  {chart2VisibleMetrics.includes('humidity') && (
                    <Line 
                      type="monotone" 
                      dataKey="humidity" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      activeDot={{ r: 4 }}
                      name="humidity"
                      isAnimationActive={false}
                    />
                  )}
                  {chart2VisibleMetrics.includes('gas_level') && (
                    <Line 
                      type="monotone" 
                      dataKey="gas_level" 
                      stroke="#f43f5e" 
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      activeDot={{ r: 4 }}
                      name="gas_level"
                      isAnimationActive={false}
                    />
                  )}
                  {chart2VisibleMetrics.includes('temperature') && (
                    <ReferenceLine 
                      y={thresholds.temp_room} 
                      stroke="#14b8a6" 
                      strokeDasharray="4 4" 
                      label={{ 
                        value: `Limit Suhu: ${thresholds.temp_room}°C`, 
                        fill: '#14b8a6', 
                        fontSize: 9, 
                        position: 'top',
                        fontWeight: 'bold'
                      }} 
                    />
                  )}
                  {chart2VisibleMetrics.includes('humidity') && (
                    <ReferenceLine 
                      y={thresholds.humidity} 
                      stroke="#10b981" 
                      strokeDasharray="4 4" 
                      label={{ 
                        value: `Limit Lembab: ${thresholds.humidity}%`, 
                        fill: '#10b981', 
                        fontSize: 9, 
                        position: 'top',
                        fontWeight: 'bold'
                      }} 
                    />
                  )}
                  {chart2VisibleMetrics.includes('gas_level') && (
                    <ReferenceLine 
                      y={thresholds.gas_level} 
                      stroke="#ef4444" 
                      strokeDasharray="4 4" 
                      label={{ 
                        value: `Limit Gas: ${thresholds.gas_level} ppm`, 
                        fill: '#ef4444', 
                        fontSize: 9, 
                        position: 'top',
                        fontWeight: 'bold'
                      }} 
                    />
                  )}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* 3. ALERTS PANEL & LIVE DATA TABLES */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Warning Center / Anomaly Alert Logs */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col h-full xl:col-span-1">
          <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Warning Center</h3>
              <p className="text-[11px] text-slate-400">Deteksi anomali ambang batas sensor.</p>
            </div>
            {recentAnomalies.length > 0 && (
              <button 
                onClick={clearAnomalies}
                className="text-[10px] flex items-center gap-1 text-slate-400 hover:text-rose-500 font-semibold"
              >
                <Trash2 className="h-3 w-3" />
                <span>Reset</span>
              </button>
            )}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto max-h-72">
            {recentAnomalies.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-10 text-slate-400">
                <CheckCircle className="h-8 w-8 text-emerald-500 mb-2" />
                <p className="text-xs font-medium text-slate-600">Sistem Berjalan Aman</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Belum ada sensor yang melanggar batas.</p>
              </div>
            ) : (
              recentAnomalies.map((anomaly, idx) => (
                <div key={idx} className="p-3 bg-red-50 border border-red-150 rounded-lg flex gap-3 relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />
                  <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                        {anomaly.node_id}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {formatTimestamp(anomaly.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-700 mt-1">{anomaly.message}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Nilai: <strong className="text-red-600">{anomaly.value}</strong> vs Batas: <strong>{anomaly.threshold}</strong>
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Live Data Tables (Node 1 & Node 2 side by side) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm xl:col-span-2 flex flex-col">
          <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Aliran Log Real-Time (Terakhir 8 Data)</h3>
              <p className="text-xs text-slate-400">Tabel log telemetri sensor terdistribusi bebas duplikasi data.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Table Node 1 */}
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Log Mesin (Node 1)</h4>
              <div className="overflow-x-auto border border-slate-100 rounded-lg">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-55 font-bold text-slate-600 border-b border-slate-100">
                    <tr>
                      <th className="p-2">Waktu</th>
                      <th className="p-2">Suhu</th>
                      <th className="p-2">Getar</th>
                      <th className="p-2">Arus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {node1History.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-slate-400 text-[11px]">Belum ada log masuk</td>
                      </tr>
                    ) : (
                      [...node1History].reverse().slice(0, 8).map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-2 font-mono text-[10px] text-slate-500">{formatTimestamp(item.timestamp)}</td>
                          <td className="p-2 font-semibold text-slate-700">{item.temperature?.toFixed(1)}°C</td>
                          <td className="p-2 text-slate-600">{item.vibration?.toFixed(2)}g</td>
                          <td className="p-2 text-slate-600">{item.current?.toFixed(2)}A</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table Node 2 */}
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Log Lingkungan (Node 2)</h4>
              <div className="overflow-x-auto border border-slate-100 rounded-lg">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-55 font-bold text-slate-600 border-b border-slate-100">
                    <tr>
                      <th className="p-2">Waktu</th>
                      <th className="p-2">Suhu</th>
                      <th className="p-2">Kelembaban</th>
                      <th className="p-2">Gas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {node2History.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-slate-400 text-[11px]">Belum ada log masuk</td>
                      </tr>
                    ) : (
                      [...node2History].reverse().slice(0, 8).map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-2 font-mono text-[10px] text-slate-500">{formatTimestamp(item.timestamp)}</td>
                          <td className="p-2 font-semibold text-slate-700">{item.temperature?.toFixed(1)}°C</td>
                          <td className="p-2 text-slate-600">{item.humidity?.toFixed(1)}%</td>
                          <td className="p-2 text-rose-600 font-semibold">{item.gas_level?.toFixed(0)} ppm</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}
