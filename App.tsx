
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, ArrowLeft, Loader2, Scan, ChevronRight, 
  LayoutList, Camera, MapPin, LogOut, Table, 
  Upload, CheckCircle2, AlertCircle, FileSpreadsheet, ShieldCheck,
  TrendingUp, Database, Sparkles, Edit3, Save, Send, Globe, Phone, Settings,
  Tag, BarChart3, PieChart, Info, Users, Box, Hash, Globe2, AlertTriangle, Search,
  Building2, ImageIcon, FileText, ClipboardList, X, Maximize2, Mail, ThumbsUp, ThumbsDown
} from 'lucide-react';
import { InspectionList, ProductEntry, ListStatus, User, ExtractedData, AppNotification } from './types';
import { SmartScanner } from './components/CameraCapture';
import { ManualUpload } from './components/ManualUpload';
import { extractDataFromPhotos } from './services/geminiService';
import { supabase } from './services/supabase';
import * as XLSX from 'xlsx';

const getCnpjRaiz = (cnpj: string | string[]): string => {
  const value = Array.isArray(cnpj) ? (cnpj[0] || '') : (cnpj || '');
  if (!value || value === 'N/I') return '';
  const clean = value.replace(/\D/g, '');
  return clean.substring(0, 8);
};

const App: React.FC = () => {
  // Auth States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoginView, setIsLoginView] = useState(true);
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  
  // App States
  const [lists, setLists] = useState<InspectionList[]>([]);
  const [activeView, setActiveView] = useState<'home' | 'create-list' | 'list-detail' | 'scanner' | 'upload' | 'master-table' | 'admin-settings' | 'bi-analytics'>('home');
  const [currentListId, setCurrentListId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<ExtractedData | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  
  const [activePhotos, setActivePhotos] = useState<Record<string, number>>({});

  const [icTargetEmail, setIcTargetEmail] = useState(() => localStorage.getItem('packscan_ic_email') || 'inteligencia.comercial@empresa.com');
  const [referenceCnpjs, setReferenceCnpjs] = useState<string>(() => localStorage.getItem('packscan_ref_cnpjs') || '');

  const currentList = useMemo(() => lists.find(l => l.id === currentListId), [lists, currentListId]);
  const cleanRefCnpjs = useMemo(() => referenceCnpjs.split(/[\n,;]/).map(c => c.replace(/\D/g, '')).filter(c => c.length >= 8), [referenceCnpjs]);

  const addNotification = (title: string, message: string, type: 'success' | 'info' | 'warning') => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [{ id, title, message, type, timestamp: new Date().toISOString(), read: false }, ...prev].slice(0, 5));
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
  };

  const syncUserProfile = async (authUser: any) => {
    try {
      let { data: profile } = await supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle();
      if (!profile) {
        const isAdminEmail = authUser.email?.toLowerCase().includes('admin');
        const role = isAdminEmail ? 'admin' : 'usuario';
        const name = authUser.user_metadata?.name || authUser.email?.split('@')[0].toUpperCase();
        const { data: newProfile, error } = await supabase.from('profiles').insert([{ id: authUser.id, name, role }]).select().single();
        if (error) throw error;
        profile = newProfile;
      }
      setCurrentUser({
        id: authUser.id,
        name: profile?.name || "USUÁRIO",
        email: authUser.email || '',
        role: profile?.role as 'admin' | 'usuario',
        createdAt: profile?.created_at || authUser.created_at || new Date().toISOString()
      });
    } catch (err) { console.error("Erro perfil:", err); }
  };

  const fetchLists = async () => {
    try {
      const { data, error } = await supabase.from('inspection_lists').select('*, product_entries(*)').order('created_at', { ascending: false });
      if (error) throw error;
      const remoteLists = (data || []).map(l => ({
        id: l.id, name: l.name, establishment: l.establishment, city: l.city,
        inspectorName: l.inspector_name, inspectorId: l.inspector_id,
        createdAt: new Date(l.created_at).toLocaleString('pt-BR'),
        status: l.status as ListStatus, isClosed: l.is_closed,
        entries: (l.product_entries || []).map((e: any) => ({
          id: e.id, listId: e.list_id, photos: Array.isArray(e.photos) ? e.photos : [], 
          data: {
            razaoSocial: e.razao_social || "N/I",
            cnpj: Array.isArray(e.cnpj) ? e.cnpj : [e.cnpj].filter(Boolean),
            marca: e.marca || "N/I",
            descricaoProduto: e.descricao_produto || "N/I",
            conteudo: e.conteudo || "N/I",
            endereco: e.endereco || "N/I",
            cep: e.cep || "N/I",
            telefone: e.telefone || "N/I",
            site: e.site || "N/I",
            fabricanteEmbalagem: e.fabricante_embalagem || "N/I",
            moldagem: e.moldagem || "N/I",
            formatoEmbalagem: e.formato_embalagem || "N/I",
            tipoEmbalagem: e.tipo_embalagem || "N/I",
            modeloEmbalagem: e.modelo_embalagem || "N/I",
            dataLeitura: new Date(e.created_at).toLocaleString('pt-BR')
          },
          isNewProspect: e.is_new_prospect, checkedAt: new Date(e.created_at).toLocaleString('pt-BR'),
          reviewStatus: e.review_status || 'pending', inspectorId: e.inspector_id
        }))
      }));
      setLists(remoteLists);
    } catch (err: any) { console.error("Erro fetch:", err.message); }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { if (session?.user) syncUserProfile(session.user); setIsLoadingAuth(false); });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) syncUserProfile(session.user); else { setCurrentUser(null); setLists([]); }
      setIsLoadingAuth(false);
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (currentUser) fetchLists(); }, [currentUser]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      if (isLoginView) {
        const { error } = await supabase.auth.signInWithPassword({ email: authForm.email, password: authForm.password });
        if (error) {
          let msg = "Erro desconhecido.";
          if (error.message.includes("Invalid login credentials")) msg = "E-mail ou senha incorretos.";
          else if (error.message.includes("Email not confirmed")) msg = "E-mail não confirmado.";
          setAuthError(msg);
          addNotification("Erro de Acesso", msg, "warning");
        }
      } else {
        const { error } = await supabase.auth.signUp({ email: authForm.email, password: authForm.password, options: { data: { name: authForm.name } } });
        if (error) throw error;
        addNotification("Sucesso", "Conta criada! Verifique seu e-mail ou faça login.", "success");
        setIsLoginView(true);
      }
    } catch (err: any) { 
      setAuthError(err.message); 
      addNotification("Erro", err.message, "warning");
    } finally { 
      setIsLoadingAuth(false); 
    }
  };

  const handleUpdateEntry = async (entryId: string) => {
    if (!editFormData) return;
    try {
      const { error } = await supabase.from('product_entries').update({
        razao_social: editFormData.razaoSocial,
        marca: editFormData.marca,
        descricao_produto: editFormData.descricaoProduto,
        conteudo: editFormData.conteudo,
        fabricante_embalagem: editFormData.fabricanteEmbalagem,
        moldagem: editFormData.moldagem,
        formato_embalagem: editFormData.formatoEmbalagem,
        tipo_embalagem: editFormData.tipoEmbalagem,
        modelo_embalagem: editFormData.modeloEmbalagem,
        endereco: editFormData.endereco,
        telefone: editFormData.telefone,
        site: editFormData.site,
        cep: editFormData.cep,
        cnpj: editFormData.cnpj
      }).eq('id', entryId);
      if (error) throw error;
      await fetchLists();
      setEditingEntryId(null);
      setEditFormData(null);
      addNotification("Atualizado", "Dados salvos com sucesso.", "success");
    } catch (err: any) { addNotification("Erro", "Falha ao salvar edições.", "warning"); }
  };

  const handleReviewEntry = async (entryId: string, status: 'approved' | 'rejected') => {
    if (currentUser?.role !== 'admin') return;
    try {
      const { error } = await supabase.from('product_entries').update({ review_status: status }).eq('id', entryId);
      if (error) throw error;
      await fetchLists();
      addNotification("Revisão Concluída", `Item ${status === 'approved' ? 'aprovado' : 'rejeitado'} com sucesso.`, "success");
    } catch (err: any) { addNotification("Erro", "Falha na revisão técnica.", "warning"); }
  };

  const handleProcessImages = async (photos: string[]) => {
    if (!currentListId || !currentUser) return;
    setIsProcessing(true);
    try {
      const extracted = await extractDataFromPhotos(photos);
      const scannedFullCnpj = extracted.cnpj[0]?.replace(/\D/g, '') || '';
      const extractedRaiz = getCnpjRaiz(extracted.cnpj);
      let isNewProspect = true;
      if (scannedFullCnpj && cleanRefCnpjs.some(ref => scannedFullCnpj.includes(ref))) isNewProspect = false;
      if (isNewProspect && extractedRaiz) {
        const { data: existing } = await supabase.from('product_entries').select('id').eq('cnpj_raiz', extractedRaiz).limit(1);
        if (existing && existing.length > 0) isNewProspect = false;
      }
      const { error } = await supabase.from('product_entries').insert({
        list_id: currentListId, inspector_id: currentUser.id, photos,
        razao_social: extracted.razaoSocial, cnpj: extracted.cnpj, cnpj_raiz: extractedRaiz,
        marca: extracted.marca, descricao_produto: extracted.descricaoProduto, conteudo: extracted.conteudo,
        endereco: extracted.endereco, cep: extracted.cep, telefone: extracted.telefone, site: extracted.site,
        fabricante_embalagem: extracted.fabricanteEmbalagem, moldagem: extracted.moldagem,
        formato_embalagem: extracted.formatoEmbalagem, tipo_embalagem: extracted.tipoEmbalagem,
        modelo_embalagem: extracted.modeloEmbalagem, is_new_prospect: isNewProspect, review_status: 'pending'
      });
      if (error) throw error;
      await fetchLists();
      setActiveView('list-detail');
      addNotification("Item Capturado", "Dados extraídos via IA com sucesso.", "success");
    } catch (err: any) { addNotification("Erro IA", "Falha no processamento da imagem.", "warning"); } finally { setIsProcessing(false); }
  };

  const handleCreateList = async (formData: FormData) => {
    if (!currentUser) return;
    setIsCreatingList(true);
    const name = (formData.get('name') as string).toUpperCase();
    const establishment = (formData.get('establishment') as string).toUpperCase();
    const city = (formData.get('city') as string).toUpperCase();
    try {
      const { data, error } = await supabase.from('inspection_lists').insert([{ name, establishment, city, inspector_name: currentUser.name, inspector_id: currentUser.id, status: 'executing', is_closed: false }]).select().single();
      if (error) throw error;
      await fetchLists();
      if (data) { setCurrentListId(data.id); setActiveView('list-detail'); }
      addNotification("Nova Rota", "Auditoria iniciada!", "success");
    } catch (err: any) { addNotification("Erro", "Falha ao criar rota.", "warning"); } finally { setIsCreatingList(false); }
  };

  const handleSendToIC = async () => {
    if (!currentList || !currentUser) return;
    try {
      const { error } = await supabase.from('inspection_lists').update({ status: 'waiting_ic', is_closed: true }).eq('id', currentList.id);
      if (error) throw error;
      const subject = encodeURIComponent(`Auditoria Concluída: ${currentList.name} - ${currentList.establishment}`);
      const body = encodeURIComponent(`Olá Inteligência Comercial,\n\nAuditoria concluída disponível:\nProjeto: ${currentList.name}\nPDV: ${currentList.establishment}\nAuditor: ${currentList.inspectorName}\n\nAtenciosamente,\nPackScan Pro`);
      window.location.href = `mailto:${icTargetEmail}?subject=${subject}&body=${body}`;
      await fetchLists();
      addNotification("Enviado", "Status atualizado para aguardando IC.", "success");
    } catch (err: any) { addNotification("Erro", "Falha ao finalizar lista.", "warning"); }
  };

  const analytics = useMemo(() => {
    const allEntries = lists.flatMap(l => l.entries || []);
    const pdvRanking: Record<string, number> = {};
    const moldagemRanking: Record<string, number> = {};
    const cidadeRanking: Record<string, number> = {};
    const fabricanteRanking: Record<string, number> = {};
    
    let approvedTotal = 0;
    let rejectedTotal = 0;
    let pendingTotal = 0;

    lists.forEach(l => {
      const pdv = l.establishment?.trim().toUpperCase() || 'N/I';
      const city = l.city?.trim().toUpperCase() || 'N/I';
      pdvRanking[pdv] = (pdvRanking[pdv] || 0) + (l.entries?.length || 0);
      cidadeRanking[city] = (cidadeRanking[city] || 0) + (l.entries?.length || 0);
    });

    allEntries.forEach(e => {
      const mold = e.data.moldagem?.trim().toUpperCase() || 'N/I';
      const fab = e.data.fabricanteEmbalagem?.trim().toUpperCase() || 'N/I';
      moldagemRanking[mold] = (moldagemRanking[mold] || 0) + 1;
      fabricanteRanking[fab] = (fabricanteRanking[fab] || 0) + 1;
      
      if (e.reviewStatus === 'approved') approvedTotal++;
      else if (e.reviewStatus === 'rejected') rejectedTotal++;
      else pendingTotal++;
    });

    return {
      totalItens: allEntries.length,
      approved: approvedTotal,
      rejected: rejectedTotal,
      pending: pendingTotal,
      pdv: Object.entries(pdvRanking).sort((a,b) => b[1] - a[1]),
      moldagem: Object.entries(moldagemRanking).sort((a,b) => b[1] - a[1]),
      cidade: Object.entries(cidadeRanking).sort((a,b) => b[1] - a[1]),
      fabricante: Object.entries(fabricanteRanking).sort((a,b) => b[1] - a[1]),
    };
  }, [lists]);

  const masterDataExcel = useMemo(() => lists.flatMap(list => (list.entries || []).map(entry => ({
    "PROJETO": list.name, "PDV": list.establishment, "CIDADE": list.city, "AUDITOR": list.inspectorName, "DATA LEITURA": entry.checkedAt,
    "RAZÃO SOCIAL": entry.data.razaoSocial, "CNPJ": entry.data.cnpj[0] || 'N/I', "CNPJ RAIZ": getCnpjRaiz(entry.data.cnpj),
    "MARCA": entry.data.marca, "DESCRIÇÃO": entry.data.descricaoProduto, "CONTEÚDO": entry.data.conteudo, "ENDEREÇO": entry.data.endereco,
    "CEP": entry.data.cep, "TELEFONE": entry.data.telefone, "SITE": entry.data.site, "FABRICANTE PEÇA": entry.data.fabricanteEmbalagem,
    "MOLDAGEM": entry.data.moldagem, "FORMATO": entry.data.formatoEmbalagem, "TIPO": entry.data.tipoEmbalagem, "MODELO": entry.data.modeloEmbalagem,
    "STATUS PROSPECÇÃO": entry.isNewProspect ? "NOVO" : "RECORRENTE"
  }))), [lists]);

  if (isLoadingAuth) return <div className="min-h-screen flex items-center justify-center bg-white"><Loader2 className="w-8 h-8 text-blue-600 animate-spin" /></div>;

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white w-full max-w-md rounded-[40px] p-10 shadow-2xl border border-slate-100 relative overflow-hidden">
          <div className="text-center mb-10">
            <div className="bg-blue-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg"><Scan className="w-10 h-10 text-white" /></div>
            <h1 className="text-3xl font-black uppercase italic tracking-tighter leading-none">PackScan <span className="text-blue-600">Pro</span></h1>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            {!isLoginView && <input required type="text" placeholder="NOME" value={authForm.name} onChange={e => setAuthForm({...authForm, name: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-2xl text-sm font-bold uppercase"/>}
            <input required type="email" placeholder="E-MAIL" value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-2xl text-sm font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500"/>
            <input required type="password" placeholder="SENHA" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} className="w-full bg-slate-50 border p-4 rounded-2xl text-sm font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500"/>
            {authError && <div className="p-3 bg-red-50 text-red-500 text-[10px] font-bold uppercase rounded-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2"><AlertCircle className="w-4 h-4" /> {authError}</div>}
            <button type="submit" className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all">
              {isLoadingAuth ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Acessar Sistema'}
            </button>
          </form>
          <button onClick={() => { setIsLoginView(!isLoginView); setAuthError(null); }} className="w-full mt-6 text-blue-600 font-bold text-[10px] uppercase text-center">{isLoginView ? 'Solicitar Acesso' : 'Já possui conta'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24 font-sans tracking-tight">
      {/* NOTIFICATIONS FLOAT */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-sm flex flex-col gap-2 pointer-events-none px-6">
        {notifications.map(n => (
          <div key={n.id} className={`p-4 rounded-2xl shadow-2xl flex items-start gap-3 animate-in slide-in-from-top-5 pointer-events-auto border ${n.type === 'success' ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-900 border-slate-700 text-white'}`}>
            {n.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
            <div>
               <p className="text-[10px] font-black uppercase tracking-widest">{n.title}</p>
               <p className="text-[11px] font-medium opacity-90">{n.message}</p>
            </div>
          </div>
        ))}
      </div>

      <header className="bg-white border-b border-slate-200 sticky top-0 z-[100] px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveView('home')}>
          <Scan className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-black uppercase italic tracking-tighter leading-none">PackScan <span className="text-blue-600">Pro</span></h1>
        </div>
        <div className="flex items-center gap-4">
           <div className="text-right">
              <p className="text-[10px] font-black uppercase italic text-slate-900 leading-none">{currentUser.name}</p>
              <p className="text-[8px] font-bold uppercase text-blue-600 mt-1">{currentUser.role === 'admin' ? 'Gestão Master' : 'Campo'}</p>
           </div>
           <button onClick={() => supabase.auth.signOut()} className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:text-red-500 transition-all"><LogOut className="w-5 h-5" /></button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        {activeView === 'home' && (
          <div className="space-y-8">
            <div className="flex justify-between items-center pt-4">
               <h2 className="text-xl font-black uppercase italic tracking-tighter">Minhas Rotas</h2>
               <button onClick={() => setActiveView('create-list')} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-blue-100 hover:scale-105 transition-all">+ Nova Auditoria</button>
            </div>
            <div className="grid gap-4">
              {lists.map(list => (
                <div key={list.id} onClick={() => { setCurrentListId(list.id); setActiveView('list-detail'); }} className="bg-white p-6 rounded-[35px] border border-slate-200 flex items-center justify-between hover:shadow-xl cursor-pointer group transition-all">
                   <div className="flex items-center gap-5">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-inner ${list.status === 'waiting_ic' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-blue-600'}`}>
                        {list.status === 'waiting_ic' ? <CheckCircle2 /> : <LayoutList />}
                      </div>
                      <div>
                        <h3 className="font-black text-lg uppercase italic leading-none">{list.name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest"><MapPin className="w-3 h-3 inline" /> {list.establishment} • {list.city}</p>
                      </div>
                   </div>
                   <ChevronRight className="w-6 h-6 text-slate-200 group-hover:text-blue-600" />
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === 'bi-analytics' && (
          <div className="space-y-8 animate-in fade-in pb-10">
            <div className="flex items-center gap-3">
               <div className="bg-blue-600 p-3 rounded-2xl text-white shadow-lg"><BarChart3 className="w-6 h-6" /></div>
               <div><h2 className="text-2xl font-black uppercase italic tracking-tighter">Ranking BI Comercial</h2></div>
            </div>

            {/* KPI ROW: PERFORMANCE DA INTELIGÊNCIA */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div className="bg-white p-6 rounded-[35px] border border-slate-100 shadow-sm flex items-center gap-5">
                  <div className="bg-emerald-50 text-emerald-600 w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner"><ThumbsUp className="w-6 h-6" /></div>
                  <div>
                     <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Aprovados IC</p>
                     <p className="text-2xl font-black text-emerald-600 italic tracking-tighter">{analytics.approved}</p>
                  </div>
               </div>
               <div className="bg-white p-6 rounded-[35px] border border-slate-100 shadow-sm flex items-center gap-5">
                  <div className="bg-rose-50 text-rose-600 w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner"><ThumbsDown className="w-6 h-6" /></div>
                  <div>
                     <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Reprovados IC</p>
                     <p className="text-2xl font-black text-rose-600 italic tracking-tighter">{analytics.rejected}</p>
                  </div>
               </div>
               <div className="bg-white p-6 rounded-[35px] border border-slate-100 shadow-sm flex items-center gap-5">
                  <div className="bg-amber-50 text-amber-600 w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner"><Loader2 className="w-6 h-6 animate-spin" /></div>
                  <div>
                     <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pendentes Analise</p>
                     <p className="text-2xl font-black text-amber-600 italic tracking-tighter">{analytics.pending}</p>
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2"><Building2 className="w-4 h-4 text-blue-500" /> Ranking por PDV</h5>
                  <div className="space-y-3">{analytics.pdv.slice(0, 5).map(([name, count], i) => (<div key={name} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl"><span className="text-xs font-black uppercase text-slate-700 truncate mr-4">{i+1}. {name}</span><span className="text-[9px] font-black text-blue-600">{count} itens</span></div>))}</div>
               </div>
               <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2"><MapPin className="w-4 h-4 text-emerald-500" /> Cobertura por Cidade</h5>
                  <div className="space-y-3">{analytics.cidade.slice(0, 5).map(([name, count]) => (<div key={name} className="flex items-center justify-between p-3 bg-emerald-50/30 rounded-2xl"><span className="text-xs font-black uppercase text-slate-700 truncate mr-4">{name}</span><span className="text-[9px] font-black text-emerald-600">{count} itens</span></div>))}</div>
               </div>
               <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2"><Database className="w-4 h-4 text-amber-500" /> Share de Fabricantes</h5>
                  <div className="space-y-4">{analytics.fabricante.slice(0, 5).map(([name, count]) => (<div key={name}><div className="flex justify-between text-[10px] font-black uppercase mb-1"><span>{name}</span><span className="text-blue-600">{count}</span></div><div className="w-full h-1.5 bg-slate-50 rounded-full overflow-hidden"><div className="h-full bg-amber-400" style={{ width: `${(count/analytics.totalItens)*100}%` }} /></div></div>))}</div>
               </div>
               <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2"><Box className="w-4 h-4 text-purple-500" /> Tipo de Moldagem</h5>
                  <div className="space-y-4">{analytics.moldagem.map(([name, count]) => (<div key={name} className="flex items-center justify-between"><span className="text-xs font-black uppercase italic text-slate-700">{name}</span><div className="flex items-center gap-4"><div className="w-32 h-1.5 bg-slate-50 rounded-full overflow-hidden"><div className="h-full bg-purple-500" style={{ width: `${(count/analytics.totalItens)*100}%` }} /></div><span className="text-[9px] font-black text-slate-400">{count}</span></div></div>))}</div>
               </div>
            </div>
          </div>
        )}

        {activeView === 'list-detail' && currentList && (
          <div className="space-y-6 animate-in fade-in pb-10">
             <div className="bg-white p-10 rounded-[50px] border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6 shadow-sm">
                <div className="text-center md:text-left">
                   <h2 className="text-3xl font-black uppercase italic tracking-tighter leading-tight">{currentList.name}</h2>
                   <div className="flex items-center justify-center md:justify-start gap-2 mt-2 text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                      <MapPin className="w-3 h-3 text-blue-600" /> {currentList.establishment} • {currentList.city}
                   </div>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                   {currentList.status !== 'waiting_ic' ? (
                     <>
                        <button onClick={() => setActiveView('upload')} className="bg-slate-900 text-white px-6 py-4 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 shadow-lg"><Upload className="w-4 h-4" /> Upload</button>
                        <button onClick={() => setActiveView('scanner')} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 shadow-xl hover:scale-105 transition-all"><Camera className="w-4 h-4" /> Escanear</button>
                        <button onClick={handleSendToIC} className="bg-emerald-600 text-white px-6 py-4 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 shadow-xl hover:scale-105 transition-all"><Mail className="w-4 h-4" /> Finalizar</button>
                     </>
                   ) : (
                     <div className="bg-emerald-50 text-emerald-600 px-6 py-4 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 border border-emerald-100">
                        <CheckCircle2 className="w-4 h-4" /> Aguardando Análise IC
                     </div>
                   )}
                </div>
             </div>
             
             <div className="grid gap-8">
                {(currentList.entries || []).map(entry => {
                  const isEditing = editingEntryId === entry.id;
                  const activeIdx = activePhotos[entry.id] || 0;
                  const isAdmin = currentUser.role === 'admin';

                  return (
                    <div key={entry.id} className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm transition-all hover:shadow-xl relative overflow-hidden">
                       {/* STATUS BADGE REVISÃO */}
                       <div className="absolute top-0 right-0">
                          {entry.reviewStatus === 'approved' && <div className="bg-emerald-500 text-white px-6 py-2 rounded-bl-3xl font-black text-[8px] uppercase flex items-center gap-2"><ThumbsUp className="w-3 h-3"/> Aprovado IC</div>}
                          {entry.reviewStatus === 'rejected' && <div className="bg-rose-500 text-white px-6 py-2 rounded-bl-3xl font-black text-[8px] uppercase flex items-center gap-2"><ThumbsDown className="w-3 h-3"/> Rejeitado IC</div>}
                          {entry.reviewStatus === 'pending' && <div className="bg-amber-400 text-white px-6 py-2 rounded-bl-3xl font-black text-[8px] uppercase flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin"/> Pendente IC</div>}
                       </div>

                       <div className="flex flex-col lg:flex-row gap-8 mt-4">
                          <div className="w-full lg:w-56 shrink-0 flex flex-col gap-3">
                             <div onClick={() => setZoomImage(entry.photos[activeIdx])} className="w-full h-56 bg-slate-100 rounded-[30px] overflow-hidden relative border border-slate-200 shadow-inner group cursor-zoom-in">
                                <img src={entry.photos[activeIdx]} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><Maximize2 className="text-white w-8 h-8" /></div>
                                <div className="absolute top-3 left-3 flex flex-col gap-1">
                                   <span className="text-[8px] font-black bg-white/90 text-blue-600 px-2 py-1 rounded-lg uppercase">FOTO {activeIdx + 1}/3</span>
                                   <span className={`text-[8px] font-black px-2 py-1 rounded-lg uppercase shadow-sm ${entry.isNewProspect ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>
                                      {entry.isNewProspect ? 'NOVO' : 'RECORRENTE'}
                                   </span>
                                </div>
                             </div>
                             <div className="flex justify-between gap-2">
                                {entry.photos.map((img, idx) => (<button key={idx} onClick={() => setActivePhotos({...activePhotos, [entry.id]: idx})} className={`flex-grow h-14 rounded-xl overflow-hidden border-2 transition-all ${activeIdx === idx ? 'border-blue-500 scale-105' : 'border-transparent opacity-60'}`}><img src={img} className="w-full h-full object-cover" /></button>))}
                             </div>
                             
                             {/* BOTÕES DE APROVAÇÃO PARA ADMIN */}
                             {isAdmin && entry.reviewStatus === 'pending' && (
                               <div className="grid grid-cols-2 gap-2 pt-4">
                                  <button onClick={() => handleReviewEntry(entry.id, 'rejected')} className="bg-rose-50 text-rose-600 py-3 rounded-2xl font-black text-[9px] uppercase border border-rose-100 hover:bg-rose-600 hover:text-white transition-all flex items-center justify-center gap-2"><ThumbsDown className="w-4 h-4"/> Reprovar</button>
                                  <button onClick={() => handleReviewEntry(entry.id, 'approved')} className="bg-emerald-50 text-emerald-600 py-3 rounded-2xl font-black text-[9px] uppercase border border-emerald-100 hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center gap-2"><ThumbsUp className="w-4 h-4"/> Aprovar</button>
                               </div>
                             )}
                          </div>

                          <div className="flex-grow">
                             <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
                                <div className="flex-grow">
                                   {isEditing ? (
                                     <div className="space-y-2">
                                        <p className="text-[8px] font-black text-blue-600 uppercase">Razão Social</p>
                                        <input value={editFormData?.razaoSocial} onChange={e => setEditFormData({...editFormData!, razaoSocial: e.target.value.toUpperCase()})} className="text-lg font-black uppercase italic border-2 border-blue-200 rounded-xl w-full p-2 outline-none bg-blue-50/30" />
                                        <p className="text-[8px] font-black text-blue-600 uppercase mt-2">CNPJ Principal</p>
                                        <input value={editFormData?.cnpj[0]} onChange={e => setEditFormData({...editFormData!, cnpj: [e.target.value]})} className="text-sm font-bold border-2 border-blue-200 rounded-xl w-full p-2 outline-none bg-blue-50/30" />
                                     </div>
                                   ) : (
                                     <>
                                        <h4 className="font-black text-xl uppercase italic text-slate-900 leading-none">{entry.data.razaoSocial}</h4>
                                        <p className="text-[9px] font-black text-slate-400 uppercase mt-2 italic tracking-widest">CNPJ: {entry.data.cnpj[0] || 'N/I'}</p>
                                     </>
                                   )}
                                </div>
                                <div className="flex gap-2">
                                  {isEditing ? (
                                    <><button onClick={() => { setEditingEntryId(null); setEditFormData(null); }} className="bg-slate-100 text-slate-500 p-3 rounded-xl"><X className="w-5 h-5" /></button><button onClick={() => handleUpdateEntry(entry.id)} className="bg-blue-600 text-white p-3 rounded-xl shadow-lg"><Save className="w-5 h-5" /></button></>
                                  ) : (
                                    <button onClick={() => { setEditingEntryId(entry.id); setEditFormData({...entry.data}); }} className="bg-slate-50 text-slate-400 p-3 rounded-xl hover:text-blue-600 hover:bg-blue-50 transition-all shadow-sm"><Edit3 className="w-5 h-5" /></button>
                                  )}
                                </div>
                             </div>

                             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-4 bg-blue-50/30 p-5 rounded-[30px] border border-blue-100/50">
                                   <h5 className="text-[9px] font-black text-blue-600 uppercase italic border-b border-blue-100 pb-2 flex items-center gap-2"><Tag className="w-3 h-3" /> Identificação</h5>
                                   <div className="space-y-4">
                                      {isEditing ? (
                                        <><input value={editFormData?.marca} onChange={e => setEditFormData({...editFormData!, marca: e.target.value.toUpperCase()})} placeholder="MARCA" className="w-full text-[10px] font-black border border-blue-200 rounded p-1 outline-none" /><input value={editFormData?.descricaoProduto} onChange={e => setEditFormData({...editFormData!, descricaoProduto: e.target.value.toUpperCase()})} placeholder="DESCRIÇÃO" className="w-full text-[10px] font-black border border-blue-200 rounded p-1 outline-none" /></>
                                      ) : (
                                        <><div><p className="text-[8px] font-bold text-slate-400 uppercase">Marca</p><p className="text-[10px] font-black uppercase truncate">{entry.data.marca}</p></div><div><p className="text-[8px] font-bold text-slate-400 uppercase">Descrição</p><p className="text-[10px] font-black uppercase leading-tight">{entry.data.descricaoProduto}</p></div></>
                                      )}
                                   </div>
                                </div>
                                <div className="space-y-4 bg-slate-50 p-5 rounded-[30px] border border-slate-200/50">
                                   <h5 className="text-[9px] font-black text-slate-500 uppercase italic border-b border-slate-200 pb-2 flex items-center gap-2"><MapPin className="w-3 h-3" /> Local e Contato</h5>
                                   <div className="space-y-4">
                                      {isEditing ? (
                                        <><input value={editFormData?.endereco} onChange={e => setEditFormData({...editFormData!, endereco: e.target.value.toUpperCase()})} placeholder="ENDEREÇO" className="w-full text-[10px] font-black border border-slate-200 rounded p-1 outline-none" /><input value={editFormData?.cep} onChange={e => setEditFormData({...editFormData!, cep: e.target.value.toUpperCase()})} placeholder="CEP" className="w-full text-[10px] font-black border border-slate-200 rounded p-1 outline-none" /><input value={editFormData?.telefone} onChange={e => setEditFormData({...editFormData!, telefone: e.target.value.toUpperCase()})} placeholder="TELEFONE" className="w-full text-[10px] font-black border border-slate-200 rounded p-1 outline-none" /></>
                                      ) : (
                                        <><div><p className="text-[8px] font-bold text-slate-400 uppercase">Localização</p><p className="text-[10px] font-black uppercase truncate">{entry.data.endereco} • {entry.data.cep}</p></div><div><p className="text-[8px] font-bold text-slate-400 uppercase">Contato</p><p className="text-[10px] font-black uppercase leading-tight">{entry.data.telefone} <br/> {entry.data.site}</p></div></>
                                      )}
                                   </div>
                                </div>
                                <div className="space-y-4 bg-emerald-50/30 p-5 rounded-[30px] border border-emerald-100/50">
                                   <h5 className="text-[9px] font-black text-emerald-600 uppercase italic border-b border-emerald-100 pb-2 flex items-center gap-2"><Box className="w-3 h-3" /> Técnica</h5>
                                   <div className="grid grid-cols-2 gap-4">
                                      {isEditing ? (
                                        <><div className="col-span-2"><input value={editFormData?.fabricanteEmbalagem} onChange={e => setEditFormData({...editFormData!, fabricanteEmbalagem: e.target.value.toUpperCase()})} placeholder="FABRICANTE PEÇA" className="w-full text-[10px] font-black border border-emerald-200 rounded p-1 outline-none" /></div><input value={editFormData?.moldagem} onChange={e => setEditFormData({...editFormData!, moldagem: e.target.value.toUpperCase()})} placeholder="MOLDAGEM" className="w-full text-[10px] font-black border border-emerald-200 rounded p-1 outline-none" /><input value={editFormData?.formatoEmbalagem} onChange={e => setEditFormData({...editFormData!, formatoEmbalagem: e.target.value.toUpperCase()})} placeholder="FORMATO" className="w-full text-[10px] font-black border border-emerald-200 rounded p-1 outline-none" /><div className="col-span-2"><input value={editFormData?.conteudo} onChange={e => setEditFormData({...editFormData!, conteudo: e.target.value.toUpperCase()})} placeholder="CONTEÚDO" className="w-full text-[10px] font-black border border-emerald-200 rounded p-1 outline-none" /></div></>
                                      ) : (
                                        <><div className="col-span-2"><p className="text-[8px] font-bold text-slate-400 uppercase">Fabricante Peça</p><p className="text-[10px] font-black uppercase truncate">{entry.data.fabricanteEmbalagem}</p></div><div><p className="text-[8px] font-bold text-slate-400 uppercase">Moldagem</p><p className="text-[10px] font-black text-emerald-600 uppercase">{entry.data.moldagem}</p></div><div><p className="text-[8px] font-bold text-slate-400 uppercase">Format/Vol</p><p className="text-[10px] font-black uppercase">{entry.data.formatoEmbalagem} • {entry.data.conteudo}</p></div></>
                                      )}
                                   </div>
                                </div>
                             </div>
                          </div>
                       </div>
                    </div>
                  );
                })}
             </div>
          </div>
        )}

        {activeView === 'master-table' && (
          <div className="space-y-6 animate-in slide-in-from-right-5 pb-10">
             <div className="bg-white p-10 rounded-[40px] border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6 shadow-sm">
                <div><h2 className="text-3xl font-black uppercase italic tracking-tighter">Relatório Master 21 Colunas</h2><p className="text-[10px] text-slate-400 font-bold uppercase mt-2 italic tracking-widest">Base Consolidada para Exportação Comercial</p></div>
                <button onClick={() => { const ws = XLSX.utils.json_to_sheet(masterDataExcel); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Master_PRO"); XLSX.writeFile(wb, `PackScan_Export_${new Date().toISOString().split('T')[0]}.xlsx`); addNotification("Excel Exportado", "Sua planilha está pronta.", "success"); }} className="bg-emerald-600 text-white px-8 py-5 rounded-2xl font-black text-[10px] uppercase shadow-xl hover:bg-emerald-700 transition-all flex items-center gap-2"><FileSpreadsheet className="w-5 h-5" /> Exportar XLSX</button>
             </div>
             <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-2xl overflow-x-auto"><table className="w-full text-left text-[11px] min-w-[3000px]"><thead className="bg-slate-900 text-white uppercase italic"><tr>{masterDataExcel[0] && Object.keys(masterDataExcel[0]).map(h => (<th key={h} className="px-8 py-6 font-black tracking-widest text-[9px] border-r border-white/5 whitespace-nowrap">{h}</th>))}</tr></thead><tbody>{masterDataExcel.map((row, i) => (<tr key={i} className="border-b border-slate-50 hover:bg-blue-50/50 transition-colors">{Object.values(row).map((val: any, idx) => (<td key={idx} className={`px-8 py-5 ${idx === 5 ? 'font-black text-blue-600 italic' : 'text-slate-600 font-bold'}`}>{val}</td>))}</tr>))}</tbody></table></div>
          </div>
        )}

        {activeView === 'admin-settings' && currentUser.role === 'admin' && (
          <div className="max-w-3xl mx-auto py-12 animate-in slide-in-from-bottom-10 space-y-8">
            <div className="bg-white p-10 rounded-[50px] border border-slate-200 shadow-2xl space-y-10">
              <div className="flex items-center justify-between"><button onClick={() => setActiveView('home')} className="p-3 bg-slate-50 rounded-2xl hover:text-blue-600"><ArrowLeft className="w-5 h-5" /></button><h1 className="font-black uppercase italic tracking-tighter">Gestão Master IC</h1></div>
              <div className="space-y-8"><div className="space-y-3"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><ClipboardList className="w-4 h-4 text-blue-600" /> Banco de CNPJs de Referência</label><textarea value={referenceCnpjs} onChange={e => { setReferenceCnpjs(e.target.value); localStorage.setItem('packscan_ref_cnpjs', e.target.value); }} className="w-full bg-slate-50 border p-6 rounded-[30px] text-xs font-mono min-h-[200px] outline-none focus:ring-2 focus:ring-blue-500" placeholder="Cole os CNPJs aqui..."/></div><div className="space-y-3"><label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><Mail className="w-4 h-4 text-emerald-600" /> E-mail Destino IC</label><input type="email" value={icTargetEmail} onChange={e => { setIcTargetEmail(e.target.value); localStorage.setItem('packscan_ic_email', e.target.value); }} className="w-full bg-slate-50 border p-5 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"/></div><button onClick={() => { addNotification("Configurações Salvas", "Sua base master foi atualizada.", "success"); setActiveView('home'); }} className="w-full bg-blue-600 text-white py-6 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all">Salvar Base Master</button></div>
            </div>
          </div>
        )}

        {activeView === 'create-list' && (
          <div className="max-w-md mx-auto py-12 animate-in slide-in-from-bottom-10"><div className="bg-white p-10 rounded-[50px] border border-slate-200 shadow-2xl space-y-8"><div className="flex items-center justify-between"><button onClick={() => setActiveView('home')} className="p-3 bg-slate-50 rounded-2xl hover:text-blue-600"><ArrowLeft className="w-5 h-5" /></button><h1 className="font-black uppercase italic tracking-tighter">Nova Auditoria</h1></div><form onSubmit={e => { e.preventDefault(); handleCreateList(new FormData(e.currentTarget)); }} className="space-y-5"><input name="name" required placeholder="NOME DO PROJETO" className="w-full bg-slate-50 border border-slate-200 p-5 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500"/><input name="establishment" required placeholder="PDV / ESTABELECIMENTO" className="w-full bg-slate-50 border border-slate-200 p-5 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500"/><input name="city" required placeholder="CIDADE / UF" className="w-full bg-slate-50 border border-slate-200 p-5 rounded-2xl text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-blue-500"/><button disabled={isCreatingList} type="submit" className="w-full bg-blue-600 text-white py-6 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all">{isCreatingList ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar e Iniciar'}</button></form></div></div>
        )}

        {activeView === 'scanner' && <SmartScanner onAllCaptured={handleProcessImages} onCancel={() => setActiveView('list-detail')} />}
        {activeView === 'upload' && <ManualUpload onComplete={handleProcessImages} onCancel={() => setActiveView('list-detail')} />}
      </main>

      {zoomImage && (<div onClick={() => setZoomImage(null)} className="fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in"><button className="absolute top-6 right-6 text-white bg-white/10 p-4 rounded-full"><X className="w-8 h-8"/></button><img src={zoomImage} className="max-w-full max-h-full rounded-2xl shadow-2xl animate-in zoom-in-95 duration-300" /></div>)}

      <footer className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 p-6 flex justify-around items-center z-[100] shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
          <button onClick={() => setActiveView('home')} className={`flex flex-col items-center gap-1 transition-all ${activeView === 'home' ? 'text-blue-600 scale-110' : 'text-slate-300'}`}><LayoutList className="w-7 h-7"/><span className="text-[8px] font-black uppercase tracking-widest">Rotas</span></button>
          <button onClick={() => setActiveView('bi-analytics')} className={`flex flex-col items-center gap-1 transition-all ${activeView === 'bi-analytics' ? 'text-blue-600 scale-110' : 'text-slate-300'}`}><BarChart3 className="w-7 h-7"/><span className="text-[8px] font-black uppercase tracking-widest">BI</span></button>
          <button onClick={() => { if(currentListId && activeView === 'list-detail') setActiveView('scanner'); else setActiveView('create-list'); }} className="bg-blue-600 text-white w-16 h-16 rounded-[25px] flex items-center justify-center -mt-14 border-8 border-slate-50 shadow-2xl active:scale-90 transition-all shadow-blue-200"><Plus className="w-10 h-10" /></button>
          <button onClick={() => setActiveView('master-table')} className={`flex flex-col items-center gap-1 transition-all ${activeView === 'master-table' ? 'text-blue-600 scale-110' : 'text-slate-300'}`}><Database className="w-7 h-7"/><span className="text-[8px] font-black uppercase tracking-widest">Master</span></button>
          <button onClick={() => { if(currentUser.role === 'admin') setActiveView('admin-settings'); else addNotification("Acesso Restrito", "Apenas administradores podem acessar a gestão.", "warning"); }} className={`flex flex-col items-center gap-1 transition-all ${activeView === 'admin-settings' ? 'text-blue-600 scale-110' : 'text-slate-300'}`}><Settings className="w-7 h-7"/><span className="text-[8px] font-black uppercase tracking-widest">Gestão</span></button>
      </footer>

      {isProcessing && (<div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[300] flex flex-col items-center justify-center text-white text-center p-6"><Loader2 className="w-20 h-20 text-blue-600 animate-spin mb-8" /><h3 className="text-2xl font-black uppercase italic tracking-tighter">Processando Inteligência PackScan</h3><p className="text-slate-400 text-[10px] font-bold uppercase mt-4 tracking-[0.2em] animate-pulse">Cruzando Raiz de CNPJ com Base Master</p></div>)}
    </div>
  );
};

export default App;
