import React, { useState, useRef, useEffect } from 'react';
import { Play, Download, Pause, Activity, Terminal as TerminalIcon, AlertCircle, CheckCircle2, ShieldCheck, Zap, Lock, Database } from 'lucide-react';
import { CarrierData, ScraperConfig, User } from '../types';
import { generateMockCarrier, scrapeRealCarrier, downloadCSV } from '../services/mockService';
import { saveCarrierToSupabase } from '../services/supabaseClient';

const CONCURRENCY_LIMIT = 5;

interface ScraperProps {
  user: User;
  onUpdateUsage: (count: number) => void;
  onNewCarriers: (data: CarrierData[]) => void;
  onUpgrade: () => void;
  onFinish?: () => void;
}

export const Scraper: React.FC<ScraperProps> = ({ user, onUpdateUsage, onNewCarriers, onUpgrade, onFinish }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [config, setConfig] = useState<ScraperConfig>({
    startPoint: '1580000',
    recordCount: 50,
    includeCarriers: true,
    includeBrokers: false,
    onlyAuthorized: true,
    useMockData: false,
    useProxy: true,
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [scrapedData, setScrapedData] = useState<CarrierData[]>([]);
  const [progress, setProgress] = useState(0);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [dbSaveCount, setDbSaveCount] = useState(0);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const isRunningRef = useRef(false);

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  const toggleRun = () => {
    if (isRunning) {
      setIsRunning(false);
      isRunningRef.current = false;
      setLogs(prev => [...prev, "⚠️ Process paused by user."]);
    } else {
      if (user.recordsExtractedToday >= user.dailyLimit) {
        setShowUpgradeModal(true);
        return;
      }
      setIsRunning(true);
      isRunningRef.current = true;
      setLogs(prev => [...prev, `🚀 Initializing High-Speed Scraper...`]);
      setLogs(prev => [...prev, `Mode: ${config.useMockData ? 'Simulation' : config.useProxy ? 'Proxy Network' : 'Direct (VPN)'}`]);
      setLogs(prev => [...prev, `Targeting ${config.recordCount} records starting at MC# ${config.startPoint}`]);
      setLogs(prev => [...prev, `💾 Supabase integration: ACTIVE`]);
      setScrapedData([]);
      setProgress(0);
      setDbSaveCount(0);
      processScrapingConcurrent();
    }
  };

  const processScrapingConcurrent = async () => {
    const start = parseInt(config.startPoint);
    const total = config.recordCount;
    let completed = 0;
    
    let sessionExtracted = 0;
    const initialUsed = user.recordsExtractedToday;
    const limit = user.dailyLimit;
    
    const tasks = Array.from({ length: total }, (_, i) => (start + i).toString());
    const successfulResults: CarrierData[] = [];

    const worker = async (mc: string) => {
      if (!isRunningRef.current) return;

      if (initialUsed + sessionExtracted >= limit) {
        isRunningRef.current = false;
        setIsRunning(false);
        setLogs(prev => [...prev, "⛔ DAILY LIMIT REACHED: Upgrade to extract more."]);
        setShowUpgradeModal(true);
        return;
      }

      let newData: CarrierData | null = null;
      try {
        if (config.useMockData) {
           await new Promise(r => setTimeout(r, 100));
           const isBroker = config.includeBrokers && (!config.includeCarriers || Math.random() > 0.5);
           newData = generateMockCarrier(mc, isBroker);
        } else {
           newData = await scrapeRealCarrier(mc, config.useProxy);
        }
      } catch (e) {
        // Silent fail
      }

      if (newData) {
         let matchesFilter = true;
         const type = newData.entityType.toUpperCase();
         const isCarrier = type.includes('CARRIER');
         const isBroker = type.includes('BROKER');
         const status = newData.status.toUpperCase();

         if (!config.includeCarriers && isCarrier && !isBroker) matchesFilter = false;
         if (!config.includeBrokers && isBroker && !isCarrier) matchesFilter = false;
         
         if (config.onlyAuthorized) {
             if (status.includes('NOT AUTHORIZED') || !status.includes('AUTHORIZED')) {
                 matchesFilter = false;
             }
         }

         if (matchesFilter) {
             setScrapedData(prev => [...prev, newData!]);
             successfulResults.push(newData!);
             
             const saveResult = await saveCarrierToSupabase(newData!);
             if (saveResult.success) {
               setDbSaveCount(prev => prev + 1);
               setLogs(prev => [...prev, `[Success] MC ${mc}: ${newData!.legalName} → Saved to DB`]);
             } else {
               setLogs(prev => [...prev, `[Success] MC ${mc}: ${newData!.legalName} → DB Error: ${saveResult.error}`]);
             }
             
             sessionExtracted++;
             onUpdateUsage(1);
         }
      } else {
         setLogs(prev => [...prev, `[Fail] MC ${mc} - No Data`]);
      }

      completed++;
      setProgress(Math.round((completed / total) * 100));
    };

    const activePromises: Promise<void>[] = [];
    
    for (const mc of tasks) {
      if (!isRunningRef.current) break;

      const p = worker(mc).then(() => {
        activePromises.splice(activePromises.indexOf(p), 1);
      });
      activePromises.push(p);

      if (activePromises.length >= CONCURRENCY_LIMIT) {
        await Promise.race(activePromises);
      }
    }

    await Promise.all(activePromises);

    if (successfulResults.length > 0) {
      onNewCarriers(successfulResults);
    }

    setIsRunning(false);
    isRunningRef.current = false;
    setLogs(prev => [...prev, `✅ Batch Job Complete. Found ${successfulResults.length} records.`]);
    setLogs(prev => [...prev, `💾 Database: ${dbSaveCount} records persisted to Supabase`]);

    if (onFinish && successfulResults.length > 0) {
      setLogs(prev => [...prev, `🚀 Transitioning to automatic insurance extraction...`]);
      setTimeout(() => {
        onFinish();
      }, 1500);
    }
  };

  const handleDownload = () => {
    if (scrapedData.length === 0) return;
    downloadCSV(scrapedData);
  };

  return (
    <div className="p-8 h-screen flex flex-col overflow-hidden relative">
      
      {showUpgradeModal && (
        <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 p-8 rounded-2xl max-w-md text-center shadow-2xl animate-in zoom-in duration-200">
              <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-400">
                 <Lock size={32} />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Daily Limit Reached</h2>
              <p className="text-slate-400 mb-6">
                You've hit your limit of {user.dailyLimit.toLocaleString()} records. Upgrade your plan to extract unlimited data.
              </p>
              <div className="flex gap-4 justify-center">
                <button onClick={() => setShowUpgradeModal(false)} className="px-4 py-2 text-slate-400 hover:text-white">Close</button>
                <button onClick={onUpgrade} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold">View Plans</button>
              </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Live Scraper</h1>
          <p className="text-slate-400">Automated FMCSA Extraction Engine with Supabase Integration</p>
        </div>
        <div className="flex gap-4">
           {scrapedData.length > 0 && (
            <button 
              onClick={handleDownload}
              className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-all"
            >
              <Download size={20} />
              Export Batch
            </button>
           )}
          <button
            onClick={toggleRun}
            className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/25 ${
              isRunning 
              ? 'bg-red-500 hover:bg-red-600 text-white' 
              : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {isRunning ? <><Pause size={20} /> Stop</> : <><Play size={20} /> Start Extraction</>}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
        
        <div className="col-span-12 lg:col-span-4 space-y-6 overflow-y-auto pr-2">
          
          <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl space-y-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Activity className="text-indigo-400" /> 
              Search Parameters
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Start MC Number</label>
                <input 
                  type="text" 
                  value={config.startPoint}
                  onChange={(e) => setConfig({...config, startPoint: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="e.g. 1580000"
                  disabled={isRunning}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Number of Records</label>
                <input 
                  type="number" 
                  value={config.recordCount}
                  onChange={(e) => setConfig({...config, recordCount: parseInt(e.target.value)})}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  disabled={isRunning}
                />
              </div>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-700">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Connection Mode</label>
                <div className="space-y-3">
                  <label className="flex items-center justify-between cursor-pointer group">
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={16} className={config.useProxy ? 'text-green-400' : 'text-slate-600'} />
                        <span className={`text-sm ${config.useProxy ? 'text-white' : 'text-slate-400'}`}>Use Secure Proxy</span>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={config.useProxy} 
                        onChange={(e) => setConfig({...config, useProxy: e.target.checked})}
                        className="w-4 h-4 rounded border-slate-600 text-indigo-600 bg-slate-900" 
                        disabled={isRunning}
                      />
                  </label>
                  <p className="text-[10px] text-slate-500">
                    {config.useProxy 
                      ? "Routes requests through our servers. Best for compatibility." 
                      : "Direct connection. Requires VPN and CORS extension. Fastest."}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-700 space-y-3">
                <label className="text-sm font-medium text-slate-400">Target Entities</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={config.includeCarriers} 
                      onChange={(e) => setConfig({...config, includeCarriers: e.target.checked})}
                      className="w-4 h-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-900" 
                      disabled={isRunning}
                    />
                    <span className="text-white">Carriers</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={config.includeBrokers} 
                      onChange={(e) => setConfig({...config, includeBrokers: e.target.checked})}
                      className="w-4 h-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-900" 
                      disabled={isRunning}
                    />
                    <span className="text-white">Brokers</span>
                  </label>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-700">
                <label className="flex items-center gap-2 cursor-pointer mb-4">
                    <input 
                      type="checkbox" 
                      checked={config.onlyAuthorized} 
                      onChange={(e) => setConfig({...config, onlyAuthorized: e.target.checked})}
                      className="w-4 h-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-900" 
                      disabled={isRunning}
                    />
                    <span className="text-white">Only Authorized Status</span>
                </label>
                
                <div className="bg-slate-900 p-3 rounded-lg border border-slate-700 opacity-50">
                    <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-xs text-slate-400">Mock Mode (Simulation)</span>
                        <input 
                          type="checkbox" 
                          checked={config.useMockData} 
                          onChange={(e) => setConfig({...config, useMockData: e.target.checked})}
                          className="w-4 h-4 rounded border-slate-600 text-indigo-600 bg-slate-900" 
                          disabled={isRunning}
                        />
                    </label>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl">
             <div className="flex justify-between text-sm mb-2">
               <span className="text-slate-400">Batch Progress</span>
               <span className="text-white font-bold">{progress}%</span>
             </div>
             <div className="w-full bg-slate-900 rounded-full h-2.5 mb-6">
               <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
             </div>

             <div className="space-y-4">
               <div className="flex justify-between items-center text-sm border-t border-slate-700 pt-4">
                 <div className="flex flex-col">
                   <span className="text-slate-500 text-xs">Daily Limit Usage</span>
                   <div className="flex items-center gap-1">
                     <span className={`font-bold ${user.recordsExtractedToday >= user.dailyLimit ? 'text-red-400' : 'text-white'}`}>
                      {user.recordsExtractedToday.toLocaleString()}
                     </span>
                     <span className="text-slate-500">/ {user.dailyLimit.toLocaleString()}</span>
                   </div>
                 </div>
                 <div className="flex flex-col items-end">
                   <span className="text-slate-500 text-xs">Batch Extracted</span>
                   <span className="text-white font-bold">{scrapedData.length}</span>
                 </div>
               </div>

               <div className="flex justify-between items-center text-sm border-t border-slate-700 pt-4">
                 <div className="flex items-center gap-2">
                   <Database size={16} className="text-emerald-400" />
                   <span className="text-slate-500 text-xs">Saved to Supabase</span>
                 </div>
                 <span className="text-emerald-400 font-bold">{dbSaveCount}</span>
               </div>
             </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-8 flex flex-col gap-6 h-full min-h-0">
          
          <div className="flex-1 bg-slate-950 rounded-2xl border border-slate-800 font-mono text-sm p-4 overflow-y-auto custom-scrollbar relative">
             <div className="absolute top-0 left-0 right-0 bg-slate-900/90 backdrop-blur p-2 border-b border-slate-800 flex items-center justify-between px-4 sticky z-10">
                <div className="flex items-center gap-2">
                  <TerminalIcon size={14} className="text-slate-400" />
                  <span className="text-slate-400 text-xs">System Console</span>
                </div>
                <div className="flex items-center gap-2">
                   {config.useProxy ? (
                     <>
                      <ShieldCheck size={12} className="text-green-500" />
                      <span className="text-[10px] text-slate-500">Proxy Active</span>
                     </>
                   ) : (
                     <>
                      <Zap size={12} className="text-yellow-500" />
                      <span className="text-[10px] text-yellow-500">Direct Connect</span>
                     </>
                   )}
                </div>
             </div>
             <div className="mt-8 space-y-1">
               {logs.length === 0 && <span className="text-slate-600 italic">Ready to initialize...</span>}
               {logs.map((log, i) => (
                 <div key={i} className={`pb-1 border-b border-slate-900/50 ${log.includes('[Error]') || log.includes('[Fail]') ? 'text-red-400' : log.includes('[Success]') ? 'text-green-400' : log.includes('LIMIT REACHED') ? 'text-red-500 font-bold' : 'text-slate-300'}`}>
                   <span className="opacity-50 mr-2">{new Date().toLocaleTimeString().split(' ')[0]}</span>
                   {log}
                 </div>
               ))}
               <div ref={logsEndRef} />
             </div>
          </div>

          <div className="h-72 bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-700 bg-slate-800/80 flex justify-between items-center">
              <h3 className="font-bold text-white text-sm">Live Results Preview</h3>
              <span className="text-xs text-slate-500">{scrapedData.length} records found</span>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-sm text-slate-400">
                <thead className="bg-slate-900 text-slate-200 sticky top-0">
                  <tr>
                    <th className="p-3 font-medium text-xs uppercase tracking-wider">MC#</th>
                    <th className="p-3 font-medium text-xs uppercase tracking-wider">Legal Name</th>
                    {/* FIXED: Added Address Header */}
                    <th className="p-3 font-medium text-xs uppercase tracking-wider">Address</th>
                    <th className="p-3 font-medium text-xs uppercase tracking-wider">Type</th>
                    <th className="p-3 font-medium text-xs uppercase tracking-wider">Status</th>
                    <th className="p-3 font-medium text-xs uppercase tracking-wider">Email</th>
                    <th className="p-3 font-medium text-xs uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {scrapedData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-600">
                        No data extracted yet.
                      </td>
                    </tr>
                  ) : (
                    scrapedData.slice().reverse().map((row, i) => (
                      <tr key={i} className="hover:bg-slate-700/50 transition-colors">
                        <td className="p-3 font-mono text-white">{row.mcNumber}</td>
                        <td className="p-3 truncate max-w-[150px]" title={row.legalName}>{row.legalName}</td>
                        {/* FIXED: Display full physical address */}
                        <td className="p-3 truncate max-w-[200px] text-xs" title={row.physicalAddress || row.address}>
                          {row.physicalAddress || row.address || '-'}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.entityType.includes('BROKER') ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'}`}>
                            {row.entityType || 'UNKNOWN'}
                          </span>
                        </td>
                        <td className="p-3">
                          {row.status.includes('AUTHORIZED') && !row.status.includes('NOT AUTHORIZED') ? (
                            <div className="flex items-center gap-1 text-green-400">
                              <CheckCircle2 size={14} />
                              <span className="text-[10px]">Auth</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-red-400">
                              <AlertCircle size={14} />
                              <span className="text-[10px]">Not Auth</span>
                            </div>
                          )}
                        </td>
                        <td className="p-3 truncate max-w-[150px]" title={row.email}>{row.email || '-'}</td>
                        <td className="p-3 font-mono">{row.dateScraped}</td>
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
  );
};
