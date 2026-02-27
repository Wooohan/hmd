import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Play, Download, Database, SearchIcon, ClipboardList, Loader2, CheckCircle2, Info, AlertCircle, ShieldAlert, Zap } from 'lucide-react';
import { CarrierData, InsurancePolicy } from '../types';
import { fetchInsuranceData, fetchSafetyData } from '../services/mockService';
import { updateCarrierInsurance, updateCarrierSafety } from '../services/supabaseClient';

interface InsuranceScraperProps {
  carriers: CarrierData[];
  onUpdateCarriers: (newData: CarrierData[]) => void;
  autoStart?: boolean;
}

export const InsuranceScraper: React.FC<InsuranceScraperProps> = ({ carriers, onUpdateCarriers, autoStart }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStage, setCurrentStage] = useState<'IDLE' | 'INSURANCE' | 'SAFETY'>('IDLE');
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({ 
    total: 0, 
    insFound: 0, 
    insFailed: 0,
    safetyFound: 0,
    safetyFailed: 0,
    dbSaved: 0
  });
  
  // Manual Lookup State
  const [manualDot, setManualDot] = useState('');
  const [isManualLoading, setIsManualLoading] = useState(false);
  const [manualResult, setManualResult] = useState<{policies: InsurancePolicy[], safety?: any} | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const isRunningRef = useRef(false);
  const hasAutoStarted = useRef(false);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Handle Auto-Start from Live Scraper
  useEffect(() => {
    if (autoStart && carriers.length > 0 && !isProcessing && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      startEnrichmentProcess();
    }
  }, [autoStart, carriers]);

  const startEnrichmentProcess = async () => {
    if (isProcessing) return;
    if (carriers.length === 0) {
      setLogs(prev => [...prev, "❌ Error: No carriers found in database. Load carriers first."]);
      return;
    }

    setIsProcessing(true);
    isRunningRef.current = true;
    setLogs(prev => [...prev, `🚀 ENGINE INITIALIZED: Automatic Multi-Stage Enrichment...`]);
    setLogs(prev => [...prev, `🔍 Targeting: ${carriers.length} USDOT records`]);
    setLogs(prev => [...prev, `💾 Supabase sync: ENABLED`]);
    
    const updatedCarriers = [...carriers];
    let dbSaved = 0;

    // --- STAGE 1: INSURANCE EXTRACTION ---
    setCurrentStage('INSURANCE');
    setLogs(prev => [...prev, `📂 STAGE 1: Insurance Extraction (SearchCarriers API)`]);
    
    let insFound = 0;
    let insFailed = 0;

    for (let i = 0; i < updatedCarriers.length; i++) {
      if (!isRunningRef.current) break;
      const dot = updatedCarriers[i].dotNumber;
      
      setLogs(prev => [...prev, `⏳ [INSURANCE] [${i+1}/${updatedCarriers.length}] Querying DOT: ${dot}...`]);
      
      try {
        if (!dot || dot === '' || dot === 'UNKNOWN') throw new Error("Invalid DOT");
        const { policies } = await fetchInsuranceData(dot);
        updatedCarriers[i] = { ...updatedCarriers[i], insurancePolicies: policies };
        
        // Save to Supabase
        const saveResult = await updateCarrierInsurance(dot, { policies });
        if (saveResult.success) {
          dbSaved++;
        }
        
        if (policies.length > 0) {
          insFound++;
          setLogs(prev => [...prev, `✨ Success: Extracted ${policies.length} insurance filings for ${dot} → DB synced`]);
        } else {
          setLogs(prev => [...prev, `⚠️ Info: No active insurance found for ${dot}`]);
        }
      } catch (err) {
        insFailed++;
        setLogs(prev => [...prev, `❌ Fail: Insurance timeout for DOT ${dot}`]);
      }

      setProgress(Math.round(((i + 1) / updatedCarriers.length) * 50));
      setStats(prev => ({ ...prev, total: updatedCarriers.length, insFound, insFailed, dbSaved }));
      
      if ((i + 1) % 3 === 0 || (i + 1) === updatedCarriers.length) {
          onUpdateCarriers([...updatedCarriers]);
      }
    }

    // --- STAGE 2: SAFETY RATING EXTRACTION ---
    if (isRunningRef.current) {
        setCurrentStage('SAFETY');
        setLogs(prev => [...prev, `🛡️ STAGE 2: Safety Rating & BASIC Performance (FMCSA API)`]);
        
        let safetyFound = 0;
        let safetyFailed = 0;

        for (let i = 0; i < updatedCarriers.length; i++) {
          if (!isRunningRef.current) break;
          const dot = updatedCarriers[i].dotNumber;
          
          setLogs(prev => [...prev, `⏳ [SAFETY] [${i+1}/${updatedCarriers.length}] Querying DOT: ${dot}...`]);
          
          try {
            if (!dot || dot === '' || dot === 'UNKNOWN') throw new Error("Invalid DOT");
            const s = await fetchSafetyData(dot);
            
            updatedCarriers[i] = { 
              ...updatedCarriers[i], 
              safetyRating: s.rating,
              safetyRatingDate: s.ratingDate,
              basicScores: s.basicScores,
              oosRates: s.oosRates
            };
            
            // Save to Supabase
            const saveResult = await updateCarrierSafety(dot, s);
            if (saveResult.success) {
              dbSaved++;
            }
            
            if (s.rating !== 'N/A') {
              safetyFound++;
              setLogs(prev => [...prev, `✅ Safety: ${s.rating} rating captured for ${dot} → DB synced`]);
            } else {
              setLogs(prev => [...prev, `ℹ️ Safety: No formal rating on record for ${dot}`]);
            }
          } catch (err) {
            safetyFailed++;
            setLogs(prev => [...prev, `❌ Fail: Safety engine error for DOT ${dot}`]);
          }

          setProgress(50 + Math.round(((i + 1) / updatedCarriers.length) * 50));
          setStats(prev => ({ ...prev, safetyFound, safetyFailed, dbSaved }));
          
          if ((i + 1) % 3 === 0 || (i + 1) === updatedCarriers.length) {
              onUpdateCarriers([...updatedCarriers]);
          }
        }
    }

    setIsProcessing(false);
    isRunningRef.current = false;
    setCurrentStage('IDLE');
    setLogs(prev => [...prev, `🎉 ENRICHMENT COMPLETE. Database fully synchronized.`]);
    setLogs(prev => [...prev, `💾 Total Supabase updates: ${dbSaved}`]);
  };

  const handleManualCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDot) return;
    setIsManualLoading(true);
    setManualResult(null);
    try {
      const { policies } = await fetchInsuranceData(manualDot);
      const safety = await fetchSafetyData(manualDot);
      setManualResult({ policies, safety });
    } catch (error) {
      console.error("Manual check failed", error);
    } finally {
      setIsManualLoading(false);
    }
  };

  const handleExport = () => {
    const enrichedData = carriers.filter(c => (c.insurancePolicies && c.insurancePolicies.length > 0) || c.safetyRating);
    if (enrichedData.length === 0) return;
    
    const headers = ["DOT", "Legal Name", "Safety Rating", "Rating Date", "OOS Rate", "Insurance Carrier", "Coverage", "Type"];
    const rows = enrichedData.flatMap(c => {
      const baseInfo = [
        c.dotNumber,
        `"${c.legalName}"`,
        c.safetyRating || 'N/A',
        c.safetyRatingDate || 'N/A',
        c.oosRates?.[0]?.rate || 'N/A'
      ];
      
      if (!c.insurancePolicies || c.insurancePolicies.length === 0) {
        return [[...baseInfo, 'N/A', 'N/A', 'N/A']];
      }
      
      return c.insurancePolicies.map(p => [
        ...baseInfo,
        `"${p.carrier}"`,
        p.coverageAmount,
        p.type
      ]);
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `enriched_intelligence_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="p-8 h-screen flex flex-col overflow-hidden relative selection:bg-indigo-500/20">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Intelligence Enrichment Center</h1>
          <p className="text-slate-400">Chained Batch Processing: Insurance & Safety Ratings with Supabase Sync</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => isProcessing ? (isRunningRef.current = false) : startEnrichmentProcess()}
            className={`flex items-center gap-3 px-8 py-3 rounded-2xl font-black transition-all shadow-2xl shadow-indigo-500/20 ${
                isProcessing ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {isProcessing ? <><Loader2 className="animate-spin" size={20} /> Stop Enrichment</> : <><Zap size={20} /> Run Batch Enrichment</>}
          </button>
          <button 
            disabled={stats.insFound === 0 && stats.safetyFound === 0}
            onClick={handleExport}
            className="flex items-center gap-3 px-6 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-2xl font-bold transition-all border border-slate-700"
          >
            <Download size={20} />
            Export Intel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
        
        {/* Sidebar: Manual Check & Stats */}
        <div className="col-span-12 lg:col-span-4 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
          
          {/* Status Badge */}
          {isProcessing && (
            <div className={`p-4 rounded-2xl border flex items-center gap-3 animate-in slide-in-from-top-4 duration-500 ${currentStage === 'INSURANCE' ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
               <div className="relative">
                  <div className={`absolute inset-0 blur-md opacity-50 ${currentStage === 'INSURANCE' ? 'bg-indigo-400' : 'bg-emerald-400'}`}></div>
                  <Loader2 className="animate-spin relative z-10" size={20} />
               </div>
               <span className="text-xs font-black uppercase tracking-widest">Currently Scraping: {currentStage}</span>
            </div>
          )}

          <div className="bg-slate-850 border border-slate-700/50 p-6 rounded-3xl shadow-xl">
             <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-3">
                <SearchIcon size={16} className="text-indigo-400" />
                Quick Intelligence Lookup
             </h3>
             <form onSubmit={handleManualCheck} className="space-y-4">
                <div className="relative">
                  <input 
                    type="text" 
                    value={manualDot}
                    onChange={(e) => setManualDot(e.target.value)}
                    placeholder="Enter USDOT Number..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-2xl pl-4 pr-12 py-3 text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <button 
                    type="submit"
                    disabled={isManualLoading || !manualDot}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-indigo-400 hover:text-white transition-colors"
                  >
                    {isManualLoading ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
                  </button>
                </div>
             </form>

             {manualResult && (
               <div className="mt-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                     <span className="text-[9px] font-black text-slate-500 uppercase block mb-1 tracking-widest">Safety Status</span>
                     <p className={`text-sm font-black ${manualResult.safety?.rating === 'Satisfactory' ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {manualResult.safety?.rating || 'NO RATING FOUND'}
                     </p>
                  </div>
                  
                  <div className="space-y-2">
                    {manualResult.policies.length === 0 ? (
                      <div className="p-4 bg-slate-900/50 rounded-2xl text-[10px] text-slate-500 italic text-center">No active insurance filings.</div>
                    ) : (
                      manualResult.policies.map((p, idx) => (
                        <div key={idx} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                           <div className="flex justify-between items-start mb-1">
                              <span className="text-[9px] font-black text-indigo-400 uppercase">{p.type} Filing</span>
                              <span className="text-sm font-black text-white">{p.coverageAmount}</span>
                           </div>
                           <p className="text-[10px] font-bold text-slate-400 uppercase truncate">{p.carrier}</p>
                        </div>
                      ))
                    )}
                  </div>
               </div>
             )}
          </div>

          <div className="bg-slate-850 border border-slate-700/50 p-6 rounded-3xl shadow-xl">
            <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-3">
                <Database size={16} className="text-indigo-400" />
                Live Counters
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700/30">
                <span className="text-[10px] text-slate-500 block mb-1 font-black uppercase">Insurance Found</span>
                <span className="text-2xl font-black text-indigo-400">{stats.insFound}</span>
              </div>
              <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700/30">
                <span className="text-[10px] text-slate-500 block mb-1 font-black uppercase">Safety Ratings</span>
                <span className="text-2xl font-black text-emerald-400">{stats.safetyFound}</span>
              </div>
              <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700/30 col-span-2">
                <span className="text-[10px] text-slate-500 block mb-1 font-black uppercase">DB Updates</span>
                <span className="text-2xl font-black text-purple-400">{stats.dbSaved}</span>
              </div>
            </div>

            <div className="mt-6 space-y-4">
               <div>
                  <div className="flex justify-between text-[10px] mb-2 font-black text-slate-500 uppercase">
                    <span>Overall Batch Progress</span>
                    <span className="text-white">{progress}%</span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-2 shadow-inner">
                    <div className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                  </div>
               </div>
            </div>
          </div>
        </div>

        {/* Main Log Area */}
        <div className="col-span-12 lg:col-span-8 flex flex-col bg-slate-950 rounded-[2rem] border border-slate-800/50 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <div className="bg-slate-900/80 p-4 border-b border-slate-800 flex justify-between items-center px-8">
            <div className="flex items-center gap-3">
                <ClipboardList size={18} className="text-slate-500" />
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Enrichment Pipeline Stream</span>
            </div>
            <div className="text-[10px] text-slate-500 font-mono italic">INTELLIGENCE_ENGINE // ACTIVE</div>
          </div>
          <div className="flex-1 overflow-y-auto p-8 font-mono text-xs space-y-2 custom-scrollbar">
            {logs.length === 0 && <span className="text-slate-700 italic opacity-50 block text-center py-20">Idle. Chained enrichment will start automatically after live scraping.</span>}
            {logs.map((log, i) => (
              <div key={i} className={`flex gap-4 p-2 rounded-lg transition-colors ${log.includes('❌') ? 'bg-red-500/5 text-red-400' : log.includes('✅') || log.includes('✨') || log.includes('🎉') ? 'bg-emerald-500/5 text-emerald-400' : log.includes('🛡️') || log.includes('📂') ? 'bg-indigo-500/10 text-indigo-300 font-black' : 'hover:bg-slate-900 text-slate-400'}`}>
                <span className="opacity-30 shrink-0 font-bold">[{new Date().toLocaleTimeString().split(' ')[0]}]</span>
                <span className="leading-relaxed">{log}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
};