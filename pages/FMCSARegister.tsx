import React, { useState, useEffect } from 'react';
import { FileText, RefreshCw, Calendar, Search, Filter, ChevronDown, ExternalLink, AlertCircle, X, Database, CheckCircle2, LayoutGrid, List, ArrowRight } from 'lucide-react';
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
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  const categories = [
    'NAME CHANGE',
    'CERTIFICATE, PERMIT, LICENSE',
    'CERTIFICATE OF REGISTRATION',
    'DISMISSAL',
    'WITHDRAWAL',
    'REVOCATION',
    'TRANSFERS',
    'GRANT DECISION NOTICES'
  ];

  function getTodayDate(): string {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  // Initial load from Supabase ONLY
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
        setLastUpdated(`DB: ${new Date().toLocaleTimeString()}`);
      } else {
        setRegisterData([]);
        setLastUpdated('');
        if (dateOverride) {
          setError('No records in database for this date. Click "Fetch Live PDF" to scrape.');
        }
      }
    } catch (err) {
      console.error('Supabase load error:', err);
      setError('Database connection issue.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRegisterData = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      // Smart detection for Local vs Production
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const apiUrl = isLocal ? 'http://localhost:3001/api/fmcsa-register' : '/api/fmcsa-register';
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate })
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.entries && data.entries.length > 0) {
        setRegisterData(data.entries);
        setLastUpdated(`Live PDF: ${new Date().toLocaleTimeString()} (${data.count} records)`);
        saveToSupabase(data.entries, selectedDate);
      } else {
        throw new Error('No entries found in PDF for this date.');
      }
    } catch (err: any) {
      console.error('Fetch error:', err);
      setError(err.message || 'Unable to fetch PDF data.');
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
      setSaveStatus(result.success ? 'saved' : 'error');
      if (result.success) setTimeout(() => setSaveStatus('idle'), 3000);
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
      'NAME CHANGE': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      'CERTIFICATE, PERMIT, LICENSE': 'bg-green-500/10 text-green-400 border-green-500/20',
      'CERTIFICATE OF REGISTRATION': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      'DISMISSAL': 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      'WITHDRAWAL': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      'REVOCATION': 'bg-red-500/10 text-red-400 border-red-500/20',
      'TRANSFERS': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
      'GRANT DECISION NOTICES': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    };
    return colors[category] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  };

  return (
    <div className="p-8 h-screen flex flex-col overflow-hidden bg-slate-950 text-slate-200 selection:bg-indigo-500/30">
      {/* Glassmorphic Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-600/20 rounded-lg border border-indigo-500/30">
              <FileText className="text-indigo-400" size={24} />
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">FMCSA <span className="text-indigo-500">Register</span></h1>
          </div>
          <p className="text-slate-500 text-sm font-medium">High-accuracy PDF scraping & carrier tracking</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex bg-slate-900/50 p-1 rounded-lg border border-slate-800">
            <button 
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <List size={18} />
            </button>
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <LayoutGrid size={18} />
            </button>
          </div>
          
          <button
            onClick={fetchRegisterData}
            disabled={isLoading}
            className="group flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-900/40 active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} />
            {isLoading ? 'Processing PDF...' : 'Fetch Live PDF'}
          </button>
        </div>
      </div>

      {/* Pro Filter Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {/* Date Selector */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Reporting Date</span>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Calendar size={16} className="text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                loadFromSupabase(e.target.value);
              }}
              className="w-full bg-slate-900/40 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 outline-none transition-all [color-scheme:dark]"
            />
          </div>
        </div>

        {/* Category Selector */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Section Filter</span>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Filter size={16} className="text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-900/40 border border-slate-800 rounded-xl pl-10 pr-10 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 outline-none appearance-none cursor-pointer transition-all"
            >
              <option value="all">All Categories</option>
              {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <ChevronDown size={16} className="text-slate-500" />
            </div>
          </div>
        </div>

        {/* Global Search */}
        <div className="flex flex-col gap-2 md:col-span-2">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Search Records</span>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={16} className="text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
            </div>
            <input
              type="text"
              placeholder="Search by Docket # or Carrier Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900/40 border border-slate-800 rounded-xl pl-10 pr-12 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 outline-none transition-all placeholder:text-slate-600"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-white transition-colors">
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Data View */}
      <div className="flex-1 bg-slate-900/20 border border-slate-800/60 rounded-2xl overflow-hidden flex flex-col shadow-2xl backdrop-blur-md">
        {/* Status Bar */}
        <div className="px-6 py-4 border-b border-slate-800/60 bg-slate-900/40 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Results</span>
              <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 rounded text-xs font-bold border border-indigo-500/20">
                {filteredData.length}
              </span>
            </div>
            {lastUpdated && (
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{lastUpdated}</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {saveStatus === 'saving' && <span className="text-[10px] font-bold text-indigo-400 animate-pulse uppercase tracking-widest flex items-center gap-1"><Database size={10}/> Syncing Database</span>}
            {saveStatus === 'saved' && <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest flex items-center gap-1"><CheckCircle2 size={10}/> Data Secured</span>}
            <a href={`https://li-public.fmcsa.dot.gov/lihtml/rptspdf/LI_REGISTER${selectedDate.replace(/-/g, '')}.PDF`} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-indigo-400 transition-all">
              <ExternalLink size={16} />
            </a>
          </div>
        </div>

        {/* Content Container */}
        <div className="flex-1 overflow-auto custom-scrollbar p-6">
          {error && !registerData.length && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-slate-800/30 rounded-3xl flex items-center justify-center mb-6 border border-slate-800">
                <AlertCircle className="text-slate-600" size={40} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">No Records Found</h3>
              <p className="text-slate-500 text-sm max-w-sm leading-relaxed mb-8">{error}</p>
              <button onClick={fetchRegisterData} className="px-8 py-3 bg-white text-slate-950 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all">
                Fetch From Source
              </button>
            </div>
          )}

          {isLoading && (
            <div className="h-full flex flex-col items-center justify-center">
              <div className="relative w-16 h-16 mb-6">
                <div className="absolute inset-0 border-4 border-indigo-500/10 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <p className="text-slate-400 text-xs font-black uppercase tracking-widest animate-pulse">Analyzing Official PDF...</p>
            </div>
          )}

          {!isLoading && filteredData.length > 0 && (
            viewMode === 'table' ? (
              <table className="w-full border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <th className="px-4 py-2 text-left">Docket Number</th>
                    <th className="px-4 py-2 text-left">Carrier Information</th>
                    <th className="px-4 py-2 text-left">Section / Category</th>
                    <th className="px-4 py-2 text-left">Decision Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((entry, idx) => (
                    <tr key={idx} className="group hover:translate-x-1 transition-all duration-300">
                      <td className="px-4 py-4 bg-slate-900/40 rounded-l-xl border-y border-l border-slate-800/60 group-hover:border-indigo-500/30">
                        <span className="text-sm font-black text-indigo-400 font-mono">{entry.number}</span>
                      </td>
                      <td className="px-4 py-4 bg-slate-900/40 border-y border-slate-800/60 group-hover:border-indigo-500/30">
                        <div className="text-sm text-slate-200 font-bold leading-tight max-w-xl group-hover:text-white transition-colors">
                          {entry.title}
                        </div>
                      </td>
                      <td className="px-4 py-4 bg-slate-900/40 border-y border-slate-800/60 group-hover:border-indigo-500/30">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${getCategoryColor(entry.category)}`}>
                          {entry.category}
                        </span>
                      </td>
                      <td className="px-4 py-4 bg-slate-900/40 rounded-r-xl border-y border-r border-slate-800/60 group-hover:border-indigo-500/30">
                        <span className="text-xs text-slate-500 font-mono font-bold">{entry.decided}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredData.map((entry, idx) => (
                  <div key={idx} className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 hover:border-indigo-500/30 transition-all group">
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-lg font-black text-indigo-400 font-mono">{entry.number}</span>
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black border ${getCategoryColor(entry.category)}`}>
                        {entry.category}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 font-bold leading-relaxed mb-6 group-hover:text-white transition-colors line-clamp-3 h-15">
                      {entry.title}
                    </p>
                    <div className="flex justify-between items-center pt-4 border-t border-slate-800/60">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Decided</span>
                      <span className="text-xs text-slate-400 font-mono font-bold">{entry.decided}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
        select option { background-color: #020617; color: #e2e8f0; padding: 10px; }
      `}</style>
    </div>
  );
};
