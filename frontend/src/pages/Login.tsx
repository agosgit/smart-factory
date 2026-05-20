import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cpu, Lock, User, AlertCircle } from 'lucide-react';
import axios from 'axios';

export default function Login() {
  const navigate = useNavigate();
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSubmitting(true);

    try {
      const response = await axios.post('http://127.0.0.1:8000/api/login/', {
        username: usernameInput,
        password: passwordInput,
      });

      if (response.data.success) {
        localStorage.setItem('auth_token', response.data.token);
        localStorage.setItem('username', response.data.user.username);
        navigate('/');
      } else {
        setErrorMessage(response.data.message || 'Login gagal.');
      }
    } catch (err: any) {
      console.error('Error logging in:', err);
      if (err.response && err.response.data && err.response.data.message) {
        setErrorMessage(err.response.data.message);
      } else {
        setErrorMessage('Gagal menghubungi server. Pastikan server Django aktif.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f1f5f9] flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-['Inter']">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
        {/* Header / Brand Logo */}
        <div className="h-12 w-12 rounded-xl bg-dashboard-blue flex items-center justify-center shadow-md">
          <Cpu className="h-7 w-7 text-white" />
        </div>
        <h2 className="mt-4 text-center text-2xl font-extrabold text-slate-800 tracking-tight">
          TELEMETRY SYSTEM
        </h2>
        <p className="mt-1 text-center text-xs text-slate-500 font-semibold tracking-wide uppercase">
          Smart Factory Admin Panel
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 border border-slate-200 shadow-md rounded-xl sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Error Message banner */}
            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-lg flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Username Input */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                Username
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  required
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-dashboard-blue/20 focus:border-dashboard-blue"
                  placeholder="Masukkan username"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                Password
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-dashboard-blue/20 focus:border-dashboard-blue"
                  placeholder="Masukkan password"
                />
              </div>
            </div>

            {/* Submit button */}
            <div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-dashboard-blue hover:bg-dashboard-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-dashboard-blue transition-colors disabled:opacity-50"
              >
                {submitting ? 'Menghubungkan...' : 'Masuk Panel Admin'}
              </button>
            </div>
          </form>

          {/* Quick Demo Credentials */}
          <div className="mt-6 border-t border-slate-100 pt-4 text-center">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
              Kredensial Tugas Akhir (ESP32)
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Username: <code className="bg-slate-100 px-1 py-0.5 rounded font-bold font-mono">admin</code> | 
              Password: <code className="bg-slate-100 px-1 py-0.5 rounded font-bold font-mono">admin123</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
