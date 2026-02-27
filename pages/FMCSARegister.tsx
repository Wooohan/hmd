import React, { useState, useEffect } from 'react';
import { FileText, RefreshCw, Calendar, Search, Filter, ChevronDown, ExternalLink, AlertCircle, X, Database, CheckCircle2 } from 'lucide-react';
import { saveFMCSARegisterEntries, fetchFMCSARegisterEntries } from '../services/fmcsaRegisterService';

interface FMCSARegisterEntry {
  number: string;
  title: string;
  decided: string;
  category: string;
}

export const FMCSARegister: React.FC = () => {
  const [registerData, setRegisterData] = useState<FMCSARegisterEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDate());
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const categories = [
    'NAME CHANGE',
    'CERTIFICATE, PERMIT, LICENSE',
    'CERTIFICATE OF REGISTRATION',
    'DISMISSAL',
    'WITHDRAWAL',
    'REVOCATION',
    'MISCELLANEOUS',
    'TRANSFERS',
    'GRANT DECISION NOTICES'
  ];

  // Get today's date in YYYY-MM-DD format
  function getTodayDate(): string {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  // Convert YYYY-MM-DD to DD-MMM-YY format for API
  function formatDateForAPI(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00Z');
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = months[date.getUTCMonth()];
    const year = String(date.getUTCFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
  }

  // Initial load only from Supabase, NO automatic live fetch
  useEffect(() => {
    loadFromSupabase();
  }, []);

  const loadFromSupabase = async (dateOverride?: string) => {
    setIsLoading(true);
    setError('');
    const dateToUse = dateOverride || selectedDate;
    
    try {
      const data = await fetchFMCSARegisterEntries({
        dateFrom: dateToUse,
        dateTo: dateToUse
      });
      
      if (data && data.length > 0) {
        setRegisterData(data.map(d => ({
          number: d.number,
          title: d.title,
          decided: d.decided,
          category: d.category
        })));
        setLastUpdated(`Loaded from DB: ${new Date().toLocaleTimeString()}`);
      } else {
        setRegisterData([]);
        setLastUpdated('');
        if (dateOverride) {
           setError('No data found in database for this date. Click "Fetch Live" to scrape from FMCSA.');
        }
      }
    } catch (err) {
      console.error('Supabase load error:', err);
      setError('Error loading from database.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRegisterData = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const formattedDate = formatDateForAPI(selectedDate);
      
      // Smart detection for Local vs Production
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const apiUrl = isLocal ? 'http://localhost:3001/api/fmcsa-register' : '/api/fmcsa-register';
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: formattedDate
        })
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.entries && data.entries.length > 0) {
        setRegisterData(data.entries);
        setLastUpdated(`Live: ${new Date().toLocaleTimeString()} (${data.count} records)`);
        
        // Auto-save to Supabase
        saveToSupabase(data.entries, selectedDate);
      } else {
        throw new Error('No entries found on FMCSA for this date.');
      }
    } catch (err: any) {
      console.error('Error fetching FMCSA register:', err);
      setError(err.message || 'Unable to fetch live register data.');
    } finally {
      setIsLoading(false);
    }
  };

  const saveToSupabase = async (entries: FMCSARegisterEntry[], fetchDate: string) => {
    setSaveStatus('saving');
    try {
      const result = await saveFMCSARegisterEntries(
        entries.map(e => ({ ...e, date_fetched: fetchDate })),
        fetchDate
      );
      if (result.success) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      setSaveStatus('error');
    }
  };

  const filteredData = registerData.filter(entry => {
    const matchesCategory = selectedCategory === 'all' || entry.category === selectedCategory;
    const matchesSearch = entry.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         entry.number.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'NAME CHANGE': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'CERTIFICATE, PERMIT, LICENSE': 'bg-green-500/20 text-green-400 border-green-500/30',
      'CERTIFICATE OF REGISTRATION': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      'DISMISSAL': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'WITHDRAWAL': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      'REVOCATION': 'bg-red-500/20 text-red-400 border-red-500/30',
      'MISCELLANEOUS': 'bg-slate-500/20 text-slate-400 border-slate-500/30',
      'TRANSFERS': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
      'GRANT DECISION NOTICES': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    };
    return colors[category] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  };

  return (
    <div className="p-6 h-screen flex flex-col overflow-hidden bg-slate-950 text-slate-200 font-sans">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="text-indigo-500" />
            FMCSA Register
          </h1>
          <p className="text-slate-400 text-xs">Daily Motor Carrier Decisions & Notices</p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === 'saving' && <span className="text-xs text-slate-500 animate-pulse flex items-center gap-1"><Database size={12}/> Syncing...</span>}
          {saveStatus === 'saved' && <span className="text-xs text-green-500 flex items-center gap-1"><CheckCircle2 size={12}/> Synced</span>}
          <button
            onClick={fetchRegisterData}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-all shadow-lg shadow-indigo-900/20 disabled:opacity-50"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            {isLoading ? 'Scraping...' : 'Fetch Live'}
          </button>
        </div>
      </div>

      {/* Filters Row - Enhanced Dark Styling */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 bg-slate-900/40 p-4 rounded-xl border border-slate-800/60 backdrop-blur-sm">
        {/* Date Picker */}
        <div className="relative group">
          <label className="absolute -top-2 left-3 px-1 bg-slate-950 text-[10px] text-slate-500 uppercase tracking-wider font-bold group-focus-within:text-indigo-400 transition-colors">Date</label>
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 focus-within:border-indigo-500/50 transition-all">
            <Calendar size={16} className="text-slate-500 mr-2" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                loadFromSupabase(e.target.value);
              }}
              className="bg-transparent border-none text-sm text-slate-200 focus:outline-none w-full [color-scheme:dark]"
            />
          </div>
        </div>

        {/* Category Filter */}
        <div className="relative group">
          <label className="absolute -top-2 left-3 px-1 bg-slate-950 text-[10px] text-slate-500 uppercase tracking-wider font-bold group-focus-within:text-indigo-400 transition-colors">Category</label>
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 focus-within:border-indigo-500/50 transition-all">
            <Filter size={16} className="text-slate-500 mr-2" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent border-none text-sm text-slate-200 focus:outline-none w-full appearance-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat} className="bg-slate-900">{cat}</option>
              ))}
            </select>
            <ChevronDown size={14} className="text-slate-500 pointer-events-none ml-1" />
          </div>
        </div>

        {/* Search */}
        <div className="relative md:col-span-2 group">
          <label className="absolute -top-2 left-3 px-1 bg-slate-950 text-[10px] text-slate-500 uppercase tracking-wider font-bold group-focus-within:text-indigo-400 transition-colors">Search</label>
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 focus-within:border-indigo-500/50 transition-all">
            <Search size={16} className="text-slate-500 mr-2" />
            <input
              type="text"
              placeholder="Search by MC number or carrier name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent border-none text-sm text-slate-200 focus:outline-none w-full placeholder:text-slate-600"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="text-slate-500 hover:text-white transition-colors">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-slate-900/20 border border-slate-800/60 rounded-xl overflow-hidden flex flex-col shadow-inner">
        {/* Table Header / Stats */}
        <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/40 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span className="text-xs font-medium text-slate-400">
              Showing <span className="text-white font-bold">{filteredData.length}</span> of <span className="text-white font-bold">{registerData.length}</span> entries
            </span>
            {lastUpdated && (
              <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse"></div>
                {lastUpdated}
              </span>
            )}
          </div>
          <a
            href="https://li-public.fmcsa.dot.gov/LIVIEW/pkg_menu.prc_menu"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 font-semibold uppercase tracking-tight"
          >
            FMCSA Official Source <ExternalLink size={10} />
          </a>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          {error && (
            <div className="p-12 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-500/10 mb-4 border border-red-500/20">
                <AlertCircle className="text-red-500" size={28} />
              </div>
              <h3 className="text-white font-bold mb-2">Notice</h3>
              <p className="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">{error}</p>
              {!registerData.length && (
                <button 
                  onClick={fetchRegisterData}
                  className="mt-6 px-6 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 rounded-full text-xs font-bold transition-all border border-indigo-500/30"
                >
                  Fetch Live Data Now
                </button>
              )}
            </div>
          )}

          {!error && isLoading && (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-slate-400 text-sm font-medium animate-pulse">Extracting FMCSA records...</p>
            </div>
          )}

          {!error && !isLoading && filteredData.length === 0 && !lastUpdated && (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500">
              <div className="w-16 h-16 bg-slate-800/40 rounded-full flex items-center justify-center mb-4">
                <FileText size={32} className="opacity-20" />
              </div>
              <p className="font-medium">No data loaded for this date</p>
              <p className="text-xs mt-2 text-slate-600">Click the "Fetch Live" button to scrape today's register</p>
            </div>
          )}

          {!error && !isLoading && filteredData.length === 0 && lastUpdated && (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500">
              <Search size={48} className="mb-4 opacity-10" />
              <p className="font-medium">No records match your filters</p>
            </div>
          )}

          {!error && !isLoading && filteredData.length > 0 && (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-md text-slate-500 text-[10px] uppercase tracking-widest font-black">
                <tr>
                  <th className="px-6 py-4 border-b border-slate-800/60">Docket #</th>
                  <th className="px-6 py-4 border-b border-slate-800/60">Carrier / Legal Name</th>
                  <th className="px-6 py-4 border-b border-slate-800/60">Category</th>
                  <th className="px-6 py-4 border-b border-slate-800/60">Decided</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filteredData.map((entry, idx) => (
                  <tr key={idx} className="hover:bg-indigo-500/5 transition-all group cursor-default">
                    <td className="px-6 py-4 text-sm font-mono text-indigo-400 font-bold group-hover:text-indigo-300">{entry.number}</td>
                    <td className="px-6 py-4 text-sm text-slate-300 group-hover:text-white transition-colors leading-snug">{entry.title}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold border ${getCategoryColor(entry.category)} shadow-sm`}>
                        {entry.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 font-mono font-medium">{entry.decided}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      
      {/* CSS for custom scrollbar */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.5);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1e293b;
          border-radius: 20px;
          border: 2px solid #0f172a;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #334155;
        }
        select option {
          background-color: #0f172a;
          color: #e2e8f0;
        }
      `}</style>
    </div>
  );
};
