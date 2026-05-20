import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, AlertTriangle, FileText, CheckCircle2, Download, Table, FileJson, Calendar, Clock } from 'lucide-react';
import axios from 'axios';

interface AnomalyAlert {
  id?: number;
  node_id: string;
  timestamp: string;
  metric: string;
  value: number;
  threshold: number;
  message: string;
}

export default function SystemLogs() {
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);
  const [allTelemetry, setAllTelemetry] = useState<any[]>([]);
  const [loadingTable, setLoadingTable] = useState(true);
  const [loadingData, setLoadingData] = useState(true);

  // Dynamic Report Builder Filter State
  const [filterNode, setFilterNode] = useState<string>('all');
  const [filterMetric, setFilterMetric] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('00:00');
  const [endTime, setEndTime] = useState<string>('23:59');

  // Logs Table Filters (Bottom section)
  const [logFilterNode, setLogFilterNode] = useState<string>('all');
  const [logFilterMetric, setLogFilterMetric] = useState<string>('all');

  // Export Loading indicators
  const [downloadingCsv, setDownloadingCsv] = useState<boolean>(false);
  const [downloadingJson, setDownloadingJson] = useState<boolean>(false);

  const fetchAlerts = async () => {
    setLoadingTable(true);
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/anomalies/?limit=100');
      setAlerts(response.data);
    } catch (err) {
      console.error('Gagal mengambil riwayat anomali:', err);
    } finally {
      setLoadingTable(false);
    }
  };

  const fetchTelemetry = async () => {
    setLoadingData(true);
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/telemetry/?limit=100000');
      setAllTelemetry(response.data);
    } catch (err) {
      console.error('Gagal mengambil data telemetri historis:', err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    // Default to last 7 days on mount to show preview instantly
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 7);
    
    setStartDate(lastWeek.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);

    fetchTelemetry();
    fetchAlerts();
  }, []);

  // REAL-TIME DYNAMIC FILTERING ENGINE FOR LIVE PREVIEW
  const filteredTelemetry = useMemo(() => {
    if (!startDate || !endDate || allTelemetry.length === 0) return [];

    const startDateTime = new Date(`${startDate}T${startTime}:00`);
    const endDateTime = new Date(`${endDate}T${endTime}:59`);

    return allTelemetry.filter((item: any) => {
      const itemDate = new Date(item.timestamp);
      
      // Timeframe check
      if (itemDate < startDateTime || itemDate > endDateTime) return false;
      
      // Node filter
      if (filterNode !== 'all' && item.node_id !== filterNode) return false;

      // Metric filter
      if (filterMetric !== 'all') {
        const val = item[filterMetric];
        if (val === null || val === undefined) return false;
      }

      return true;
    });
  }, [allTelemetry, filterNode, filterMetric, startDate, endDate, startTime, endTime]);

  // Bottom Warning Table Filters
  const filteredAlerts = alerts.filter(alert => {
    const matchNode = logFilterNode === 'all' || alert.node_id === logFilterNode;
    const matchMetric = logFilterMetric === 'all' || alert.metric.toLowerCase().includes(logFilterMetric.toLowerCase());
    return matchNode && matchMetric;
  });

  const getMetricBadgeColor = (metric: string) => {
    switch (metric.toLowerCase()) {
      case 'temperature':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'vibration':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'gas_level':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  };

  // Dynamic CSV Exporter
  const handleExportCSV = () => {
    if (filteredTelemetry.length === 0) {
      alert('Tidak ada data yang cocok dengan filter untuk diunduh.');
      return;
    }

    setDownloadingCsv(true);
    try {
      let csvContent = '\uFEFF'; // Excel BOM compatibility
      
      // Build columns dynamically depending on the selected metric filter
      if (filterMetric === 'all') {
        csvContent += 'No;Waktu Pembacaan;Node ID;Suhu (°C);Getaran (g);Arus (A);Tegangan (V);Kelembaban (%);Gas (ppm)\n';
        filteredTelemetry.forEach((item, idx) => {
          const timeStr = new Date(item.timestamp).toLocaleString('id-ID');
          const temp = item.temperature?.toFixed(2) ?? '-';
          const vib = item.vibration?.toFixed(2) ?? '-';
          const cur = item.current?.toFixed(2) ?? '-';
          const volt = item.voltage?.toFixed(2) ?? '-';
          const hum = item.humidity?.toFixed(2) ?? '-';
          const gas = item.gas_level?.toFixed(2) ?? '-';
          
          csvContent += `${idx + 1};${timeStr};${item.node_id};${temp};${vib};${cur};${volt};${hum};${gas}\n`;
        });
      } else {
        const metricNames: Record<string, string> = {
          temperature: 'Suhu (°C)',
          vibration: 'Getaran (g)',
          current: 'Arus (A)',
          voltage: 'Tegangan (V)',
          humidity: 'Kelembaban (%)',
          gas_level: 'Kadar Gas (ppm)',
        };
        
        const metricColName = metricNames[filterMetric] || filterMetric;
        csvContent += `No;Waktu Pembacaan;Node ID;${metricColName}\n`;
        
        filteredTelemetry.forEach((item, idx) => {
          const timeStr = new Date(item.timestamp).toLocaleString('id-ID');
          const val = item[filterMetric]?.toFixed(2) ?? '-';
          csvContent += `${idx + 1};${timeStr};${item.node_id};${val}\n`;
        });
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Laporan_Telemetri_${filterNode}_${filterMetric}_${startDate}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan saat mengekspor CSV.');
    } finally {
      setDownloadingCsv(false);
    }
  };

  // Dynamic JSON Exporter
  const handleExportJSON = () => {
    if (filteredTelemetry.length === 0) {
      alert('Tidak ada data yang cocok dengan filter untuk diunduh.');
      return;
    }

    setDownloadingJson(true);
    try {
      const jsonContent = JSON.stringify({
        generated_at: new Date().toISOString(),
        filters: {
          node: filterNode,
          metric: filterMetric,
          date_range: { start: startDate, end: endDate },
          time_range: { start: startTime, end: endTime }
        },
        records_count: filteredTelemetry.length,
        data: filteredTelemetry
      }, null, 2);

      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Laporan_Telemetri_${filterNode}_${filterMetric}_${startDate}.json`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan saat mengekspor JSON.');
    } finally {
      setDownloadingJson(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Title Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Buat Laporan</h2>
          <p className="text-sm text-slate-500 mt-1">Sistem Generator Laporan Telemetri Dinamis Terdistribusi.</p>
        </div>
        <button 
          onClick={fetchTelemetry}
          disabled={loadingData}
          className="flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingData ? 'animate-spin' : ''}`} />
          <span>Segarkan Sumber Data</span>
        </button>
      </div>

      {/* DYNAMIC REPORT BUILDER PANEL */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
          <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
            <Table className="h-4 w-4 text-dashboard-blue" />
            <span>Interactive Dynamic Report Builder</span>
          </h3>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT: FILTER CONFIGURATION (4/12 width) */}
          <div className="lg:col-span-5 space-y-5 border-b lg:border-b-0 lg:border-r border-slate-200 pb-6 lg:pb-0 lg:pr-8">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">1. Konfigurasi Filter Laporan</h4>
            
            {/* Node Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Pilih Node Sensor</label>
              <select 
                value={filterNode} 
                onChange={(e) => setFilterNode(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-dashboard-blue"
              >
                <option value="all">Semua Node (Node 1 & Node 2)</option>
                <option value="node_1">Node 1 (Mesin Pemotong)</option>
                <option value="node_2">Node 2 (Kondisi Lingkungan)</option>
              </select>
            </div>

            {/* Metric Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Metrik Utama</label>
              <select 
                value={filterMetric} 
                onChange={(e) => setFilterMetric(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-dashboard-blue"
              >
                <option value="all">Semua Metrik Sensor</option>
                <option value="temperature">Suhu (°C)</option>
                <option value="vibration">Getaran (g)</option>
                <option value="current">Arus (A)</option>
                <option value="voltage">Tegangan (V)</option>
                <option value="humidity">Kelembaban (%)</option>
                <option value="gas_level">Kadar Gas (ppm)</option>
              </select>
            </div>

            {/* Date Range Inputs */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span>Rentang Tanggal</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none"
                />
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none"
                />
              </div>
            </div>

            {/* Time Range Inputs */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                <span>Rentang Waktu / Jam</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <input 
                  type="time" 
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none"
                />
                <input 
                  type="time" 
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* RIGHT: LIVE PREVIEW & DOWNLOADS (8/12 width) */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">2. Pratinjau Real-Time Laporan</h4>
              
              {/* Match Counter Display */}
              {loadingData ? (
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <RefreshCw className="h-5 w-5 text-dashboard-blue animate-spin" />
                  <span className="text-xs text-slate-500 font-semibold">Menghitung jumlah data...</span>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-blue-50/50 border border-blue-200/60 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center font-bold text-sm text-dashboard-blue">
                      {filteredTelemetry.length}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">Data Teridentifikasi</p>
                      <p className="text-[10px] text-slate-500">Jumlah data yang memenuhi parameter filter saat ini.</p>
                    </div>
                  </div>
                  {filteredTelemetry.length > 0 && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                      SIAP EKSPOR
                    </span>
                  )}
                </div>
              )}

              {/* Data Preview Table */}
              <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pratinjau Data (Maks. 5 Baris Pertama)</span>
                  <span className="text-[10px] text-slate-400 font-mono">Real-time Preview</span>
                </div>
                
                {filteredTelemetry.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Tidak ada data yang cocok. Sesuaikan rentang tanggal atau filter metrik.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-[11px] divide-y divide-slate-200">
                      <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-2">Waktu</th>
                          <th className="px-4 py-2">Node</th>
                          {filterMetric === 'all' ? (
                            <>
                              <th className="px-4 py-2">Suhu (°C)</th>
                              <th className="px-4 py-2">Getaran (g)</th>
                              <th className="px-4 py-2">Gas (ppm)</th>
                            </>
                          ) : (
                            <th className="px-4 py-2">Metrik Terpilih</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {filteredTelemetry.slice(0, 5).map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 font-medium text-slate-600">
                            <td className="px-4 py-2 font-mono whitespace-nowrap">
                              {new Date(row.timestamp).toLocaleTimeString('id-ID')}
                            </td>
                            <td className="px-4 py-2 font-bold text-slate-700">{row.node_id}</td>
                            {filterMetric === 'all' ? (
                              <>
                                <td className="px-4 py-2">{row.temperature?.toFixed(1) ?? '-'}</td>
                                <td className="px-4 py-2">{row.vibration?.toFixed(2) ?? '-'}</td>
                                <td className="px-4 py-2">{row.gas_level?.toFixed(0) ?? '-'}</td>
                              </>
                            ) : (
                              <td className="px-4 py-2 font-bold text-dashboard-blue">
                                {row[filterMetric]?.toFixed(2) ?? '-'}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* DOWNLOAD TRIGGER ACTIONS */}
            <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-slate-100">
              <button 
                onClick={handleExportCSV}
                disabled={downloadingCsv || filteredTelemetry.length === 0}
                className="flex-1 min-w-[150px] flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
              >
                <Download className={`h-4 w-4 ${downloadingCsv ? 'animate-bounce' : ''}`} />
                <span>{downloadingCsv ? 'Mengekspor CSV...' : 'Unduh Laporan (CSV)'}</span>
              </button>

              <button 
                onClick={handleExportJSON}
                disabled={downloadingJson || filteredTelemetry.length === 0}
                className="flex-1 min-w-[150px] flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
              >
                <FileJson className={`h-4 w-4 ${downloadingJson ? 'animate-bounce' : ''}`} />
                <span>{downloadingJson ? 'Mengekspor JSON...' : 'Unduh Laporan (JSON)'}</span>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* LOWER HISTORICAL ANOMALY LOG TABLE */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Laporan Log Peringatan</h3>
            <p className="text-xs text-slate-500">Daftar historis deteksi anomali pada sensor IoT terdistribusi.</p>
          </div>

          <button 
            onClick={fetchAlerts}
            disabled={loadingTable}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-dashboard-blue hover:bg-dashboard-hover text-white text-xs font-bold rounded-lg shadow-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingTable ? 'animate-spin' : ''}`} />
            <span>Refresh Tabel</span>
          </button>
        </div>

        {/* Filter Options */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-center">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Filter Log Peringatan:</span>
          
          <select 
            value={logFilterNode} 
            onChange={(e) => setLogFilterNode(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-dashboard-blue"
          >
            <option value="all">Semua Node</option>
            <option value="node_1">Node 1 (Mesin)</option>
            <option value="node_2">Node 2 (Lingkungan)</option>
          </select>

          <select 
            value={logFilterMetric} 
            onChange={(e) => setLogFilterMetric(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-dashboard-blue"
          >
            <option value="all">Semua Metrik</option>
            <option value="temperature">Suhu</option>
            <option value="vibration">Getaran</option>
            <option value="current">Arus</option>
            <option value="humidity">Kelembaban</option>
            <option value="gas_level">Kadar Gas</option>
          </select>
        </div>

        {/* Main Table view */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loadingTable ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <RefreshCw className="h-10 w-10 text-dashboard-blue animate-spin mb-4" />
              <p className="text-sm font-medium">Memuat riwayat peringatan...</p>
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-4" />
              <h3 className="text-slate-800 font-bold text-base">Tidak Ada Peringatan</h3>
              <p className="text-xs text-slate-500 mt-1">Semua data sensor mematuhi ambang batas aman dalam filter ini.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs divide-y divide-slate-200">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4">Status / Node</th>
                    <th className="px-6 py-4">Waktu Terjadi</th>
                    <th className="px-6 py-4">Metrik Sensor</th>
                    <th className="px-6 py-4">Nilai Aktual</th>
                    <th className="px-6 py-4">Batas Aman</th>
                    <th className="px-6 py-4">Deskripsi / Detail Kesalahan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredAlerts.map((alert, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="p-1 rounded bg-red-100 text-red-600">
                            <AlertTriangle className="h-3.5 w-3.5" />
                          </span>
                          <span className="font-extrabold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                            {alert.node_id}
                          </span>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap text-slate-500 font-mono">
                        {new Date(alert.timestamp).toLocaleString('id-ID')}
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase ${getMetricBadgeColor(alert.metric)}`}>
                          {alert.metric}
                        </span>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap font-bold text-red-600">
                        {alert.value}
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-500">
                        {alert.threshold}
                      </td>
                      
                      <td className="px-6 py-4 text-slate-600 max-w-xs sm:max-w-md truncate md:whitespace-normal font-medium">
                        {alert.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
