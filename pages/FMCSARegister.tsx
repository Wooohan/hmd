import React, { useState, useEffect } from 'react';
import { FileText, RefreshCw, Calendar, Search, Filter, ChevronDown, ExternalLink, AlertCircle, X, Database } from 'lucide-react';
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

  useEffect(() => {
    // Try to load from Supabase first
    loadFromSupabase();
  }, []);

  const loadFromSupabase = async () => {
    setIsLoading(true);
    try {
      const data = await fetchFMCSARegisterEntries({
        dateFrom: selectedDate,
        dateTo: selectedDate
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
        // If not in DB, fetch live
        fetchRegisterData();
      }
    } catch (err) {
      console.error('Supabase load error:', err);
      fetchRegisterData();
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRegisterData = async (dateOverride?: string) => {
    setIsLoading(true);
    setError('');
    
    try {
      const dateToUse = dateOverride || selectedDate;
      const formattedDate = formatDateForAPI(dateToUse);
      
      // Use the Vercel API endpoint
      const apiUrl = '/api/fmcsa-register';
      
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
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.entries && data.entries.length > 0) {
        setRegisterData(data.entries);
        setLastUpdated(`Live: ${new Date().toLocaleTimeString()}`);
        
        // Auto-save to Supabase
        saveToSupabase(data.entries, dateToUse);
      } else {
        throw new Error('No entries found for this date');
      }
    } catch (err: any) {
      console.error('Error fetching FMCSA register:', err);
      setError(err.message || 'Unable to fetch live register data.');
      setRegisterData([]);
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
      'NAME CHANGE': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      'CERTIFICATE, PERMIT, LICENSE': 'bg-green-500/20 text-green-300 border-green-500/30',
      'CERTIFICATE OF REGISTRATION': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      'DISMISSAL': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      'WITHDRAWAL': 'bg-orange-500/20 text-orange-300 border-orange-500/30',
      'REVOCATION': 'bg-red-500/20 text-red-300 border-red-500/30',
      'MISCELLANEOUS': 'bg-slate-500/20 text-slate-300 border-slate-500/30',
      'TRANSFERS': 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      'GRANT DECISION NOTICES': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    };
    return colors[category] || 'bg-slate-500/20 text-slate-300 border-slate-500/30';
  };

  return (
    <div className="p-6 h-screen flex flex-col overflow-hidden bg-slate-950 text-slate-200">
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
          {saveStatus === 'saving' && <span className="text-xs text-slate-500 animate-pulse">Saving to DB...</span>}
          {saveStatus === 'saved' && <span className="text-xs text-green-500 flex items-center gap-1"><Database size={12}/> Saved</span>}
          <button
            onClick={() => fetchRegisterData()}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            {isLoading ? 'Scraping...' : 'Fetch Live'}
          </button>
        </div>
      </div>

      {/* Filters Row - Dropbox Style / Compact */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
        {/* Date Picker */}
        <div className="relative">
          <label className="absolute -top-2 left-3 px-1 bg-slate-950 text-[10px] text-slate-500 uppercase tracking-wider font-bold">Date</label>
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 focus-within:border-indigo-500 transition-colors">
            <Calendar size={16} className="text-slate-500 mr-2" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                // We don't auto-fetch on date change to avoid unnecessary scrapes
                // User should click Refresh/Fetch Live or we load from DB
              }}
              className="bg-transparent border-none text-sm text-white focus:outline-none w-full"
            />
            <button 
              onClick={() => loadFromSupabase()}
              className="ml-2 text-indigo-400 hover:text-indigo-300 p-1"
              title="Load from database"
            >
              <Database size={14} />
            </button>
          </div>
        </div>

        {/* Category Filter */}
        <div className="relative">
          <label className="absolute -top-2 left-3 px-1 bg-slate-950 text-[10px] text-slate-500 uppercase tracking-wider font-bold">Category</label>
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 focus-within:border-indigo-500 transition-colors">
            <Filter size={16} className="text-slate-500 mr-2" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent border-none text-sm text-white focus:outline-none w-full appearance-none cursor-pointer"
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <ChevronDown size={14} className="text-slate-500 pointer-events-none" />
          </div>
        </div>

        {/* Search */}
        <div className="relative md:col-span-2">
          <label className="absolute -top-2 left-3 px-1 bg-slate-950 text-[10px] text-slate-500 uppercase tracking-wider font-bold">Search</label>
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 focus-within:border-indigo-500 transition-colors">
            <Search size={16} className="text-slate-500 mr-2" />
            <input
              type="text"
              placeholder="Search by MC number or carrier name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent border-none text-sm text-white focus:outline-none w-full"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="text-slate-500 hover:text-white">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-slate-900/30 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
        {/* Table Header / Stats */}
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span className="text-xs font-medium text-slate-400">
              Showing <span className="text-white">{filteredData.length}</span> of <span className="text-white">{registerData.length}</span> entries
            </span>
            {lastUpdated && (
              <span className="text-[10px] text-slate-500 italic">
                {lastUpdated}
              </span>
            )}
          </div>
          <a
            href="https://li-public.fmcsa.dot.gov/LIVIEW/pkg_menu.prc_menu"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-indigo-400 hover:underline flex items-center gap-1"
          >
            Source: FMCSA Official <ExternalLink size={10} />
          </a>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          {error && (
            <div className="p-8 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 mb-4">
                <AlertCircle className="text-red-500" size={24} />
              </div>
              <h3 className="text-white font-medium mb-1">Scraping Error</h3>
              <p className="text-slate-400 text-sm max-w-md mx-auto">{error}</p>
              <button 
                onClick={() => fetchRegisterData()}
                className="mt-4 text-indigo-400 hover:text-indigo-300 text-sm font-medium"
              >
                Try Again
              </button>
            </div>
          )}

          {!error && isLoading && (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-slate-400 text-sm">Accessing FMCSA servers...</p>
            </div>
          )}

          {!error && !isLoading && filteredData.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500">
              <Search size={48} className="mb-4 opacity-20" />
              <p>No records found</p>
              <p className="text-xs mt-1">Try changing the date or filters</p>
            </div>
          )}

          {!error && !isLoading && filteredData.length > 0 && (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-900 text-slate-400 text-[10px] uppercase tracking-wider font-bold">
                <tr>
                  <th className="px-4 py-3 border-b border-slate-800">Docket #</th>
                  <th className="px-4 py-3 border-b border-slate-800">Carrier / Legal Name</th>
                  <th className="px-4 py-3 border-b border-slate-800">Category</th>
                  <th className="px-4 py-3 border-b border-slate-800">Decided</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredData.map((entry, idx) => (
                  <tr key={idx} className="hover:bg-indigo-500/5 transition-colors group">
                    <td className="px-4 py-3 text-sm font-mono text-indigo-400 font-medium">{entry.number}</td>
                    <td className="px-4 py-3 text-sm text-slate-300 group-hover:text-white transition-colors">{entry.title}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getCategoryColor(entry.category)}`}>
                        {entry.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono">{entry.decided}</td>
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
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
      `}</style>
    </div>
  );
};
