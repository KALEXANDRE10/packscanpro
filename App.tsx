
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Plus, Download, ArrowLeft, Loader2, Scan, Trash2, ChevronRight, Upload, 
  Settings, Save, Mail, LayoutList, Camera, MapPin, Edit2, CheckCircle2, 
  Store, Map as MapUi, Send, Tag, Box, Building, LogOut, ShieldCheck, BarChart3, FileText,
  X, PieChart, MapPinned, Layers, UserCircle2, Users, Search, Filter, Lock, 
  CheckCircle, AlertCircle, Briefcase, Share2, Copy, FileJson, Cloud, CloudOff
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { InspectionList, ProductEntry, ListStatus, User, AnalyticsStats } from './types';
import { SmartScanner } from './components/CameraCapture';
import { ManualUpload } from './components/ManualUpload';
import { extractDataFromPhotos } from './services/geminiService';
import * as XLSX from 'xlsx';

// Configuração Cloud - Prioriza variáveis de ambiente da Vercel
const supabaseUrl = process.env.SUPABASE_URL || 'https://oocyvbexigpaqgucqcwc.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_UE3CY9AkCcnRTPNVyvPQaQ_2DNwzY_w';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const getCnpjRoot = (cnpj: string) => {
  if (!cnpj) return "";
  const digits = cnpj.replace(/\D/g, '');
  return digits.length >= 8 ? digits.substring(0, 8) : digits;
};

const generateId = () => Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

const App: React.FC = () => {
  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoginView, setIsLoginView] = useState(true);
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', role: 'usuario' as 'admin' | 'usuario' });
  const [isSyncing, setIsSyncing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // App State
  const [lists, setLists] = useState<InspectionList[]>([]);
  const [internalBase, setInternalBase] = useState<string[]>([]);
  
  const [activeView, setActiveView] = useState<'home' | 'create-list' | 'list-detail' | 'scanner' | 'gallery-upload' | 'reports'>('home');
  const [currentListId, setCurrentListId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [listForm, setListForm] = useState({ name: '', establishment: '', city: '' });
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  
  const isInitialMount = useRef(true);

  // 1. Efeito de Carregamento Inicial
  useEffect(() => {
    const savedUser = localStorage.getItem('packscan_user');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) { console.error("Session restore failed"); }
    }
  }, []);

  // 2. Efeito de Sincronização Cloud
  useEffect(() => {
    if (currentUser && supabase) {
      fetchCloudData();
    }
  }, [currentUser]);

  const fetchCloudData = async () => {
    if (!supabase) return;
    setIsSyncing(true);
    try {
      const { data: listsData, error: listsError } = await supabase
        .from('lists')
        .select('*')
        .order('createdAt', { ascending: false });
      
      if (listsError) throw listsError;
      if (listsData) setLists(listsData as InspectionList[]);
    } catch (e) {
      console.error("Cloud Sync Error:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSyncing(true);

    try {
      if (isLoginView) {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('email', authForm.email.toLowerCase().trim())
          .eq('password', authForm.password)
          .single();

        if (error) {
          setAuthError("E-mail ou senha incorretos.");
        } else if (data) {
          setCurrentUser(data);
          localStorage.setItem('packscan_user', JSON.stringify(data));
          setActiveView('home');
        }
      } else {
        const newUser: User = { 
          id: generateId(), 
          name: authForm.name.toUpperCase(), 
          email: authForm.email.toLowerCase().trim(), 
          password: authForm.password,
          role: 'usuario',
          createdAt: new Date().toISOString()
        };

        const { error } = await supabase.from('users').insert(newUser);
        if (!error) {
          setCurrentUser(newUser);
          localStorage.setItem('packscan_user', JSON.stringify(newUser));
          setActiveView('home');
        } else {
          setAuthError("Erro ao registrar. O e-mail já pode estar em uso.");
        }
      }
    } catch (err) {
      setAuthError("Falha na conexão com o servidor.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !supabase) return;

    const newList: InspectionList = {
      id: generateId(),
      name: listForm.name.toUpperCase(),
      establishment: listForm.establishment.toUpperCase(),
      city: listForm.city.toUpperCase(),
      inspectorName: currentUser.name,
      inspectorId: currentUser.id,
      createdAt: new Date().toISOString(),
      entries: [],
      isClosed: false,
      status: 'executing'
    };

    setIsSyncing(true);
    const { error } = await supabase.from('lists').insert(newList);
    if (!error) {
      setLists(prev => [newList, ...prev]);
      setCurrentListId(newList.id);
      setActiveView('list-detail');
      setListForm({ name: '', establishment: '', city: '' });
    } else {
      alert("Erro de conexão ao criar lista.");
    }
    setIsSyncing(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('packscan_user');
    setCurrentUser(null);
    setActiveView('home');
  };

  const filteredLists = useMemo(() => {
    if (!currentUser) return [];
    return currentUser.role === 'admin' ? lists : lists.filter(l => l.inspectorId === currentUser.id);
  }, [lists, currentUser]);

  const currentList = useMemo(() => lists.find(l => l.id === currentListId), [lists, currentListId]);

  const stats = useMemo((): AnalyticsStats => {
    const userLists = filteredLists;
    const allEntries = userLists.flatMap(l => l.entries || []);
    const cityCounts: Record<string, number> = {};
    const estCounts: Record<string, number> = {};
    
    userLists.forEach(l => {
      cityCounts[l.city] = (cityCounts[l.city] || 0) + (l.entries?.length || 0);
      estCounts[l.establishment] = (estCounts[l.establishment] || 0) + (l.entries?.length || 0);
    });

    return {
      totalEntries: allEntries.length,
      newProspects: allEntries.filter(e => e.isNewProspect).length,
      approvedCount: allEntries.filter(e => e.reviewStatus === 'approved').length,
      citiesCount: Object.keys(cityCounts).length,
      establishmentsCount: Object.keys(estCounts).length,
      cityBreakdown: Object.entries(cityCounts).map(([name, count]) => ({ name, count })),
      establishmentBreakdown: Object.entries(estCounts).map(([name, count]) => ({ name, count })),
      topBrands: [],
      typeDistribution: [],
      moldingDistribution: []
    };
  }, [filteredLists]);

  const processPhotos = async (photos: string[]) => {
    if (!currentListId || !currentUser || !supabase) return;
    setIsProcessing(true);
    try {
      const data = await extractDataFromPhotos(photos);
      const isNew = !data.cnpj.some(c => internalBase.includes(getCnpjRoot(c)));
      
      const entry: ProductEntry = { 
        id: generateId(), 
        listId: currentListId,
        photos, 
        data, 
        isNewProspect: isNew, 
        checkedAt: new Date().toLocaleString('pt-BR'),
        reviewStatus: 'pending',
        inspectorId: currentUser.id
      };

      const updatedList = lists.find(l => l.id === currentListId);
      if (updatedList) {
        const newEntries = [entry, ...(updatedList.entries || [])];
        
        const { error } = await supabase
          .from('lists')
          .update({ entries: newEntries })
          .eq('id', currentListId);

        if (!error) {
          setLists(prev => prev.map(l => l.id === currentListId ? { ...l, entries: newEntries } : l));
          setActiveView('list-detail');
        } else {
          alert("Erro ao salvar dados no banco de dados.");
        }
      }
    } catch (err: any) {
      console.error("ERRO COMPLETO:", err);
      alert(`Erro na Extração: ${err.message || "Tente novamente mais tarde."}`);
    } finally { setIsProcessing(false); }
  };

  const exportExcel = (list: InspectionList) => {
    if (!list.entries) return;
    const data = list.entries.map(e => ({
      'RAZÃO SOCIAL': e.data.razaoSocial,
      'CNPJ': e.data.cnpj.join(', '),
      'MARCA': e.data.marca,
      'DESCRIÇÃO': e.data.descricaoProduto,
      'FABRICANTE': e.data.fabricanteEmbalagem,
      'STATUS': e.reviewStatus.toUpperCase()
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Levantamento");
    XLSX.writeFile(wb, `PackScan_${list.name}.xlsx`);
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6 font-sans">
        <div className="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] flex flex-col items-center animate-in zoom-in duration-300">
          
          {/* Logo e Icone igual à imagem */}
          <div className="bg-blue-600 w-20 h-20 rounded-[24px] flex items-center justify-center mb-6 shadow-xl shadow-blue-500/30">
            <Scan className="w-10 h-10 text-white" strokeWidth={2.5} />
          </div>
          
          <h1 className="text-3xl font-black italic tracking-tight mb-10 flex gap-2">
            <span className="text-slate-900">PACKSCAN</span>
            <span className="text-blue-600">PRO</span>
          </h1>

          <form onSubmit={handleAuth} className="w-full space-y-4">
            {authError && (
              <div className="bg-rose-50 text-rose-500 text-[10px] font-bold p-3 rounded-xl text-center uppercase tracking-wider animate-pulse">
                {authError}
              </div>
            )}

            {!isLoginView && (
              <div className="relative">
                <input 
                  required 
                  placeholder="NOME" 
                  value={authForm.name} 
                  onChange={e => setAuthForm({...authForm, name: e.target.value})} 
                  className="w-full bg-[#F8FAFC] border-none p-5 rounded-2xl font-bold text-[11px] text-slate-400 placeholder-slate-300 outline-none focus:ring-2 focus:ring-blue-100 transition-all uppercase"
                />
              </div>
            )}

            <div className="relative">
              <input 
                required 
                type="email" 
                placeholder="E-MAIL" 
                value={authForm.email} 
                onChange={e => setAuthForm({...authForm, email: e.target.value})} 
                className="w-full bg-[#F8FAFC] border-none p-5 rounded-2xl font-bold text-[11px] text-slate-400 placeholder-slate-300 outline-none focus:ring-2 focus:ring-blue-100 transition-all uppercase"
              />
            </div>

            <div className="relative">
              <input 
                required 
                type="password" 
                placeholder="SENHA" 
                value={authForm.password} 
                onChange={e => setAuthForm({...authForm, password: e.target.value})} 
                className="w-full bg-[#F8FAFC] border-none p-5 rounded-2xl font-bold text-[11px] text-slate-400 placeholder-slate-300 outline-none focus:ring-2 focus:ring-blue-100 transition-all uppercase"
              />
            </div>

            <button 
              type="submit" 
              disabled={isSyncing}
              className="w-full bg-[#2563EB] text-white py-5 rounded-2xl font-black uppercase text-[11px] tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95 disabled:opacity-50 mt-4"
            >
              {isSyncing ? 'VERIFICANDO...' : isLoginView ? 'ACESSAR SISTEMA' : 'FINALIZAR CADASTRO'}
            </button>
          </form>

          <div className="mt-8">
            <button 
              onClick={() => { setIsLoginView(!isLoginView); setAuthError(null); }} 
              className="text-[9px] font-bold text-slate-400 uppercase tracking-widest hover:text-blue-600 transition-colors"
            >
              {isLoginView ? 'SOLICITAR ACESSO' : 'JÁ POSSUI CONTA? FAZER LOGIN'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-48 text-slate-900 font-sans">
      <header className="bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-[500] px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4 cursor-pointer" onClick={() => { setActiveView('home'); setCurrentListId(null); }}>
          <div className="bg-blue-600 p-2.5 rounded-2xl shadow-lg"><Scan className="w-5 h-5 text-white" /></div>
          <div>
            <h1 className="text-xl font-black uppercase italic tracking-tight leading-none">PackScan <span className="text-blue-600">Pro</span></h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isSyncing ? <Loader2 className="w-2.5 h-2.5 text-blue-500 animate-spin" /> : <Cloud className="w-2.5 h-2.5 text-emerald-500" />}
              <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">{isSyncing ? 'Sincronizando...' : 'Cloud Connected'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-black uppercase leading-none">{currentUser.name}</p>
            <p className="text-[8px] font-bold text-slate-400 uppercase mt-1 tracking-widest">{currentUser.role.toUpperCase()}</p>
          </div>
          <button onClick={handleLogout} className="p-3 bg-rose-50 text-rose-600 rounded-2xl hover:bg-rose-600 hover:text-white transition-all shadow-sm"><LogOut className="w-5 h-5"/></button>
        </div>
      </header>

      {isProcessing && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[2000] flex items-center justify-center animate-in fade-in">
          <div className="bg-white p-12 rounded-[50px] text-center shadow-2xl border-[10px] border-blue-600 max-w-sm mx-auto">
            <Loader2 className="w-16 h-16 text-blue-600 animate-spin mx-auto mb-8" />
            <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">Analisando<br/>Embalagem</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase mt-6 tracking-[0.2em] animate-pulse">Extraindo dados via Gemini 3</p>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-10">
        {activeView === 'home' && (
          <div className="space-y-10 animate-in fade-in">
            <div className="bg-white p-10 rounded-[50px] border border-slate-200 shadow-sm flex flex-col lg:flex-row justify-between items-center gap-8">
              <div>
                <h1 className="text-4xl font-black text-slate-900 uppercase italic tracking-tighter">Painel Operacional</h1>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2">Nuvem sincronizada com a base mestre</p>
              </div>
              <button onClick={() => setActiveView('create-list')} className="bg-slate-900 text-white px-10 py-5 rounded-[22px] font-black text-[9px] uppercase flex items-center gap-4 shadow-xl hover:bg-blue-600 transition-all active:scale-95">
                <Plus className="w-5 h-5" /> Iniciar Nova Lista
              </button>
            </div>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {filteredLists.map(list => (
                <div key={list.id} onClick={() => { setCurrentListId(list.id); setActiveView('list-detail'); }} className="bg-white rounded-[45px] border border-slate-200 p-8 cursor-pointer hover:border-blue-500 hover:shadow-2xl transition-all group relative overflow-hidden flex flex-col">
                  <h3 className="text-2xl font-black text-slate-900 uppercase italic mb-2 group-hover:text-blue-600 transition-colors tracking-tighter">{list.name}</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-2 mb-8"><MapPin className="w-3.5 h-3.5 text-blue-500"/> {list.establishment} • {list.city}</p>
                  <div className="mt-auto pt-6 border-t border-slate-50 flex justify-between items-center text-[10px] font-black text-slate-300 uppercase">
                    <span className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl text-slate-500"><Box className="w-4 h-4" /> {(list.entries || []).length} SKUs</span>
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-2 transition-transform text-blue-500" />
                  </div>
                </div>
              ))}
              {filteredLists.length === 0 && !isSyncing && (
                <div className="col-span-full py-20 text-center bg-white border border-dashed border-slate-200 rounded-[50px]">
                   <p className="text-slate-300 font-black uppercase text-xs italic tracking-widest">Nenhuma lista encontrada na nuvem</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === 'list-detail' && currentList && (
          <div className="space-y-8 animate-in fade-in pb-20">
             <div className="bg-white p-10 rounded-[55px] border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-10">
                  <button onClick={() => { setActiveView('home'); setCurrentListId(null); }} className="text-slate-400 font-black text-[9px] uppercase flex items-center gap-3 hover:text-blue-600 transition-all"><ArrowLeft className="w-4 h-4" /> Voltar</button>
                  <div className="flex gap-2">
                    <button onClick={() => exportExcel(currentList)} className="bg-emerald-500 text-white px-6 py-4 rounded-[22px] font-black text-[9px] uppercase flex items-center gap-3 shadow-lg hover:bg-emerald-600 transition-all shadow-emerald-200"><Download className="w-4 h-4" /> Excel</button>
                  </div>
                </div>
                <div className="flex flex-col xl:flex-row justify-between items-start gap-10">
                  <div className="space-y-6">
                    <h1 className="text-4xl font-black uppercase italic tracking-tighter leading-none">{currentList.name}</h1>
                    <div className="flex flex-wrap gap-3">
                      <span className="bg-slate-50 px-5 py-2 rounded-2xl text-[9px] font-black uppercase text-slate-600 border border-slate-100 flex items-center gap-3"><MapPin className="w-4 h-4 text-blue-500"/> {currentList.city}</span>
                      <span className="bg-blue-50 px-5 py-2 rounded-2xl text-[9px] font-black uppercase text-blue-600 border border-blue-100 flex items-center gap-3"><Store className="w-4 h-4"/> {currentList.establishment}</span>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setActiveView('gallery-upload')} className="bg-white border-2 border-slate-200 text-slate-900 px-8 py-4 rounded-[22px] font-black text-[9px] uppercase flex items-center gap-3 hover:border-blue-500 transition-all"><Upload className="w-5 h-5 text-blue-500" /> Galeria</button>
                    <button onClick={() => setActiveView('scanner')} className="bg-blue-600 text-white px-10 py-4 rounded-[22px] font-black text-[9px] uppercase flex items-center gap-3 hover:bg-blue-700 transition-all shadow-xl shadow-blue-200"><Camera className="w-5 h-5" /> Escanear</button>
                  </div>
                </div>
             </div>
             <div className="grid gap-10">
                {(currentList.entries || []).map(entry => (
                  <div key={entry.id} className="bg-white rounded-[55px] border border-slate-200 overflow-hidden flex flex-col lg:flex-row shadow-sm border-l-[12px] border-l-blue-600 hover:shadow-xl transition-all">
                    <div className="w-full lg:w-72 bg-slate-50 shrink-0 grid grid-cols-3 lg:grid-cols-1 gap-4 p-8 border-r border-slate-100">
                       {entry.photos.map((p, i) => (
                         <div key={i} className="aspect-square bg-white rounded-2xl overflow-hidden border-2 border-white shadow-md cursor-pointer hover:scale-105 transition-transform" onClick={() => setPreviewImg(p)}>
                            <img src={p} className="w-full h-full object-cover" />
                         </div>
                       ))}
                    </div>
                    <div className="p-10 flex-grow space-y-8">
                       <h3 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900 leading-tight">{entry.data.razaoSocial}</h3>
                       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="space-y-4 bg-slate-50 p-6 rounded-[30px] text-[10px]">
                             <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Identidade Visual</p>
                             <p className="font-black uppercase text-slate-800">Marca: {entry.data.marca}</p>
                             <p className="font-black uppercase text-slate-500">Fabricante: {entry.data.fabricanteEmbalagem}</p>
                          </div>
                          <div className="space-y-4 bg-slate-50 p-6 rounded-[30px] text-[10px]">
                             <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Processo Produtivo</p>
                             <p className="font-black uppercase text-slate-800">Moldagem: {entry.data.moldagem}</p>
                             <p className="font-black uppercase text-slate-500">Tipo: {entry.data.tipoEmbalagem}</p>
                          </div>
                          <div className="space-y-4 bg-slate-50 p-6 rounded-[30px] text-[10px]">
                             <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Data de Log</p>
                             <p className="font-black text-slate-800">{entry.checkedAt}</p>
                          </div>
                       </div>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        )}

        {activeView === 'create-list' && (
          <div className="max-w-xl mx-auto animate-in slide-in-from-bottom-10 px-4">
             <button onClick={() => setActiveView('home')} className="flex items-center gap-3 text-slate-400 font-black text-[9px] uppercase mb-10 hover:text-blue-600 transition-all"><ArrowLeft className="w-4 h-4" /> Voltar</button>
             <div className="bg-white p-16 rounded-[60px] shadow-2xl border border-slate-100 space-y-12">
                <h1 className="text-4xl font-black uppercase italic tracking-tighter text-center leading-none">Intelligence<br/><span className="text-blue-600">Sync</span></h1>
                <form onSubmit={handleCreateList} className="space-y-8">
                  <input required value={listForm.name} onChange={e => setListForm({...listForm, name: e.target.value})} placeholder="NOME DA LISTA" className="w-full bg-slate-50 border-2 border-slate-100 p-7 rounded-[30px] font-bold uppercase text-xs outline-none focus:border-blue-500 transition-all"/>
                  <input required value={listForm.establishment} onChange={e => setListForm({...listForm, establishment: e.target.value})} placeholder="ESTABELECIMENTO / PDV" className="w-full bg-slate-50 border-2 border-slate-100 p-7 rounded-[30px] font-bold uppercase text-xs outline-none focus:border-blue-500 transition-all"/>
                  <input required value={listForm.city} onChange={e => setListForm({...listForm, city: e.target.value})} placeholder="CIDADE / UF" className="w-full bg-slate-50 border-2 border-slate-100 p-7 rounded-[30px] font-bold uppercase text-xs outline-none focus:border-blue-500 transition-all"/>
                  <button type="submit" className="w-full bg-blue-600 text-white py-8 rounded-[35px] font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 flex items-center justify-center gap-4 hover:bg-blue-700 transition-all">Registrar na Nuvem</button>
                </form>
             </div>
          </div>
        )}

        {activeView === 'reports' && (
          <div className="space-y-10 animate-in fade-in pb-20">
             <h1 className="text-4xl font-black uppercase italic tracking-tighter text-center">Global Performance</h1>
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-10 rounded-[45px] border border-slate-200 shadow-sm text-center">
                   <p className="text-5xl font-black text-slate-900 tracking-tighter">{stats.totalEntries}</p>
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mt-4">SKUS TOTAL</p>
                </div>
                <div className="bg-blue-600 p-10 rounded-[45px] shadow-2xl text-center text-white">
                   <p className="text-5xl font-black tracking-tighter">{stats.newProspects}</p>
                   <p className="text-[9px] font-black uppercase tracking-[0.3em] mt-4 opacity-70">NOVOS PROSPECTS</p>
                </div>
                <div className="bg-white p-10 rounded-[45px] border border-slate-200 shadow-sm text-center">
                   <p className="text-5xl font-black text-slate-900 tracking-tighter">{stats.citiesCount}</p>
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mt-4">CIDADES ATENDIDAS</p>
                </div>
             </div>
          </div>
        )}

        <div className="pb-60">
          {activeView === 'scanner' && <SmartScanner onAllCaptured={processPhotos} onCancel={() => setActiveView('list-detail')} />}
          {activeView === 'gallery-upload' && <ManualUpload onComplete={processPhotos} onCancel={() => setActiveView('list-detail')} />}
        </div>
      </main>

      <footer className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-2xl border-t border-slate-200 py-6 px-10 z-[400] shadow-2xl">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <button onClick={() => { setActiveView('home'); setCurrentListId(null); }} className={`flex flex-col items-center gap-2 transition-all ${activeView === 'home' || activeView === 'list-detail' ? 'text-blue-600 scale-110' : 'text-slate-300'}`}><LayoutList className="w-7 h-7" /><span className="text-[9px] font-black uppercase tracking-widest">Listas</span></button>
          <button onClick={() => { if(currentListId) setActiveView('scanner'); else setActiveView('create-list'); }} className="bg-blue-600 text-white w-20 h-20 rounded-[30px] flex items-center justify-center -mt-16 border-[8px] border-slate-50 shadow-2xl hover:bg-blue-700 transition-all active:scale-90"><Plus className="w-10 h-10" /></button>
          <button onClick={() => setActiveView('reports')} className={`flex flex-col items-center gap-2 transition-all ${activeView === 'reports' ? 'text-indigo-600 scale-110' : 'text-slate-300'}`}><BarChart3 className="w-7 h-7" /><span className="text-[9px] font-black uppercase tracking-widest">Dashboard</span></button>
        </div>
      </footer>

      {previewImg && (
        <div className="fixed inset-0 z-[1200] bg-black/98 flex items-center justify-center p-6 animate-in fade-in" onClick={() => setPreviewImg(null)}>
          <img src={previewImg} className="max-w-full max-h-full object-contain rounded-[45px]" />
        </div>
      )}
    </div>
  );
};

export default App;
