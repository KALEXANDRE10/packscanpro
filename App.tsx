
import React, { useState, useEffect, useCallback } from 'react';
import { extractDataFromPhotos } from './services/geminiService';
import { supabase } from './services/supabase';
import { User, InspectionList, AppNotification } from './types';
import { SmartScanner } from './components/CameraCapture';
import { ManualUpload } from './components/ManualUpload';
import { 
  Bell, 
  Shield, 
  Clipboard, 
  Camera, 
  LogOut, 
  Package,
  Info
} from 'lucide-react';

// Lista de CNPJs de referência para verificação de novos prospectos
const cleanRefCnpjs: string[] = [];

// Função auxiliar para extrair a raiz do CNPJ (8 primeiros dígitos)
const getCnpjRaiz = (cnpj: string | string[]) => {
  const first = Array.isArray(cnpj) ? cnpj[0] : cnpj;
  return first ? first.replace(/\D/g, '').substring(0, 8) : '';
};

const App: React.FC = () => {
  // Estado da aplicação para gestão de sessão e interface
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentListId, setCurrentListId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeView, setActiveView] = useState<'lists' | 'list-detail' | 'capture' | 'manual'>('lists');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [lists, setLists] = useState<InspectionList[]>([]);

  // Função para buscar listas de inspeção do Supabase
  const fetchLists = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('inspection_lists').select('*');
      if (error) throw error;
      setLists(data as InspectionList[]);
    } catch (err) {
      console.error("Erro ao buscar listas:", err);
    }
  }, []);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  // Adiciona notificações ao sistema para feedback do usuário
  const addNotification = (title: string, message: string, type: 'success' | 'info' | 'warning') => {
    const newNotif: AppNotification = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      message,
      type,
      timestamp: new Date().toISOString(),
      read: false
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  // Processamento principal de imagens capturadas e extração via Gemini API
  const handleProcessImages = async (photos: string[]) => {
    if (!currentListId || !currentUser) return;
    setIsProcessing(true);
    try {
      const extracted = await extractDataFromPhotos(photos);
      const scannedFullCnpj = extracted.cnpj[0]?.replace(/\D/g, '') || '';
      const extractedRaiz = getCnpjRaiz(extracted.cnpj);
      let isNewProspect = true;
      
      // Validação de prospecto baseada em CNPJ conhecido
      if (scannedFullCnpj && cleanRefCnpjs.some(ref => scannedFullCnpj.includes(ref))) {
        isNewProspect = false;
      }
      
      // Verificação de duplicidade na base de dados
      if (isNewProspect && extractedRaiz) {
        const { data: existing } = await supabase
          .from('product_entries')
          .select('id')
          .eq('cnpj_raiz', extractedRaiz)
          .limit(1);
        if (existing && existing.length > 0) isNewProspect = false;
      }
      
      // Inserção dos dados extraídos no Supabase
      const { error } = await supabase.from('product_entries').insert({
        list_id: currentListId,
        inspector_id: currentUser.id,
        photos,
        razao_social: extracted.razaoSocial,
        cnpj: extracted.cnpj,
        cnpj_raiz: extractedRaiz,
        marca: extracted.marca,
        descricao_produto: extracted.descricaoProduto,
        conteudo: extracted.conteudo,
        endereco: extracted.endereco,
        cep: extracted.cep,
        telefone: extracted.telefone,
        site: extracted.site,
        fabricante_embalagem: extracted.fabricanteEmbalagem,
        moldagem: extracted.moldagem,
        formato_embalagem: extracted.formatoEmbalagem,
        tipo_embalagem: extracted.tipoEmbalagem,
        modelo_embalagem: extracted.modeloEmbalagem,
        is_new_prospect: isNewProspect,
        review_status: 'pending'
      });
      
      if (error) throw error;
      await fetchLists();
      setActiveView('list-detail');
      addNotification("Item Capturado", "Dados extraídos via IA com sucesso.", "success");
    } catch (err: any) { 
      console.error("Erro no processamento:", err);
      addNotification("Falha na IA", err.message || "Verifique sua conexão e chave de API.", "warning"); 
    } finally { 
      setIsProcessing(false); 
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Shield className="w-8 h-8 text-blue-600" />
          <h1 className="text-xl font-black uppercase tracking-tighter italic">AuditPack IA</h1>
        </div>
        <div className="flex items-center gap-4">
          <button className="relative p-2 text-slate-400 hover:text-slate-600">
            <Bell className="w-6 h-6" />
            {notifications.filter(n => !n.read).length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>
          {currentUser && (
            <div className="flex items-center gap-3 pl-4 border-l">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold uppercase">{currentUser.name}</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">{currentUser.role}</p>
              </div>
              <button onClick={() => setCurrentUser(null)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-grow p-6">
        {activeView === 'capture' ? (
          <SmartScanner onAllCaptured={handleProcessImages} onCancel={() => setActiveView('lists')} />
        ) : activeView === 'manual' ? (
          <ManualUpload onComplete={handleProcessImages} onCancel={() => setActiveView('lists')} />
        ) : (
          <div className="max-w-4xl mx-auto space-y-6">
             <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-black italic uppercase tracking-tighter text-slate-900">Listas de Auditoria</h2>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Gerencie suas inspeções em campo</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      setCurrentListId("demo-list-01"); 
                      if (!currentUser) setCurrentUser({ id: 'u1', name: 'Auditor Teste', email: 'auditor@demo.com', role: 'usuario', createdAt: new Date().toISOString() });
                      setActiveView('capture');
                    }}
                    className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-2 shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95"
                  >
                    <Camera className="w-4 h-4" /> Nova Captura IA
                  </button>
                </div>
             </div>

             {isProcessing && (
               <div className="bg-blue-50 border border-blue-100 p-6 rounded-[30px] flex items-center gap-4 animate-pulse">
                 <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white">
                    <Clipboard className="w-5 h-5 animate-bounce" />
                 </div>
                 <div>
                   <p className="text-sm font-black uppercase text-blue-900">IA Analisando Embalagem...</p>
                   <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Extraindo dados técnicos via Gemini</p>
                 </div>
               </div>
             )}

             <div className="grid gap-4">
               {lists.length === 0 ? (
                 <div className="bg-white border border-slate-200 rounded-[35px] p-12 text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Clipboard className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Nenhuma lista ativa encontrada</p>
                 </div>
               ) : (
                 lists.map(list => (
                   <div key={list.id} className="bg-white border border-slate-100 p-6 rounded-[30px] shadow-sm hover:shadow-md transition-all flex items-center justify-between">
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white">
                          <Package className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-black text-sm uppercase italic">{list.name}</h3>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{list.establishment} • {list.city}</p>
                        </div>
                     </div>
                     <button className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-100">
                        <Info className="w-5 h-5" />
                     </button>
                   </div>
                 ))
               )}
             </div>
          </div>
        )}
      </main>

      <footer className="bg-white border-t p-6 text-center">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">AuditPack v2.0 • Powered by Gemini AI</p>
      </footer>
    </div>
  );
};

export default App;
