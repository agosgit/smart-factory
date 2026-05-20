import React, { useState, useEffect } from 'react';
import { 
  Sliders, Thermometer, Activity, AlertTriangle, Save, 
  RotateCcw, CheckCircle2, AlertCircle, RefreshCw, HelpCircle, ShieldAlert,
  Zap, Droplets, Wind
} from 'lucide-react';
import axios from 'axios';

interface ThresholdSetting {
  metric: string;
  value: number;
  label: string;
  unit: string;
  description: string;
  updated_at?: string;
}

export default function Settings() {
  const [thresholds, setThresholds] = useState<ThresholdSetting[]>([]);
  const [originalThresholds, setOriginalThresholds] = useState<ThresholdSetting[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');

  // Fetch thresholds from REST API on mount
  const fetchThresholds = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/thresholds/');
      if (Array.isArray(response.data)) {
        setThresholds(response.data);
        // Deep copy for unsaved changes detection
        setOriginalThresholds(JSON.parse(JSON.stringify(response.data)));
      } else {
        throw new Error('Format data tidak sesuai');
      }
    } catch (err: any) {
      console.error('Gagal memuat ambang batas:', err);
      setError('Gagal memuat konfigurasi ambang batas dari server. Pastikan backend Django aktif.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThresholds();
  }, []);

  // Update a specific threshold value
  const handleValueChange = (metric: string, newValue: number) => {
    setThresholds(prev => prev.map(item => {
      if (item.metric === metric) {
        return { ...item, value: newValue };
      }
      return item;
    }));
  };

  // Bulk save thresholds back to REST API
  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const payload = thresholds.map(item => ({
        metric: item.metric,
        value: item.value
      }));
      
      const response = await axios.post('http://127.0.0.1:8000/api/thresholds/', payload);
      
      if (response.data.success) {
        setOriginalThresholds(JSON.parse(JSON.stringify(thresholds)));
        setToastMessage('Semua batas ambang berhasil disimpan secara permanen!');
        setShowToast(true);
        setTimeout(() => setShowToast(false), 4000);
      } else {
        alert('Gagal memperbarui ambang batas.');
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan saat menyimpan data ke backend.');
    } finally {
      setSaving(false);
    }
  };

  // Reset to default factory settings
  const handleResetToDefaults = () => {
    const factoryDefaults: Record<string, number> = {
      temp_machine: 70.0,
      vibration: 1.5,
      current: 10.0,
      temp_room: 35.0,
      humidity: 80.0,
      gas_level: 300.0
    };

    setThresholds(prev => prev.map(item => {
      const defVal = factoryDefaults[item.metric];
      if (defVal !== undefined) {
        return { ...item, value: defVal };
      }
      return item;
    }));

    setToastMessage('Dikembalikan ke nilai standard pabrik. Jangan lupa klik Simpan.');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  };

  // Check if any changes have been made compared to original loaded state
  const hasChanges = JSON.stringify(thresholds) !== JSON.stringify(originalThresholds);

  // Helper: map metric to icon and colors
  const getMetricStyling = (metric: string) => {
    switch (metric) {
      case 'temp_machine':
        return {
          icon: <Thermometer className="h-6 w-6 text-blue-500" />,
          bgColor: 'bg-blue-50/50',
          borderColor: 'border-blue-200',
          accentColor: 'accent-blue-500',
          sliderMin: 20,
          sliderMax: 120,
          sliderStep: 0.5
        };
      case 'vibration':
        return {
          icon: <Activity className="h-6 w-6 text-indigo-500" />,
          bgColor: 'bg-indigo-50/50',
          borderColor: 'border-indigo-200',
          accentColor: 'accent-indigo-500',
          sliderMin: 0.1,
          sliderMax: 5.0,
          sliderStep: 0.05
        };
      case 'current':
        return {
          icon: <Zap className="h-6 w-6 text-amber-500" />,
          bgColor: 'bg-amber-50/50',
          borderColor: 'border-amber-200',
          accentColor: 'accent-amber-500',
          sliderMin: 0.5,
          sliderMax: 30.0,
          sliderStep: 0.5
        };
      case 'temp_room':
        return {
          icon: <Wind className="h-6 w-6 text-teal-500" />,
          bgColor: 'bg-teal-50/50',
          borderColor: 'border-teal-200',
          accentColor: 'accent-teal-500',
          sliderMin: 20,
          sliderMax: 60,
          sliderStep: 0.5
        };
      case 'humidity':
        return {
          icon: <Droplets className="h-6 w-6 text-emerald-500" />,
          bgColor: 'bg-emerald-50/50',
          borderColor: 'border-emerald-200',
          accentColor: 'accent-emerald-500',
          sliderMin: 20,
          sliderMax: 100,
          sliderStep: 1
        };
      case 'gas_level':
        return {
          icon: <AlertTriangle className="h-6 w-6 text-rose-500" />,
          bgColor: 'bg-rose-50/50',
          borderColor: 'border-rose-200',
          accentColor: 'accent-rose-500',
          sliderMin: 50,
          sliderMax: 1000,
          sliderStep: 10
        };
      default:
        return {
          icon: <Sliders className="h-6 w-6 text-slate-500" />,
          bgColor: 'bg-slate-50/50',
          borderColor: 'border-slate-200',
          accentColor: 'accent-slate-500',
          sliderMin: 0,
          sliderMax: 100,
          sliderStep: 1
        };
    }
  };

  return (
    <div className="space-y-8">
      {/* Title Header Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Pengaturan Ambang Batas</h2>
          <p className="text-sm text-slate-500 mt-1">Konfigurasi batas anomali sensor untuk deteksi siaga real-time di seluruh area pabrik.</p>
        </div>
        <button 
          onClick={fetchThresholds}
          disabled={loading || saving}
          className="flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Segarkan Data</span>
        </button>
      </div>

      {/* Main Container */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-20 flex flex-col items-center justify-center text-slate-400">
          <RefreshCw className="h-10 w-10 text-dashboard-blue animate-spin mb-4" />
          <p className="text-sm font-medium">Memuat konfigurasi sensor...</p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 flex flex-col items-center justify-center text-center">
          <AlertCircle className="h-16 w-16 text-rose-500 mb-4" />
          <h3 className="text-lg font-bold text-slate-800">Koneksi Backend Terputus</h3>
          <p className="text-sm text-slate-500 max-w-md mt-2">{error}</p>
          <button 
            onClick={fetchThresholds}
            className="mt-6 px-5 py-2.5 bg-dashboard-blue hover:bg-dashboard-hover text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
          >
            Coba Hubungkan Kembali
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT: SLIDERS & INPUTS (8/12) */}
          <div className="lg:col-span-8 space-y-6">
            
            {thresholds.map((threshold, index) => {
              const style = getMetricStyling(threshold.metric);
              const isChanged = threshold.value !== originalThresholds.find(o => o.metric === threshold.metric)?.value;
              
              return (
                <div 
                  key={index} 
                  className={`bg-white rounded-2xl border ${isChanged ? 'border-amber-400 shadow-amber-50/50' : 'border-slate-200'} shadow-sm p-6 transition-all duration-200 relative overflow-hidden`}
                >
                  {isChanged && (
                    <div className="absolute top-0 right-0 bg-amber-500 text-white text-[9px] font-extrabold px-3 py-1 rounded-bl-lg uppercase tracking-wider animate-pulse">
                      Ada Perubahan
                    </div>
                  )}

                  {/* Card Header Info */}
                  <div className="flex gap-4 items-start">
                    <div className={`p-3 rounded-xl ${style.bgColor} border ${style.borderColor}`}>
                      {style.icon}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-800 text-base">{threshold.label}</h3>
                        <span className="text-[10px] bg-slate-100 font-mono text-slate-500 px-2 py-0.5 rounded font-bold uppercase">
                          {threshold.metric}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed font-medium">{threshold.description}</p>
                    </div>
                  </div>

                  {/* Card Control Inputs: Slider & Number Side-by-Side */}
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-center border-t border-slate-100 pt-6">
                    
                    {/* Slider Control (8 cols on md) */}
                    <div className="md:col-span-8 flex flex-col space-y-2">
                      <div className="flex justify-between text-[10px] text-slate-400 font-mono font-bold">
                        <span>Min: {style.sliderMin}{threshold.unit}</span>
                        <span className="text-slate-600">Luncurkan untuk mengubah</span>
                        <span>Max: {style.sliderMax}{threshold.unit}</span>
                      </div>
                      
                      <input 
                        type="range"
                        min={style.sliderMin}
                        max={style.sliderMax}
                        step={style.sliderStep}
                        value={threshold.value}
                        onChange={(e) => handleValueChange(threshold.metric, Number(e.target.value))}
                        className={`w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer ${style.accentColor}`}
                      />
                    </div>

                    {/* Precise Value Control Box (4 cols on md) */}
                    <div className="md:col-span-4 flex items-center gap-2 justify-end">
                      <div className="relative rounded-lg shadow-sm w-32">
                        <input
                          type="number"
                          min={style.sliderMin}
                          max={style.sliderMax}
                          step={style.sliderStep}
                          value={threshold.value}
                          onChange={(e) => handleValueChange(threshold.metric, Number(e.target.value))}
                          className="w-full pl-3 pr-10 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-800 text-center bg-slate-50 focus:outline-none focus:ring-1 focus:ring-dashboard-blue"
                        />
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                          <span className="text-xs font-bold text-slate-400">{threshold.unit}</span>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              );
            })}

            {/* Sticky Action Footer */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
                <span className="text-xs font-bold text-slate-500">
                  {hasChanges ? 'Terdapat perubahan yang belum disimpan.' : 'Semua ambang batas sinkron dengan server.'}
                </span>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={handleResetToDefaults}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset Bawaan</span>
                </button>

                <button
                  onClick={handleSaveSettings}
                  disabled={saving || !hasChanges}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2.5 bg-dashboard-blue hover:bg-dashboard-hover disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" />
                      <span>Simpan Konfigurasi</span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>

          {/* RIGHT: THESIS/INFO PANEL (4/12) */}
          <div className="lg:col-span-4 space-y-6">
            
            <div className="bg-gradient-to-br from-dashboard-blue to-dashboard-hover text-white rounded-2xl p-6 shadow-md border border-white/10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-8 -mt-8" />
              <HelpCircle className="h-10 w-10 text-white/30 mb-4" />
              
              <h3 className="font-bold text-base">Bagaimana Fitur Ini Bekerja?</h3>
              <p className="text-xs text-white/80 mt-2 leading-relaxed font-medium">
                Ambang batas ini terintegrasi secara dinamis di seluruh lapisan arsitektur IoT terdistribusi:
              </p>
              
              <div className="mt-6 space-y-4">
                
                <div className="flex gap-3 items-start text-xs">
                  <div className="h-5 w-5 bg-white/20 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0">1</div>
                  <div>
                    <p className="font-bold text-white">Modifikasi Operator</p>
                    <p className="text-[10px] text-white/70 mt-0.5 font-medium">Operator mengubah batas aman sensor dari UI panel pengaturan ini.</p>
                  </div>
                </div>

                <div className="flex gap-3 items-start text-xs">
                  <div className="h-5 w-5 bg-white/20 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0">2</div>
                  <div>
                    <p className="font-bold text-white">Sinkronisasi Database</p>
                    <p className="text-[10px] text-white/70 mt-0.5 font-medium">Perubahan dikirim via REST API dan disimpan persisten di database MySQL backend Django.</p>
                  </div>
                </div>

                <div className="flex gap-3 items-start text-xs">
                  <div className="h-5 w-5 bg-white/20 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0">3</div>
                  <div>
                    <p className="font-bold text-white">Evaluasi MQTT Cepat</p>
                    <p className="text-[10px] text-white/70 mt-0.5 font-medium">Saat ESP32 mempublikasikan data MQTT ke broker, background listener langsung mencocokkan nilainya dengan batas database terbaru.</p>
                  </div>
                </div>

                <div className="flex gap-3 items-start text-xs">
                  <div className="h-5 w-5 bg-white/20 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0">4</div>
                  <div>
                    <p className="font-bold text-white">Alerts Real-Time</p>
                    <p className="text-[10px] text-white/70 mt-0.5 font-medium">Jika terdeteksi pelanggaran batas, Django menulis log anomali dan mengirim pesan WebSocket secara kilat untuk berkedip di dashboard.</p>
                  </div>
                </div>

              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-xs space-y-4">
              <h4 className="font-bold text-slate-800 text-sm border-b border-slate-100 pb-2">Informasi Standar Tugas Akhir</h4>
              
              <div>
                <p className="font-bold text-slate-500">Nilai Default Standard:</p>
                <div className="mt-2 space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-100 font-mono text-[10px] text-slate-600">
                  <p className="font-bold text-slate-400 mb-1">NODE 1 — Machine Monitoring</p>
                  <p>• Suhu Mesin: <strong>70.0°C</strong></p>
                  <p>• Getaran Mesin: <strong>1.50g</strong></p>
                  <p>• Arus Listrik: <strong>10.0A</strong></p>
                  <p className="font-bold text-slate-400 mt-2 mb-1">NODE 2 — Environment Monitoring</p>
                  <p>• Suhu Ruangan: <strong>35.0°C</strong></p>
                  <p>• Kelembaban: <strong>80.0%</strong></p>
                  <p>• Kadar Gas MQ-2: <strong>300.0ppm</strong></p>
                </div>
              </div>

              <div>
                <p className="font-bold text-slate-500">Penting untuk Sidang TA:</p>
                <p className="text-slate-400 mt-1 leading-normal font-medium">
                  Fitur ini menaikkan level sistem dari pemantauan statis (*Read-only*) menjadi sistem kontrol industri interaktif (*Read-Write Control System*), yang merupakan poin penilaian tinggi dalam rubrik penguji sistem IoT terdistribusi.
                </p>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* Floating Success Toast */}
      {showToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-slate-900 text-white px-5 py-3.5 rounded-xl shadow-2xl border border-slate-800 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

    </div>
  );
}
