
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

// Configuração Cloud
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
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoginView, setIsLoginView] = useState(true);
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [isSyncing, setIsSyncing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [lists, setLists] = useState<InspectionList[]>([]);
  const [activeView, setActiveView] = useState<'home' | 'create-list' | 'list-detail' | 'scanner' | 'gallery-upload' | 'reports'>('home');
  const [currentListId, setCurrentListId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [listForm, setListForm] = useState({ name: '', establishment: '', city: '' });
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('packscan_user');
    if (savedUser) {
      try { setCurrentUser(JSON.parse(savedUser)); } catch (e) { console.error(e); }
    }
  }, []);

  useEffect(() => {
    if (currentUser && supabase) fetchCloudData();
  }, [currentUser]);

  const fetchCloudData = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.from('lists').select('*').order('createdAt', { ascending: false });
      if (!error && data) setLists(data as InspectionList[]);
    } catch (e) { console.error(e); } finally { setIsSyncing(false); }
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

        if (error || !data) {
          setAuthError("E-mail ou senha incorretos.");
        } else {
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
          setAuthError("Falha ao criar conta.");
        }
      }
    } catch (err) {
      setAuthError("Erro de conexão.");
    } finally { setIsSyncing(false); }
  };

  const processPhotos = async (photos: string[]) => {
    if (!currentListId || !currentUser) return;
    setIsProcessing(true);
    console.log("Chamando extrator...");
    
    try {
      const data = await extractDataFromPhotos(photos);
      console.log("Dados extraídos com sucesso:", data.razaoSocial);
      
      const entry: ProductEntry = { 
        id: generateId(), 
        listId: currentListId,
        photos, 
        data, 
        isNewProspect: true, 
        checkedAt: new Date().toLocaleString('pt-BR'),
        reviewStatus: 'pending',
        inspectorId: currentUser.id
      };

      const updatedList = lists.find(l => l.id === currentListId);
      if (updatedList) {
        const newEntries = [entry, ...(updatedList.entries || [])];
        const { error } = await supabase.from('lists').update({ entries: newEntries }).eq('id', currentListId);
        if (!error) {
          setLists(prev => prev.map(l => l.id === currentListId ? { ...l, entries: newEntries } : l));
          setActiveView('list-detail');
        }
      }
    } catch (err: any) {
      console.error("ERRO NO PROCESSAMENTO:", err);
      alert(err.message || "Erro na análise da imagem.");
    } finally {
      setIsProcessing(false);
    }
  };

  const exportExcel = (list: InspectionList) => {
    if (!list.entries || list.entries.length === 0) return alert("Nenhum dado para exportar.");
    const data = list.entries.map(e => ({
      'RAZÃO SOCIAL': e.data.razaoSocial,
      'CNPJ': e.data.cnpj.join(', '),
      'MARCA': e.data.marca,
      'DESCRIÇÃO': e.data.descricaoProduto,
      'FABRICANTE EMBALAGEM': e.data.fabricanteEmbalagem,
      'MOLDAGEM': e.data.moldagem,
      'DATA': e.checkedAt
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
          <div className="bg-blue-600 w-20 h-20 rounded-[24px] flex items-center justify-center mb-6 shadow-xl shadow-blue-500/30">
            <Scan className="w-10 h-10 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-black italic tracking-tight mb-10 flex gap-2">
            <span className="text-slate-900">PACKSCAN</span>
            <span className="text-blue-600">PRO</span>
          </h1>
          <form onSubmit={handleAuth} className="w-full space-y-4">
            {authError && <div className="text-rose-500 text-[10px] font-bold text-center uppercase tracking-wider mb-2">{authError}</div>}
            {!isLoginView && (
              <input required placeholder="NOME" value={authForm.name} onChange={e => setAuthForm({...authForm, name: e.target.value})} className="w-full bg-[#F8FAFC] p-5 rounded-2xl font-bold text-[11px] text-slate-400 placeholder-slate-300 outline-none focus:ring-2 focus:ring-blue-100 transition-all uppercase" />
            )}
            <input required type="email" placeholder="E-MAIL" value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})} className="w-full bg-[#F8FAFC] p-5 rounded-2xl font-bold text-[11px] text-slate-400 placeholder-slate-300 outline-none focus:ring-2 focus:ring-blue-100 transition-all uppercase" />
            <input required type="password" placeholder="SENHA" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} className="w-full bg-[#F8FAFC] p-5 rounded-2xl font-bold text-[11px] text-slate-400 placeholder-slate-300 outline-none focus:ring-2 focus:ring-blue-100 transition-all uppercase" />
            <button type="submit" disabled={isSyncing} className="w-full bg-[#2563EB] text-white py-5 rounded-2xl font-black uppercase text-[11px] tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95 disabled:opacity-50 mt-4">
              {isSyncing ? 'CARREGANDO...' : isLoginView ? 'ACESSAR SISTEMA' : 'CRIAR CONTA'}
            </button>
          </form>
          <button onClick={() => setIsLoginView(!isLoginView)} className="mt-8 text-[9px] font-bold text-slate-400 uppercase tracking-widest hover:text-blue-600 transition-colors">
            {isLoginView ? 'SOLICITAR ACESSO' : 'JÁ POSSUI CONTA? LOGIN'}
          </button>
        </div>
      </div>
    );
  }

  const currentList = lists.find(l => l.id === currentListId);

  return (
    <div className="min-h-screen bg-slate-50 pb-48 text-slate-900 font-sans">
      <header className="bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-[500] px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4 cursor-pointer" onClick={() => { setActiveView('home'); setCurrentListId(null); }}>
          <div className="bg-blue-600 p-2.5 rounded-2xl"><Scan className="w-5 h-5 text-white" /></div>
          <div>
            <h1 className="text-xl font-black uppercase italic tracking-tight leading-none">PackScan <span className="text-blue-600">Pro</span></h1>
            <div className="flex items-center gap-1 mt-0.5">
              <Cloud className="w-2.5 h-2.5 text-emerald-500" />
              <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Sincronizado</span>
            </div>
          </div>
        </div>
        <button onClick={() => { localStorage.removeItem('packscan_user'); setCurrentUser(null); }} className="p-3 bg-rose-50 text-rose-600 rounded-2xl hover:bg-rose-600 hover:text-white transition-all"><LogOut className="w-5 h-5"/></button>
      </header>

      {isProcessing && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[2000] flex items-center justify-center">
          <div className="bg-white p-12 rounded-[50px] text-center shadow-2xl border-[10px] border-blue-600 max-w-sm mx-auto">
            <Loader2 className="w-16 h-16 text-blue-600 animate-spin mx-auto mb-8" />
            <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">Processando<br/>Embalagem</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase mt-6 tracking-[0.2em] animate-pulse">Aguarde a análise da IA</p>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-10">
        {activeView === 'home' && (
          <div className="space-y-10 animate-in fade-in">
            <div className="bg-white p-10 rounded-[50px] border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-8">
              <h1 className="text-4xl font-black text-slate-900 uppercase italic tracking-tighter">Listas de Campo</h1>
              <button onClick={() => {
                const name = prompt("Nome da Lista:");
                if(!name) return;
                const est = prompt("Estabelecimento:");
                const city = prompt("Cidade:");
                const newList: InspectionList = {
                  id: generateId(),
                  name: name.toUpperCase(),
                  establishment: (est || "N/I").toUpperCase(),
                  city: (city || "N/I").toUpperCase(),
                  inspectorName: currentUser.name,
                  inspectorId: currentUser.id,
                  createdAt: new Date().toISOString(),
                  entries: [],
                  isClosed: false,
                  status: 'executing'
                };
                supabase.from('lists').insert(newList).then(() => fetchCloudData());
              }} className="bg-slate-900 text-white px-10 py-5 rounded-[22px] font-black text-[9px] uppercase flex items-center gap-4 hover:bg-blue-600 transition-all">
                <Plus className="w-5 h-5" /> Nova Lista
              </button>
            </div>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {lists.map(list => (
                <div key={list.id} onClick={() => { setCurrentListId(list.id); setActiveView('list-detail'); }} className="bg-white rounded-[45px] border border-slate-200 p-8 cursor-pointer hover:border-blue-500 hover:shadow-xl transition-all group">
                  <h3 className="text-2xl font-black text-slate-900 uppercase italic mb-2 tracking-tighter">{list.name}</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase mb-8">{list.establishment} • {list.city}</p>
                  <div className="pt-6 border-t border-slate-50 flex justify-between items-center text-[10px] font-black">
                    <span className="bg-slate-50 px-4 py-2 rounded-xl text-slate-500 uppercase tracking-widest">{(list.entries || []).length} SKUs</span>
                    <ChevronRight className="w-5 h-5 text-blue-500 group-hover:translate-x-2 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === 'list-detail' && currentList && (
          <div className="space-y-8 animate-in fade-in">
             <div className="bg-white p-10 rounded-[55px] border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-8">
                   <button onClick={() => setActiveView('home')} className="text-slate-400 font-black text-[9px] uppercase flex items-center gap-3"><ArrowLeft className="w-4 h-4" /> Voltar</button>
                   <button onClick={() => exportExcel(currentList)} className="bg-emerald-500 text-white px-6 py-4 rounded-[22px] font-black text-[9px] uppercase flex items-center gap-3"><Download className="w-4 h-4" /> Excel</button>
                </div>
                <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                   <div>
                      <h1 className="text-4xl font-black uppercase italic tracking-tighter leading-none mb-4">{currentList.name}</h1>
                      <div className="flex gap-2">
                        <span className="bg-slate-100 px-4 py-2 rounded-xl text-[9px] font-black uppercase">{currentList.city}</span>
                        <span className="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-[9px] font-black uppercase">{currentList.establishment}</span>
                      </div>
                   </div>
                   <div className="flex gap-3">
                      <button onClick={() => setActiveView('gallery-upload')} className="bg-slate-100 text-slate-900 px-8 py-4 rounded-[22px] font-black text-[9px] uppercase">Galeria</button>
                      <button onClick={() => setActiveView('scanner')} className="bg-blue-600 text-white px-10 py-4 rounded-[22px] font-black text-[9px] uppercase flex items-center gap-3"><Camera className="w-5 h-5" /> Escanear</button>
                   </div>
                </div>
             </div>
             <div className="grid gap-6">
                {(currentList.entries || []).map(entry => (
                  <div key={entry.id} className="bg-white rounded-[45px] border border-slate-200 overflow-hidden flex flex-col md:flex-row border-l-[10px] border-l-blue-600">
                    <div className="w-full md:w-60 h-60 bg-slate-100 shrink-0">
                       <img src={entry.photos[0]} className="w-full h-full object-cover" />
                    </div>
                    <div className="p-8 flex-grow">
                       <h3 className="text-2xl font-black uppercase italic tracking-tighter mb-4">{entry.data.razaoSocial}</h3>
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-slate-50 p-4 rounded-3xl">
                             <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Marca</p>
                             <p className="text-[10px] font-black uppercase">{entry.data.marca}</p>
                          </div>
                          <div className="bg-slate-50 p-4 rounded-3xl">
                             <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Fabricante</p>
                             <p className="text-[10px] font-black uppercase">{entry.data.fabricanteEmbalagem}</p>
                          </div>
                          <div className="bg-slate-50 p-4 rounded-3xl">
                             <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Moldagem</p>
                             <p className="text-[10px] font-black uppercase">{entry.data.moldagem}</p>
                          </div>
                          <div className="bg-slate-50 p-4 rounded-3xl">
                             <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Data</p>
                             <p className="text-[10px] font-black uppercase">{entry.checkedAt}</p>
                          </div>
                       </div>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        )}

        {activeView === 'scanner' && <SmartScanner onAllCaptured={processPhotos} onCancel={() => setActiveView('list-detail')} />}
        {activeView === 'gallery-upload' && <ManualUpload onComplete={processPhotos} onCancel={() => setActiveView('list-detail')} />}
      </main>

      <footer className="fixed bottom-0 inset-x-0 bg-white/95 border-t border-slate-100 py-6 px-10 z-[400]">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <button onClick={() => setActiveView('home')} className={`flex flex-col items-center gap-1 ${activeView === 'home' || activeView === 'list-detail' ? 'text-blue-600' : 'text-slate-300'}`}><LayoutList className="w-6 h-6" /><span className="text-[8px] font-black uppercase tracking-widest">Listas</span></button>
          <div className="bg-blue-600 text-white w-16 h-16 rounded-[24px] flex items-center justify-center -mt-16 border-[6px] border-slate-50 shadow-xl cursor-pointer" onClick={() => { if(currentListId) setActiveView('scanner'); else setActiveView('home'); }}><Plus className="w-8 h-8" /></div>
          <button onClick={() => setActiveView('reports')} className={`flex flex-col items-center gap-1 ${activeView === 'reports' ? 'text-blue-600' : 'text-slate-300'}`}><BarChart3 className="w-6 h-6" /><span className="text-[8px] font-black uppercase tracking-widest">Métricas</span></button>
        </div>
      </footer>
    </div>
  );
};

export default App;
