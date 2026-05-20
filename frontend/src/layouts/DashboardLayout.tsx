import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, FileText, LogOut, Search, Cpu, Database, 
  Menu, X, Bell, Shield, CheckCircle, AlertCircle, Play, Sparkles, RefreshCw, Sliders
} from 'lucide-react';
import axios from 'axios';

interface SystemStatus {
  status: string;
  total_telemetry_records: number;
  total_anomaly_records: number;
  latest_telemetry_timestamp: string | null;
}

interface AnomalyLog {
  node_id: string;
  timestamp: string;
  metric: string;
  value: number;
  threshold: number;
  message: string;
}

export default function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  // Active Dropdowns State
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [recentAnomalies, setRecentAnomalies] = useState<AnomalyLog[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  // Search Palette State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const notificationsRef = useRef<HTMLDivElement>(null);

  const fetchStatus = async () => {
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/status/');
      setSystemStatus(response.data);
    } catch (err) {
      console.error('Gagal mengambil status backend:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // 30s status updates
    return () => clearInterval(interval);
  }, []);

  // Fetch recent anomalies for notifications panel
  const fetchRecentAnomalies = async () => {
    setLoadingNotifications(true);
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/anomalies/?limit=5');
      setRecentAnomalies(response.data);
    } catch (err) {
      console.error('Gagal mengambil notifikasi:', err);
    } finally {
      setLoadingNotifications(false);
    }
  };

  // Close notifications dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleNotifications = () => {
    if (!notificationsOpen) {
      fetchRecentAnomalies();
    }
    setNotificationsOpen(!notificationsOpen);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('username');
    navigate('/login');
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setSearchOpen(true);
    }
  };

  const getBreadcrumbs = () => {
    if (location.pathname === '/logs') {
      return { category: 'REPORT', page: 'Logs Peringatan' };
    }
    if (location.pathname === '/settings') {
      return { category: 'CONFIGURATION', page: 'Ambang Batas Sensor' };
    }
    return { category: 'INTERFACE', page: 'Detail Monitoring' };
  };

  const breadcrumbs = getBreadcrumbs();
  const username = localStorage.getItem('username') || 'Operator';

  // Dynamic Search Engine matching metrics, commands, or documentation
  const searchResults = React.useMemo(() => {
    if (!searchQuery) return [];
    
    const query = searchQuery.toLowerCase();
    const items = [
      { id: 'detail', title: 'Dashboard Detail Monitoring', category: 'Halaman Utama', path: '/' },
      { id: 'logs', title: 'Buat Laporan / Logs Peringatan', category: 'Laporan', path: '/logs' },
      { id: 'settings', title: 'Pengaturan Ambang Batas Sensor', category: 'Administrasi', path: '/settings' },
      { id: 'temp_m', title: 'Suhu Mesin (Node 1)', category: 'Sensor Mesin', path: '/' },
      { id: 'vib_m', title: 'Getaran Mesin (Node 1)', category: 'Sensor Mesin', path: '/' },
      { id: 'cur_m', title: 'Arus Listrik Mesin (Node 1)', category: 'Sensor Mesin', path: '/' },
      { id: 'temp_e', title: 'Suhu Lingkungan Pabrik (Node 2)', category: 'Sensor Lingkungan', path: '/' },
      { id: 'hum_e', title: 'Kelembaban Udara Pabrik (Node 2)', category: 'Sensor Lingkungan', path: '/' },
      { id: 'gas_e', title: 'Kadar Gas Sensor (Node 2)', category: 'Sensor Lingkungan', path: '/' },
    ];

    return items.filter(item => 
      item.title.toLowerCase().includes(query) || 
      item.category.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  return (
    <div className="flex h-screen bg-[#f1f5f9] text-slate-700 font-['Inter']">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* LEFT SIDEBAR - ROYAL BLUE AESTHETIC */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-dashboard-blue text-white transition-transform duration-300 lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Brand/Header */}
        <div className="flex h-16 items-center justify-between px-6 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Cpu className="h-6 w-6 text-white" />
            <div>
              <h1 className="font-bold text-lg leading-tight tracking-wide">Smart Factory</h1>
            </div>
          </div>
          <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-6 px-4 py-6">
          {/* Interface Category */}
          <div className="space-y-1">
            <p className="px-3 text-[11px] font-semibold text-white/50 tracking-wider">INTERFACE</p>
            <NavLink
              to="/"
              end
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-white/15 text-white shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
              onClick={() => setSidebarOpen(false)}
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>Detail</span>
            </NavLink>
          </div>

          {/* Report Category */}
          <div className="space-y-1">
            <p className="px-3 text-[11px] font-semibold text-white/50 tracking-wider">REPORT</p>
            <NavLink
              to="/logs"
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-white/15 text-white shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
              onClick={() => setSidebarOpen(false)}
            >
              <FileText className="h-4 w-4" />
              <span>Buat Laporan</span>
            </NavLink>
          </div>

          {/* Configuration Category */}
          <div className="space-y-1">
            <p className="px-3 text-[11px] font-semibold text-white/50 tracking-wider">CONFIGURATION</p>
            <NavLink
              to="/settings"
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-white/15 text-white shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
              onClick={() => setSidebarOpen(false)}
            >
              <Sliders className="h-4 w-4" />
              <span>Pengaturan</span>
            </NavLink>
          </div>
        </nav>

        {/* User Card & Logout */}
        <div className="p-4 border-t border-white/10 bg-black/10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center font-semibold text-white">
                {username.charAt(0).toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-semibold truncate">{username}</p>
                <p className="text-[10px] text-white/60">Factory Admin</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 rounded-md text-white/70 hover:text-white hover:bg-white/15 transition-colors"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* RIGHT SIDE MAIN WRAPPER */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* HEADER / TOPBAR */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 shadow-sm z-30">
          {/* Left: Mobile Toggle & Breadcrumbs */}
          <div className="flex items-center gap-4">
            <button 
              className="lg:hidden text-slate-600 hover:text-slate-900"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="hidden sm:flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-400">{breadcrumbs.category}</span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-700 font-medium">{breadcrumbs.page}</span>
            </div>
          </div>

          {/* Center/Right: Search Bar & Notifications & Status */}
          <div className="flex items-center gap-6">
            
            {/* Search Input Box */}
            <form onSubmit={handleSearchSubmit} className="hidden md:flex items-center">
              <input 
                type="text" 
                placeholder="Cari metrik, node..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 xl:w-64 px-3 py-1.5 text-sm bg-slate-50 border border-slate-300 border-r-0 rounded-l-md focus:outline-none focus:ring-1 focus:ring-dashboard-blue"
              />
              <button 
                type="submit"
                className="bg-dashboard-blue hover:bg-dashboard-hover text-white text-sm px-4 py-1.5 rounded-r-md transition-colors flex items-center gap-1 font-medium shadow-sm"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Cari</span>
              </button>
            </form>

            {/* Backend Health Status Card */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-50 border border-slate-200 rounded-full">
              <div className={`h-2.5 w-2.5 rounded-full ${systemStatus?.status === 'healthy' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-[11px] font-medium text-slate-600">
                {systemStatus?.status === 'healthy' ? 'Server Connected' : 'Server Error'}
              </span>
            </div>

            {/* Notification Icon & Dropdown Panel */}
            <div className="relative" ref={notificationsRef}>
              <button 
                onClick={handleToggleNotifications}
                className="relative p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-50 transition-colors"
                title="Peringatan Anomali"
              >
                <Bell className="h-5 w-5" />
                {systemStatus?.total_anomaly_records && systemStatus.total_anomaly_records > 0 ? (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 animate-ping" />
                ) : null}
              </button>

              {/* DROPDOWN NOTIFIKASI */}
              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden z-50">
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-700">Notifikasi Anomali</span>
                    <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-extrabold">SIAGA</span>
                  </div>
                  
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {loadingNotifications ? (
                      <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Memuat peringatan...</span>
                      </div>
                    ) : !Array.isArray(recentAnomalies) || recentAnomalies.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400 flex flex-col items-center">
                        <CheckCircle className="h-8 w-8 text-emerald-500 mb-2" />
                        <p className="font-bold text-slate-700">Suhu & Sensor Aman</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Tidak ada anomali terdeteksi.</p>
                      </div>
                    ) : (
                      recentAnomalies.map((item, idx) => {
                        if (!item) return null;
                        const valNum = Number(item.value);
                        const displayValue = !isNaN(valNum) ? valNum.toFixed(1) : (item.value ?? '-');
                        const displayThreshold = item.threshold !== null && item.threshold !== undefined ? item.threshold : '-';
                        let displayTime = '-';
                        try {
                          displayTime = new Date(item.timestamp).toLocaleTimeString('id-ID');
                        } catch (e) {
                          displayTime = item.timestamp;
                        }

                        return (
                          <div key={idx} className="p-3 hover:bg-slate-50/50 transition-colors flex gap-2.5 items-start">
                            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                            <div className="overflow-hidden">
                              <div className="flex justify-between items-center gap-2">
                                <span className="text-[9px] font-extrabold uppercase bg-red-50 text-red-700 px-1 rounded">
                                  {item.node_id}
                                </span>
                                <span className="text-[9px] text-slate-400 font-mono">
                                  {displayTime}
                                </span>
                              </div>
                              <p className="text-xs font-semibold text-slate-700 mt-1 truncate">{item.message}</p>
                              <p className="text-[9px] text-slate-500 mt-0.5">
                                Nilai: <strong className="text-red-600">{displayValue}</strong> vs Batas: {displayThreshold}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  
                  <div className="bg-slate-50 px-4 py-2 border-t border-slate-200 text-center">
                    <button 
                      onClick={() => { setNotificationsOpen(false); navigate('/logs'); }}
                      className="text-[10px] font-bold text-dashboard-blue hover:text-dashboard-hover transition-colors"
                    >
                      Lihat Semua Logs Laporan
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Profile Avatar */}
            <div className="h-8 w-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center font-bold text-xs text-slate-600">
              {username.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        {/* CONTENT VIEWPORT */}
        <main className="flex-1 overflow-y-auto bg-slate-50 p-6 min-w-0">
          <Outlet />
        </main>
      </div>

      {/* DYNAMIC COMMAND PALETTE / SEARCH MODAL */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Search input header */}
            <div className="p-4 border-b border-slate-200 flex items-center gap-3">
              <Search className="h-5 w-5 text-slate-400" />
              <input 
                type="text"
                autoFocus
                placeholder="Cari sesuatu (misal: suhu, logs, arus, mesin)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 text-sm bg-transparent border-0 outline-none text-slate-800 placeholder-slate-400"
              />
              <button 
                onClick={() => setSearchOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search results list */}
            <div className="max-h-72 overflow-y-auto p-2">
              {searchResults.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Tidak ditemukan hasil untuk <strong className="text-slate-600">"{searchQuery}"</strong>.
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hasil Pencarian</div>
                  {searchResults.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSearchOpen(false);
                        navigate(item.path);
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex justify-between items-center group transition-colors"
                    >
                      <div>
                        <p className="text-xs font-bold text-slate-700 group-hover:text-dashboard-blue">{item.title}</p>
                        <p className="text-[10px] text-slate-400">{item.category}</p>
                      </div>
                      <Play className="h-3 w-3 text-slate-300 group-hover:text-dashboard-blue transition-colors" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Footer hints */}
            <div className="bg-slate-50 px-4 py-2 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-400">
              <span className="flex items-center gap-1 font-medium">
                <Sparkles className="h-3.5 w-3.5 text-dashboard-blue" />
                <span>Pencarian Cepat Telemetri</span>
              </span>
              <span>Tekan ESC untuk keluar</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
