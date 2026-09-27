import React, { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Building2, Users, AlertTriangle, ArrowRightLeft,
  Activity, Stethoscope, Bed, Pill, TrendingUp, ShieldAlert, CheckCircle2, WifiOff,
  Truck, Clock, Cpu
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mock.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'mock-key';
const supabase = createClient(supabaseUrl, supabaseAnonKey);


// --- 30-DAY AI LOGISTICS DEMAND SIMULATION ---
const generateDemandForecast = () => Array.from({ length: 30 }, (_, i) => {
  const day = i + 1;
  const isHistorical = day <= 15;
  const basePattern = 200 + Math.sin(day / 2) * 60; // Base seasonal sine wave

  if (isHistorical) {
    return {
      day: `Day ${day}`,
      historical: Math.round(basePattern + (Math.random() * 30 - 15)),
      predicted: null
    };
  } else {
    // Model predicts a massive localized viral outbreak spike between days 20 and 26
    const viralSpike = (day > 19 && day < 27) ? 220 : 0;
    return {
      day: `Day ${day}`,
      historical: null,
      // Link the predicted line dot to the last historical dot seamlessly
      predicted: day === 16 ? Math.round(basePattern + (Math.random() * 30 - 15)) : Math.round(basePattern + viralSpike + (Math.random() * 40 - 20))
    };
  }
});
const mockDemandData = generateDemandForecast();
// ---------------------------------------------

function App() {
  const [loading, setLoading] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);
  const [telemetry, setTelemetry] = useState([]);
  const [metrics, setMetrics] = useState({ phcs: 0, shortages: 0, transfers: 0 });
  const [activeTransfers, setActiveTransfers] = useState([]);
  const [aiWarnings, setAiWarnings] = useState([]);
  const [initiatedIds, setInitiatedIds] = useState({});
  const [activeAlert, setActiveAlert] = useState(null);
  const [autoMode, setAutoMode] = useState(false);

  const applyFallbackMockData = () => {
    setMetrics({ phcs: 1482, shortages: 43, transfers: 5 });
    setTelemetry([
      { id: 'PHC-001', name: 'Metro Central PHC', code: 'MC-101', district: 'Central', medStock: 24, beds: '48/50', staff: '8', nurses: 12, footfall: 450, status: 'Critical' },
      { id: 'PHC-002', name: 'Westside Clinic', code: 'WC-202', district: 'West', medStock: 82, beds: '30/40', staff: '10', nurses: 15, footfall: 120, status: 'Stable' }
    ]);
    setAiWarnings([
      { id: 1, phc_id: 'PHC-001', type: 'stockout', message: 'Metro Central PHC faces CRITICAL paracetamol stockout in 1.4 days.', recommendation: 'Risk Level: CRITICAL. Requires dynamic AI routing.' }
    ]);
    setActiveTransfers([
      { id: 'TR-100', destination_phc_id: 'PHC-001', resource_description: '350 units of multi-spectrum medicine & 2 emergency field staff', status: 'IN_TRANSIT' }
    ]);
  };

  const fetchDashboardData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setOfflineMode(false);
    try {
      const { data: telemetryData, error: telemetryError } = await supabase
        .from('phc_telemetry_live')
        .select('*, phc_nodes ( phc_name, phc_code, district )')
        .order('timestamp', { ascending: false });

      if (telemetryError) throw telemetryError;

      const { data: forecastsData, error: forecastsError } = await supabase
        .from('ai_stock_forecasts')
        .select('*, phc_nodes ( phc_name )')
        .order('forecast_timestamp', { ascending: false })
        .limit(6);

      if (forecastsError) throw forecastsError;

      const { count: phcCount, error: phcError } = await supabase
        .from('phc_nodes')
        .select('id', { count: 'exact' });

      if (phcError) throw phcError;

      const { count: lowStockCount, error: lowStockError } = await supabase
        .from('phc_telemetry_live')
        .select('id', { count: 'exact' })
        .lt('medicine_stock_percentage', 30);

      if (lowStockError) throw lowStockError;

      const { data: transfersData, error: transfersError } = await supabase
        .from('resource_redistribution_orders')
        .select('*')
        .in('status', ['RECOMMENDED', 'APPROVED', 'IN_TRANSIT'])
        .order('created_at', { ascending: false });

      if (transfersError) throw transfersError;

      const { data: alertData, error: alertError } = await supabase
        .from('regional_alerts')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      console.log("Fetched Alert Data:", alertData, alertError);

      setActiveAlert(alertData || null);

      let localTelemetryMap = new Map();

      if (telemetryData) {
        telemetryData.forEach(item => {
          if (!localTelemetryMap.has(item.phc_id)) {
            localTelemetryMap.set(item.phc_id, item);
          }
        });

        const formattedTelemetry = Array.from(localTelemetryMap.values()).map(item => ({
          id: item.phc_id,
          name: item.phc_nodes?.phc_name || 'Unknown Facility',
          code: item.phc_nodes?.phc_code || item.phc_id,
          district: item.phc_nodes?.district || 'Unknown',
          medStock: item.medicine_stock_percentage ?? 0,
          beds: `${item.beds_occupied || 0}/${item.beds_total || 0}`,
          staff: `${item.doctors_present || 0}`,
          nurses: item.nurses_present || 0,
          footfall: item.daily_patient_footfall || 0,
          status: item.medicine_stock_percentage < 30 ? 'Critical' : 'Stable'
        }));
        setTelemetry(formattedTelemetry);
      }

      if (forecastsData) {
        const formattedWarnings = forecastsData.map(item => ({
          id: item.id,
          phc_id: item.phc_id,
          type: item.risk_level === 'CRITICAL' ? 'stockout' : 'warning',
          message: `${item.phc_nodes?.phc_name || 'Facility'} faces stockout in ${item.predicted_days_to_stockout} days.`,
          recommendation: `Risk Level: ${item.risk_level}. Requires immediate AI intervention.`
        }));
        setAiWarnings(formattedWarnings);
      }

      if (transfersData) {
        setActiveTransfers(transfersData);
      }

      setMetrics({
        phcs: phcCount || 0,
        shortages: lowStockCount || 0,
        transfers: transfersData?.length || 0
      });

    } catch (err) {
      console.warn('Network error detected. Enabling Offline Fallback Mode.', err);
      setOfflineMode(true);
      applyFallbackMockData();
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();

    // Live subscriptions
    const sub1 = supabase.channel('telemetry_live').on('postgres_changes', { event: '*', schema: 'public', table: 'phc_telemetry_live' }, () => fetchDashboardData(true)).subscribe();
    const sub2 = supabase.channel('forecasts_live').on('postgres_changes', { event: '*', schema: 'public', table: 'ai_stock_forecasts' }, () => fetchDashboardData(true)).subscribe();
    const sub3 = supabase.channel('orders_live').on('postgres_changes', { event: '*', schema: 'public', table: 'resource_redistribution_orders' }, () => fetchDashboardData(true)).subscribe();
    const sub4 = supabase.channel('nodes_live').on('postgres_changes', { event: '*', schema: 'public', table: 'phc_nodes' }, () => fetchDashboardData(true)).subscribe();

    return () => {
      sub1.unsubscribe();
      sub2.unsubscribe();
      sub3.unsubscribe();
      sub4.unsubscribe();
    };
  }, [fetchDashboardData]);



  const handleSyncAction = async (warning) => {
    if (initiatedIds[warning.id]) return;
    setInitiatedIds(prev => ({ ...prev, [warning.id]: 'loading' }));

    if (offlineMode) {
      setTimeout(() => setInitiatedIds(prev => ({ ...prev, [warning.id]: 'done' })), 1500);
      return;
    }

    try {
      const availableSources = telemetry.filter(t => t.id !== warning.phc_id && t.id);
      let selectedSourceId = null;
      let surplusData = null;

      if (availableSources.length > 0) {
        const bestSource = availableSources.reduce((prev, curr) => (prev.medStock > curr.medStock) ? prev : curr);
        selectedSourceId = bestSource.id;
        surplusData = bestSource;
      }

      const deficitData = telemetry.find(t => t.id === warning.phc_id);

      if (!surplusData || !deficitData) {
        throw new Error("Missing source or destination data for AI calculation.");
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`;

      const promptText = `
        You are a senior medical logistics director AI. 
        Destination Facility Telemetry:
        - Medicine Stock: ${deficitData.medStock}%
        - Beds (Occupied/Cap): ${deficitData.beds}
        - Doctors/Nurses: ${deficitData.staff} Doctors, ${deficitData.nurses} Nurses
        - Daily Footfall: ${deficitData.footfall}
        
        Origin Facility Telemetry (Surplus available):
        - Medicine Stock: ${surplusData.medStock}%
        - Beds (Occupied/Cap): ${surplusData.beds}
        - Doctors/Nurses: ${surplusData.staff} Doctors, ${surplusData.nurses} Nurses
        
        Environmental Context:
        - Seasonal Dengue/Viral surge alert: Active (+40% projected patient footfall this week).
        - Estimated ambulance transit time: 35 minutes across Hyderabad traffic.
        - Staff burnout factor: High patient-to-doctor ratio at destination.
        ${activeAlert ? `- An active regional disease surge is in effect: ${activeAlert.active_disease}. This causes a demand multiplier of ${activeAlert?.demand_multiplier || 1.0}x for ${activeAlert.critical_supplies}. Account for this regional disease surge when calculating the transfer units and emergency staff.` : ''}
        
        Decide how many units of medicine and staff to transfer without causing a deficit at the origin.
        Return ONLY valid JSON with exactly three keys:
        - medicine_transfer_units (integer)
        - staff_transfer_count (integer)
        - ai_reasoning (string: concise 1-2 sentence explanation of allocation based on surge/workload)
      `;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: promptText }]
          }],
          generationConfig: { response_mime_type: "application/json" }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const responseText = data.candidates[0].content.parts[0].text.trim();
      const aiData = JSON.parse(responseText);

      console.log("Gemini Output:", aiData);
      console.log("AI Clinical Reasoning:", aiData.ai_reasoning);

      // Include ai_reasoning in the text payload so it's safely inserted into Postgres without schema issues
      const resourceDescPayload = `${aiData.medicine_transfer_units} units of multi-spectrum medicine & ${aiData.staff_transfer_count} emergency field staff. AI Note: ${aiData.ai_reasoning}`;

      const payload = {
        destination_phc_id: warning.phc_id,
        resource_description: resourceDescPayload,
        status: 'RECOMMENDED'
      };

      if (selectedSourceId) {
        payload.source_phc_id = selectedSourceId;
      }

      const { error } = await supabase.from('resource_redistribution_orders').insert([payload]);

      if (error) {
        console.error("Insert Error:", error);
        throw error;
      }

      await fetchDashboardData(true);

      setInitiatedIds(prev => {
        const next = { ...prev };
        delete next[warning.id];
        return next;
      });

    } catch (error) {
      console.error("Gemini API Error:", error);
      setInitiatedIds(prev => {
        const next = { ...prev };
        delete next[warning.id];
        return next;
      });
      return;
    }
  };

  const handleCancelTransfer = async (orderId) => {
    setActiveTransfers(prev => prev.filter(t => t.id !== orderId));
    setMetrics(prev => ({ ...prev, transfers: Math.max(0, prev.transfers - 1) }));

    if (offlineMode) return;

    try {
      const { error } = await supabase.from('resource_redistribution_orders').delete().eq('id', orderId);
      if (error) throw error;
      await fetchDashboardData(true);
    } catch (err) {
      console.error("Failed to cancel order:", err);
      alert("Failed to cancel transfer. Re-syncing database.");
      fetchDashboardData(true);
    }
  };

  const getDynamicSourceNode = (destId) => {
    const pool = telemetry.filter(t => t.id !== destId);
    if (pool.length === 0) return 'Central Reserve Bank';
    const best = pool.reduce((prev, curr) => (prev.medStock > curr.medStock) ? prev : curr);
    return best.name;
  };

  const getDeterministicETA = (uuidStr, index) => {
    const etas = ['45 mins', '1.2 hrs', '25 mins', '1.8 hrs', '2.5 hrs'];
    if (!uuidStr) return etas[index % 5];
    const charCode = uuidStr.charCodeAt(uuidStr.length - 1);
    return etas[charCode % etas.length];
  };

  useEffect(() => {
    if (!autoMode || offlineMode || loading) return;
    // Find the first stockout warning that isn't already processing AND doesn't have an active order
    const criticalWarning = aiWarnings.find(w => {
      if (w.type !== 'stockout' || initiatedIds[w.id]) return false;
      const hasActiveOrder = activeTransfers.some(order => order.destination_phc_id === w.phc_id);
      return !hasActiveOrder;
    });

    if (criticalWarning) {
      console.log('--- AUTO-DISPATCH INITIATED FOR:', criticalWarning.phc_id, '---');
      handleSyncAction(criticalWarning);
    }
  }, [autoMode, aiWarnings, activeTransfers, initiatedIds, offlineMode, loading]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-blue-500/30">
      <nav className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 space-x-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400">
                Federated Health
              </h1>
              <p className="text-xs text-neutral-500 font-medium tracking-wider">NATIONAL RESOURCE PLATFORM</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {offlineMode ? (
              <div className="flex items-center gap-2 text-sm text-yellow-500 bg-yellow-500/10 px-3 py-1.5 rounded-full border border-yellow-500/20">
                <WifiOff className="w-4 h-4" />
                Offline Mode (Local Fallback)
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-green-400 bg-green-400/10 px-3 py-1.5 rounded-full border border-green-400/20">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                Live Sync: Active
              </div>
            )}
          </div>
        </div>
      </nav>

      {activeAlert && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 shadow-lg shadow-amber-500/5 backdrop-blur-md">
            <div className="flex items-start gap-4">
              <div className="bg-amber-500/20 p-2 rounded-lg mt-1">
                <ShieldAlert className="w-6 h-6 text-amber-500 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-amber-500 font-bold tracking-wide text-sm flex items-center gap-2">
                  🌧️ Active Alert: {activeAlert.season_name} Season — <span className="text-white">{activeAlert.active_disease}</span>
                </h3>
                <p className="text-neutral-300 text-sm">
                  Demand Multiplier: <span className="font-semibold text-red-400">{activeAlert.demand_multiplier}x</span> <span className="text-neutral-500 text-xs">(+27% Surge)</span>
                </p>
                <p className="text-neutral-300 text-sm">
                  Priority Supplies: <span className="font-medium text-amber-200/90">{activeAlert.critical_supplies}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Top KPI Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricCard
            title="Total Active PHCs"
            value={loading && metrics.phcs === 0 ? '-' : metrics.phcs.toLocaleString()}
            icon={<Building2 className="w-5 h-5 text-blue-400" />}
            trend="Monitored seamlessly in network"
            gradient="from-blue-500/20 to-blue-600/5"
            border="border-blue-500/20"
          />
          <MetricCard
            title="Critical Shortages"
            value={loading && metrics.shortages === 0 ? '-' : metrics.shortages}
            icon={<AlertTriangle className="w-5 h-5 text-red-400" />}
            trend="PHCs with stock < 30%"
            gradient="from-red-500/20 to-red-600/5"
            border="border-red-500/20"
          />
          <MetricCard
            title="Active Transfers"
            value={loading && metrics.transfers === 0 ? '-' : metrics.transfers}
            icon={<ArrowRightLeft className="w-5 h-5 text-emerald-400" />}
            trend="Active redistribution orders"
            gradient="from-emerald-500/20 to-emerald-600/5"
            border="border-emerald-500/20"
          />
        </div>

        {/* 30-Day AI Demand Forecast Banner */}
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 to-purple-500/10 pointer-events-none" />
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold flex items-center gap-2 relative z-10">
              <TrendingUp className="w-5 h-5 text-purple-400" />
              30-Day Network Demand AI Forecast
            </h2>
            <div className="text-xs text-neutral-400 bg-neutral-950 px-3 py-1.5 rounded-full border border-purple-500/30 flex items-center gap-2 shadow-inner shadow-purple-500/10">
              <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
              Predictive Models: Tracking Viral Vector
            </div>
          </div>

          <div className="h-[280px] w-full relative z-10">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockDemandData} margin={{ top: 5, right: 25, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                <XAxis
                  dataKey="day"
                  stroke="#525252"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#737373' }}
                  interval={3}
                />
                <YAxis
                  stroke="#525252"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#737373' }}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#171717', borderColor: '#404040', borderRadius: '12px', color: '#fff', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                  itemStyle={{ color: '#e5e5e5', fontSize: '13px', fontWeight: '500' }}
                  labelStyle={{ color: '#a3a3a3', marginBottom: '4px', fontSize: '12px' }}
                />
                <Line
                  type="monotone"
                  dataKey="historical"
                  name="Verified Network Demand"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  dot={{ r: 0 }}
                  activeDot={{ r: 6, fill: '#3b82f6', stroke: '#171717', strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  name="AI Projected Demand Spike"
                  stroke="#a855f7"
                  strokeWidth={3}
                  strokeDasharray="4 4"
                  dot={{ r: 0 }}
                  activeDot={{ r: 6, fill: '#a855f7', stroke: '#171717', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Live PHC Telemetry Table */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Users className="w-5 h-5 text-neutral-400" />
                  Live PHC Telemetry
                </h2>
                <button className="text-sm text-blue-400 hover:text-blue-300 transition-colors">View All Database Map</button>
              </div>

              <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-neutral-400 uppercase bg-neutral-900 border-b border-neutral-800">
                      <tr>
                        <th className="px-6 py-4 font-medium">Facility</th>
                        <th className="px-6 py-4 font-medium">Med Stock %</th>
                        <th className="px-6 py-4 font-medium">Bed Cap.</th>
                        <th className="px-6 py-4 font-medium">Total Docs.</th>
                        <th className="px-6 py-4 font-medium">Daily Footfall</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/50">
                      {loading && telemetry.length === 0 ? (
                        <tr><td colSpan={5} className="px-6 py-12 text-center text-neutral-500">
                          <div className="flex justify-center mb-3">
                            <Activity className="w-6 h-6 text-indigo-500 animate-pulse" />
                          </div>
                          Pinging Secure Relays...
                        </td></tr>
                      ) : telemetry.length === 0 ? (
                        <tr><td colSpan={5} className="px-6 py-8 text-center text-neutral-500">No telemetry recorded yet.</td></tr>
                      ) : (
                        telemetry.map((row) => (
                          <tr key={row.id} className="hover:bg-neutral-800/30 transition-colors">
                            <td className="px-6 py-4">
                              <div className="font-medium text-white">{row.name}</div>
                              <div className="text-xs text-neutral-500">{row.district} | {row.code}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-full bg-neutral-800 rounded-full h-1.5 max-w-[60px]">
                                  <div
                                    className={`h-1.5 rounded-full ${row.medStock < 30 ? 'bg-red-500' : row.medStock < 60 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                                    style={{ width: `${row.medStock}%` }}
                                  ></div>
                                </div>
                                <span className={row.medStock < 30 ? 'text-red-400 font-medium' : 'text-neutral-300'}>{row.medStock}%</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <Bed className="w-4 h-4 text-neutral-500" />
                                <span className={String(row.beds).startsWith('0') ? 'text-neutral-300 font-medium' : 'text-neutral-300 border border-neutral-700/50 px-2 py-0.5 rounded-md bg-neutral-800/20'}>
                                  {row.beds}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <Stethoscope className="w-4 h-4 text-neutral-500" />
                                <span className="text-neutral-300">{row.staff} Docs (+{row.nurses} Nurses)</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <TrendingUp className={`w-4 h-4 ${row.footfall > 150 ? 'text-yellow-400' : 'text-emerald-500'}`} />
                                <span className={row.footfall > 150 ? 'text-yellow-400 font-medium' : 'text-neutral-300'}>{row.footfall}</span>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Live Logistics & Routing Panel */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Truck className="w-5 h-5 text-neutral-400" />
                  Live Logistics & Routing
                </h2>
                <button
                  onClick={() => setAutoMode(!autoMode)}
                  className={`text-xs px-3 py-1 rounded-full border flex items-center gap-1.5 transition-colors ${autoMode ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-neutral-500 bg-neutral-900 border-neutral-800'}`}
                >
                  <Cpu className={`w-3.5 h-3.5 ${autoMode ? 'text-emerald-400 animate-pulse' : 'text-indigo-400'}`} />
                  {autoMode ? 'Auto-Dispatch Active' : 'AI Automated Dispatch'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeTransfers.length === 0 ? (
                  <div className="col-span-full bg-neutral-900/40 border border-neutral-800/50 rounded-2xl p-8 text-center text-sm text-neutral-500 flex flex-col items-center justify-center shadow-inner">
                    <Truck className="w-8 h-8 text-neutral-600 mb-2 opacity-50" />
                    No Active Transfers
                    <span className="text-xs text-neutral-600 mt-1 block">Logistics grid is currently idling natively</span>
                  </div>
                ) : (
                  activeTransfers.map((order, index) => {
                    const destName = telemetry.find(t => t.id === order.destination_phc_id)?.name || 'Central Hospital';
                    const srcName = order.source_phc_id
                      ? (telemetry.find(t => t.id === order.source_phc_id)?.name || 'Regional Reserve')
                      : getDynamicSourceNode(order.destination_phc_id);

                    const eta = getDeterministicETA(order.id, index);

                    return (
                      <div key={order.id || index} className="bg-neutral-900/80 border border-neutral-800/80 rounded-2xl p-5 shadow-xl hover:border-blue-500/30 transition-colors group">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-2 bg-neutral-950 px-3 py-1.5 rounded-lg border border-neutral-800">
                            <div className={`w-2 h-2 rounded-full ${order.status === 'IN_TRANSIT' ? 'bg-blue-400 animate-pulse' : 'bg-yellow-400 animate-pulse'}`} />
                            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                              {order.status.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-medium bg-neutral-800/30 px-2.5 py-1 rounded-md">
                            <Clock className="w-3.5 h-3.5" /> {eta}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="relative pl-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-neutral-800">
                            {/* Source */}
                            <div className="relative mb-5">
                              <div className="absolute -left-[27px] top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-neutral-950" />
                              <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-0.5">Origin Setup</p>
                              <h4 className="text-sm font-medium text-white">{srcName}</h4>
                            </div>

                            {/* Destination */}
                            <div className="relative">
                              <div className="absolute -left-[27px] top-1 w-2.5 h-2.5 rounded-full bg-red-400 ring-4 ring-neutral-950" />
                              <p className="text-[10px] text-red-300 font-bold uppercase tracking-wider mb-0.5">Drop-off Relay</p>
                              <h4 className="text-sm font-medium text-white">{destName}</h4>
                            </div>
                          </div>

                          <div className="pt-4 border-t border-neutral-800/50 flex flex-col gap-3">
                            <div className="flex flex-col gap-1.5">
                              <span className="text-xs text-neutral-400 flex items-start gap-1.5 font-medium leading-relaxed">
                                <Pill className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                                {order.resource_description.split('AI Note:')[0]}
                              </span>
                              {order.resource_description.includes('AI Note:') && (
                                <span className="text-[11px] text-indigo-300/80 italic flex items-start gap-1.5 pl-5 pr-2">
                                  <Cpu className="w-3 h-3 shrink-0 mt-0.5" />
                                  "{order.resource_description.split('AI Note:')[1].trim()}"
                                </span>
                              )}
                            </div>
                            <div className="flex gap-2 justify-end mt-1">
                              <button
                                onClick={() => handleCancelTransfer(order.id)}
                                className="text-red-400 hover:text-red-300 text-xs font-medium px-2 py-1 bg-red-500/10 hover:bg-red-500/20 rounded-md transition-colors border border-red-500/20"
                              >
                                Cancel
                              </button>
                              <button className="text-blue-400 hover:text-blue-300 text-xs font-medium px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 rounded-md transition-colors">
                                Track Matrix
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-indigo-400" />
              AI Risk Forecasts
            </h2>

            <div className="space-y-4">
              {loading && aiWarnings.length === 0 ? (
                <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 text-center text-sm text-neutral-500">
                  <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-3" />
                  Generating insights from federated network...
                </div>
              ) : aiWarnings.length === 0 ? (
                <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 text-center text-sm text-neutral-500 flex flex-col items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500/80 mb-2" />
                  All parameters stable across model predictions.
                </div>
              ) : (
                aiWarnings.map((warning) => {

                  // Check if this PHC already has an active order tracking towards it
                  const hasActiveOrder = activeTransfers.some(order => order.destination_phc_id === warning.phc_id);
                  const isProcessing = initiatedIds[warning.id] === 'loading';

                  return (
                    <div key={warning.id} className="relative group">
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-red-500/20 to-indigo-500/20 rounded-2xl blur opacity-50 group-hover:opacity-100 transition duration-500"></div>
                      <div className="relative bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-lg">
                        <div className="flex gap-4">
                          <div className={`mt-1 rounded-full p-2 h-fit ${warning.type === 'stockout' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'}`}>
                            {warning.type === 'stockout' ? <Pill className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                          </div>
                          <div className="space-y-2 w-full">
                            <h3 className="font-medium text-sm leading-tight text-white">{warning.message}</h3>
                            <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800/50">
                              <p className="text-xs text-neutral-400 flex gap-2 items-start">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                <span className="leading-relaxed font-medium text-emerald-500/90">{warning.recommendation}</span>
                              </p>
                            </div>

                            <button
                              onClick={() => handleSyncAction(warning)}
                              disabled={hasActiveOrder || isProcessing}
                              className={`w-full mt-2 border text-xs font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2 ${hasActiveOrder
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 cursor-not-allowed'
                                : isProcessing
                                  ? 'bg-white/10 text-white/50 border-white/5 cursor-wait'
                                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'
                                }`}
                            >
                              {hasActiveOrder ? (
                                <>Transfer In Progress <CheckCircle2 className="w-3 h-3" /></>
                              ) : isProcessing ? (
                                <>Agent Reasoning... <Cpu className="w-3 h-3 animate-pulse" /></>
                              ) : (
                                <>Approve AI Action <ArrowRightLeft className="w-3 h-3" /></>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

function MetricCard({ title, value, icon, trend, gradient, border }) {
  return (
    <div className={`relative overflow-hidden bg-neutral-900/50 backdrop-blur-sm border ${border} rounded-2xl p-6 shadow-lg group`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-50 group-hover:opacity-100 transition-opacity duration-300`} />
      <div className="relative flex justify-between items-start">
        <div className="space-y-3">
          <p className="text-sm font-medium text-neutral-400">{title}</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-4xl font-bold tracking-tight text-white">{value}</h3>
          </div>
          <p className="text-xs text-neutral-500 flex items-center gap-1 font-medium">{trend}</p>
        </div>
        <div className="p-3 bg-black/20 rounded-xl border border-white/5">
          {icon}
        </div>
      </div>
    </div>
  );
}

export default App;
