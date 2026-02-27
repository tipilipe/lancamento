import React, { useState, useEffect, useMemo, useRef } from 'react';

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001/api'
  : window.location.hostname.includes('railway.app')
    ? '/api'
    : 'https://lancamento-production.up.railway.app/api';

import {
  Plus, Trash2, FileText, ChevronDown, ChevronUp, Save,
  Paperclip, X, CheckCircle2, AlertCircle, Banknote, Receipt,
  FolderOpen, DollarSign, Eye, Edit, Search,
  ArrowUpDown, Lock, LogOut, UserCog, History, ExternalLink,
  Download, FileSpreadsheet, File as FileIcon, FileType,
  Undo2, Filter, Calendar, Menu
} from 'lucide-react';

import ChangePasswordModal from './ChangePasswordModal';

// --- CONFIGURAÇÕES DE ARQUIVO ---
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.xlsx'];

const MASTER_USER = 'filipe.souza@shipstore.com.br';

// --- FUNÇÕES DE EXPORTAÇÃO ---
const exportToCSV = (data, filename) => {
  if (!data || data.length === 0) {
    alert('Nenhum dado para exportar');
    return;
  }

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(header => {
      const value = row[header];
      // Escapar vírgulas e aspas
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value || '';
    }).join(','))
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
};

const exportToJSON = (data, filename) => {
  if (!data || data.length === 0) {
    alert('Nenhum dado para exportar');
    return;
  }

  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
};

const exportToExcel = (data, filename) => {
  if (!data || data.length === 0) {
    alert('Nenhum dado para exportar');
    return;
  }

  // Criar HTML table
  const headers = Object.keys(data[0]);
  const htmlTable = `
    <table>
      <thead>
        <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${data.map(row => `<tr>${headers.map(h => `<td>${row[h] || ''}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  `;

  const blob = new Blob([htmlTable], { type: 'application/vnd.ms-excel' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.xls`;
  link.click();
  URL.revokeObjectURL(link.href);
};

// --- FUNÇÃO DE LOG ---
const logAction = async (userEmail, action, details) => {
  try {
    await fetch(`${API_URL}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: userEmail, action: action.toUpperCase(), details: details })
    });
  } catch (e) {
    console.error("Erro ao gravar log", e);
  }
};

// --- FUNÇÕES AUXILIARES DE VALIDAÇÃO ---
const validateFile = (file) => {
  if (!file) return { valid: false, error: 'Nenhum arquivo selecionado' };

  // Validar tamanho
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
    return {
      valid: false,
      error: `Arquivo muito grande! Máximo: ${sizeMB}MB. Tamanho: ${(file.size / (1024 * 1024)).toFixed(2)}MB`
    };
  }

  // Validar tipo
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Tipo de arquivo não permitido. Aceitos: PDF, PNG, JPG, XLSX`
    };
  }

  return { valid: true, error: null };
};

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
};

// Função para salvar arquivo em chunks
const saveFileChunks = async (file) => {
  const base64 = await fileToBase64(file);
  const CHUNK_SIZE = 800 * 1024; // 800KB
  const totalChunks = Math.ceil(base64.length / CHUNK_SIZE);

  const res = await fetch(`${API_URL}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, size: file.size, type: file.type })
  });
  const { id: fileId } = await res.json();

  for (let i = 0; i < totalChunks; i++) {
    const chunkContent = base64.substr(i * CHUNK_SIZE, CHUNK_SIZE);
    await fetch(`${API_URL}/files/${fileId}/chunks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index: i, content: chunkContent })
    });
  }

  return fileId;
};

// Função para reconstruir arquivo a partir dos chunks
const getFileFromChunks = async (fileId) => {
  const res = await fetch(`${API_URL}/files/${fileId}/chunks`);
  const chunks = await res.json();

  if (!chunks.length) return null;

  return chunks.map(c => c.content).join('');
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    // Check for existing session
    const savedUser = localStorage.getItem('lma_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoadingAuth(false);
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem('lma_user');
    localStorage.removeItem('lma_token');
    setUser(null);
  };

  if (loadingAuth) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 font-sans">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Iniciando LMA Finanças...</p>
      </div>
    </div>
  );

  if (!user) return <LoginScreen errorFromApp={authError} onLoginSuccess={(userData) => setUser(userData)} />;

  return <Dashboard user={user} onSignOut={handleSignOut} onNoAccess={() => {
    handleSignOut();
    setAuthError("Erro de permissão. Contate o administrador.");
  }} />;
}

// --- TELA DE LOGIN ---
const LoginScreen = ({ errorFromApp, onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(errorFromApp ? { title: "Aviso", message: errorFromApp } : null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao entrar');
      }

      localStorage.setItem('lma_token', data.token);
      localStorage.setItem('lma_user', JSON.stringify(data.user));
      onLoginSuccess(data.user);
    } catch (err) {
      setError({ title: "Erro de Acesso", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-md animate-in fade-in zoom-in duration-300">
        <div className="text-center mb-10">
          <div className="bg-blue-600 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <Receipt className="text-white" size={40} />
          </div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">LMA Finanças</h1>
          <p className="text-slate-400 text-sm mt-2 font-medium">Controle de Notas Fiscais</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl">
            <p className="font-black uppercase text-[10px] tracking-widest mb-1">{error.title}</p>
            <p>{error.message}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">E-mail Corporativo</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none transition-all font-medium" />
          </div>
          <div className="space-y-1">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Senha</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none transition-all font-medium" />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95">
            {loading ? 'Entrando...' : 'Entrar no Sistema'}
          </button>
        </form>
      </div>
    </div>
  );
};

// --- DASHBOARD (Refactored for Neon) ---
const Dashboard = ({ user, onSignOut, onNoAccess }) => {
  const [currentModule, setCurrentModule] = useState('entry');
  const [userPermissions, setUserPermissions] = useState([]);
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  const [modalPreview, setModalPreview] = useState(null);
  const [itemToEdit, setItemToEdit] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const userEmail = user.email;
  const isMaster = userEmail === MASTER_USER;

  const [fdas, setFdas] = useState([]);
  const [rawItems, setRawItems] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [logsList, setLogsList] = useState([]);
  const [filiais, setFiliais] = useState([]);
  const [userFiliais, setUserFiliais] = useState([]);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const refreshData = React.useCallback(async () => {
    if (!userEmail) return;
    try {
      if (isMaster) {
        setUserPermissions(['entry', 'launched', 'finance', 'users', 'logs', 'launched_open', 'launched_paid', 'finance_pending', 'finance_provision', 'finance_approved', 'finance_paid']);
      }

      const [fdasRes, itemsRes, logsRes, filiaisRes] = await Promise.all([
        fetch(`${API_URL}/fdas`),
        fetch(`${API_URL}/items`),
        fetch(`${API_URL}/logs`),
        fetch(`${API_URL}/filiais`)
      ]);

      const [fdasData, itemsData, logsData, filiaisData] = await Promise.all([
        fdasRes.json(),
        itemsRes.json(),
        logsRes.json(),
        filiaisRes.json()
      ]);

      setFdas(fdasData.map(f => ({ ...f, id: f.id, filialId: f.filial_id, isOpen: f.is_open })));
      setRawItems(itemsData.map(i => {
        const parseJson = (val) => {
          if (typeof val === 'string') {
            try { return JSON.parse(val); } catch (e) { return []; }
          }
          return Array.isArray(val) ? val : [];
        };
        return {
          ...i,
          id: i.id,
          fdaId: i.fda_id,
          anexosNF: parseJson(i.anexos_nf),
          anexosBoleto: parseJson(i.anexos_boleto),
          comprovantes: parseJson(i.comprovantes)
        };
      }));
      setLogsList(logsData.map(l => ({ ...l, id: l.id, user: l.user_email })));
      setFiliais(filiaisData);

      const permRes = await fetch(`${API_URL}/permissions/${userEmail}`);
      const permData = await permRes.json();

      if (!isMaster) {
        setUserPermissions(permData.modules || ['entry']);
      }
      setUserFiliais(permData.filiais || []);

      if (isMaster) {
        const allPermsRes = await fetch(`${API_URL}/permissions`);
        const allPermsData = await allPermsRes.json();
        setUsersList(allPermsData.map(p => ({ ...p, id: p.email })));
      }
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setLoadingPermissions(false);
    }
  }, [userEmail, isMaster]);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [refreshData]);

  const fdasWithItems = useMemo(() => {
    let filteredFdas = fdas;
    let filteredItems = rawItems;

    // Se não for master, filtrar por filiais
    if (!isMaster && userFiliais.length > 0) {
      filteredFdas = fdas.filter(fda => userFiliais.includes(fda.filialId));
      filteredItems = rawItems.filter(item => {
        const fda = fdas.find(f => f.id === item.fdaId);
        return fda && userFiliais.includes(fda.filialId);
      });
    }

    return filteredFdas.map(fda => ({
      ...fda,
      items: filteredItems.filter(item => item.fdaId === fda.id)
    })).sort((a, b) => (b.number || '').localeCompare(a.number || ''));
  }, [fdas, rawItems, isMaster, userFiliais]);

  const allItems = useMemo(() => {
    let filteredItems = rawItems;

    // Se não for master, filtrar por filiais
    if (!isMaster && userFiliais.length > 0) {
      filteredItems = rawItems.filter(item => {
        const fda = fdas.find(f => f.id === item.fdaId);
        return fda && userFiliais.includes(fda.filialId);
      });
    }

    return filteredItems.map(item => ({
      ...item,
      fdaNumber: fdas.find(f => f.id === item.fdaId)?.number || 'N/A',
      filialName: filiais.find(f => {
        const fda = fdas.find(fd => fd.id === item.fdaId);
        return fda && f.id === fda.filialId;
      })?.nome || 'N/A'
    }));
  }, [rawItems, fdas, filiais, isMaster, userFiliais]);

  // Actions
  const addFda = async (filialId) => {
    if (!filialId) {
      alert('Selecione uma filial antes de criar o atendimento.');
      return;
    }
    const number = `FDA-${new Date().getFullYear()}-${String(fdas.length + 1).padStart(3, '0')}`;
    await fetch(`${API_URL}/fdas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, filialId })
    });
    logAction(userEmail, 'CRIAR FDA', `FDA Criada: ${number} - Filial: ${filiais.find(f => f.id === filialId)?.nome}`);
    refreshData();
  };
  const toggleFda = async (id, status) => {
    setFdas(prev => prev.map(f => f.id === id ? { ...f, isOpen: !status } : f));
    try {
      await fetch(`${API_URL}/fdas/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_open: !status })
      });
    } catch (err) {
      console.error('Erro ao alternar FDA:', err);
      // Revert in case of error
      setFdas(prev => prev.map(f => f.id === id ? { ...f, isOpen: status } : f));
    }
  };
  const updateFdaNumber = async (id, val) => {
    await fetch(`${API_URL}/fdas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: val.toUpperCase() })
    });
    refreshData();
  };

  const deleteFda = async (fdaId, fdaNumber) => {
    const fdaItems = rawItems.filter(item => item.fdaId === fdaId);

    if (fdaItems.length > 0) {
      alert('Este atendimento possui lançamentos e não pode ser excluído. Exclua os lançamentos primeiro.');
      return;
    }

    if (!window.confirm(`Tem certeza que deseja excluir o atendimento ${fdaNumber}?`)) return;

    try {
      await fetch(`${API_URL}/fdas/${fdaId}`, { method: 'DELETE' });
      logAction(userEmail, 'EXCLUIR FDA', `FDA excluída: ${fdaNumber}`);
      refreshData();
    } catch (error) {
      console.error("Erro ao excluir FDA:", error);
      alert("Erro ao excluir atendimento.");
    }
  };

  const saveItem = async (fdaId, itemData, filesNF, filesBoleto) => {
    try {
      const nfUrls = [];
      const boletoUrls = [];

      // Upload sequencial para evitar travamentos e erros no Firestore
      for (const file of filesNF) {
        if (file.file) {
          const fileId = await saveFileChunks(file.file);
          nfUrls.push({
            name: file.file.name,
            fileId: fileId,
            date: new Date().toLocaleString('pt-BR'),
            size: formatFileSize(file.file.size)
          });
        } else {
          nfUrls.push(file);
        }
      }

      for (const file of filesBoleto) {
        if (file.file) {
          const fileId = await saveFileChunks(file.file);
          boletoUrls.push({
            name: file.file.name,
            fileId: fileId,
            date: new Date().toLocaleString('pt-BR'),
            size: formatFileSize(file.file.size)
          });
        } else {
          boletoUrls.push(file);
        }
      }

      await fetch(`${API_URL}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fdaId,
          data: itemData,
          anexosNF: nfUrls,
          anexosBoleto: boletoUrls,
          comprovantes: []
        })
      });

      // Log enriquecido
      const fda = fdas.find(f => f.id === fdaId);
      logAction(userEmail, 'GRAVAR ITEM', `Item gravado. FDA: ${fda?.number || 'N/A'} - Navio: ${itemData.navio} - Serviço: ${itemData.servicos}`);
      refreshData();
    } catch (error) {
      console.error('Erro ao salvar item:', error);
      throw new Error(`Falha ao salvar: ${error.message}`);
    }
  };

  const updateItem = async (id, data, filesNF = null, filesBoleto = null, comprovantes = null) => {
    try {
      const updatePayload = { data };

      // Upload sequencial
      if (filesNF) { // Permite deletar se array vier vazio
        const nfUrls = [];
        for (const file of filesNF) {
          if (file.file) {
            const fileId = await saveFileChunks(file.file);
            nfUrls.push({
              name: file.file.name,
              fileId: fileId,
              date: new Date().toLocaleString('pt-BR'),
              size: formatFileSize(file.file.size)
            });
          } else if (file.url || file.fileId) {
            nfUrls.push(file);
          }
        }
        updatePayload.anexosNF = nfUrls;
      }

      if (filesBoleto) { // Permite deletar se array vier vazio
        const boletoUrls = [];
        for (const file of filesBoleto) {
          if (file.file) {
            const fileId = await saveFileChunks(file.file);
            boletoUrls.push({
              name: file.file.name,
              fileId: fileId,
              date: new Date().toLocaleString('pt-BR'),
              size: formatFileSize(file.file.size)
            });
          } else if (file.url || file.fileId) {
            boletoUrls.push(file);
          }
        }
        updatePayload.anexosBoleto = boletoUrls;
      }

      // Comprovantes de pagamento (já processados pelo LaunchedModule)
      if (comprovantes !== null) {
        updatePayload.comprovantes = comprovantes;
      }

      await fetch(`${API_URL}/items/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
      });

      // Log enriquecido
      const currentItem = allItems.find(i => i.id === id);
      const fdaNum = currentItem?.fdaNumber || 'N/A';
      logAction(userEmail, 'ATUALIZAR ITEM', `Item atualizado. FDA: ${fdaNum} - Navio: ${data.navio} - Serviço: ${data.servicos} - Status: ${data.status}`);
      refreshData();
    } catch (error) {
      console.error('Erro ao atualizar item:', error);
      throw new Error(`Falha ao atualizar: ${error.message}`);
    }
  };

  const deleteItem = async (id) => {
    if (window.confirm("Deseja excluir este item permanentemente?")) {
      await fetch(`${API_URL}/items/${id}`, { method: 'DELETE' });
      logAction(userEmail, 'EXCLUIR ITEM', `Item ID ${id} excluído`);
      refreshData();
    }
  };

  const triggerEdit = (item) => {
    setItemToEdit(item);
    setCurrentModule('entry');
  };

  // Função para abrir o arquivo do Firebase Storage
  const handleViewFile = async (file) => {
    try {
      let base64Url = file.url;

      // Se for arquivo em chunks, precisa reconstruir
      if (file.fileId) {
        // Feedback visual simples pode ser adicionado aqui (e.g. toast loading)
        const rebuiltBase64 = await getFileFromChunks(file.fileId);
        if (rebuiltBase64) {
          base64Url = rebuiltBase64;
        } else {
          alert('Erro: Arquivo não encontrado no servidor ou corrompido.');
          return;
        }
      }

      if (base64Url) {
        if (base64Url.startsWith('data:')) {
          // Base64 -> Blob -> URL para evitar bloqueio de "Not allowed to navigate top frame to data URL"
          const arr = base64Url.split(',');
          const mimeMatch = arr[0].match(/:(.*?);/);
          const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
          const bstr = atob(arr[1]);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          const blob = new Blob([u8arr], { type: mime });
          const blobUrl = URL.createObjectURL(blob);
          const newWindow = window.open(blobUrl, '_blank');

          // Opcional: revogar URL após uso esporádico, mas aqui mantemos simples
          // setTimeout(() => URL.revokeObjectURL(blobUrl), 60000); 

          if (!newWindow) {
            alert("Pop-up bloqueado. Por favor, permita pop-ups para visualizar o arquivo.");
          } else {
            logAction(userEmail, 'VISUALIZAR ANEXO', `Arquivo visualizado: ${file.name}`);
          }
        } else {
          // URL antiga (Storage)
          window.open(base64Url, '_blank');
          logAction(userEmail, 'VISUALIZAR ANEXO', `Arquivo visualizado: ${file.name}`);
        }
      } else if (file.file) {
        // Se for um arquivo local novo (File object), cria um blob temporário para visualização
        const blobUrl = URL.createObjectURL(file.file);
        window.open(blobUrl, '_blank');
        logAction(userEmail, 'VISUALIZAR ANEXO', `Arquivo visualizado: ${file.name}`);
      } else {
        alert('Arquivo não disponível para visualização.');
      }
    } catch (e) {
      console.error("Erro ao abrir arquivo", e);
      alert("Erro ao tentar visualizar o arquivo.");
    }
  };

  // Função para fazer download do arquivo
  const handleDownloadFile = async (file) => {
    try {
      let base64Url = file.url;

      // Se for arquivo em chunks, precisa reconstruir
      if (file.fileId) {
        const rebuiltBase64 = await getFileFromChunks(file.fileId);
        if (rebuiltBase64) {
          base64Url = rebuiltBase64;
        } else {
          alert('Erro: Arquivo não encontrado no servidor ou corrompido.');
          return;
        }
      }

      if (base64Url) {
        // Criar link de download
        const link = document.createElement('a');
        link.href = base64Url;
        link.download = file.name || 'arquivo';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        logAction(userEmail, 'DOWNLOAD ANEXO', `Arquivo baixado: ${file.name}`);
      } else if (file.file) {
        // Se for um arquivo local novo (File object)
        const blobUrl = URL.createObjectURL(file.file);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = file.name || file.file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        logAction(userEmail, 'DOWNLOAD ANEXO', `Arquivo baixado: ${file.name}`);
      } else {
        alert('Arquivo não disponível para download.');
      }
    } catch (e) {
      console.error("Erro ao baixar arquivo", e);
      alert("Erro ao tentar baixar o arquivo.");
    }
  };
  const handleChangePassword = async (oldPassword, newPassword) => {
    try {
      const res = await fetch(`${API_URL}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, oldPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert('Senha alterada com sucesso!');
      setShowPasswordModal(false);
    } catch (error) {
      alert(error.message);
    }
  };

  if (loadingPermissions) return <div className="min-h-screen flex items-center justify-center bg-slate-50 font-bold text-slate-400">AUTENTICANDO...</div>;

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      {/* Botão Menu Mobile */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-3 bg-blue-600 text-white rounded-xl shadow-lg hover:bg-blue-700 transition-all"
      >
        <Menu size={24} />
      </button>

      {/* Overlay para fechar menu mobile */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`w-64 bg-white border-r border-slate-200 flex flex-col fixed h-full z-40 print:hidden transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-8">
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-md">
              <Receipt size={18} className="text-white" />
            </div>
            LMA Finanças
          </h1>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {userPermissions.includes('entry') && <NavButton active={currentModule === 'entry'} onClick={() => { setCurrentModule('entry'); setMobileMenuOpen(false); }} icon={<FolderOpen size={18} />} label="Lançamento" />}
          {userPermissions.includes('launched') && <NavButton active={currentModule === 'launched'} onClick={() => { setCurrentModule('launched'); setMobileMenuOpen(false); }} icon={<FileText size={18} />} label="Itens Lançados" />}
          {userPermissions.includes('finance') && <NavButton active={currentModule === 'finance'} onClick={() => { setCurrentModule('finance'); setMobileMenuOpen(false); }} icon={<DollarSign size={18} />} label="Contas a Pagar" />}
          {userPermissions.includes('logs') && <NavButton active={currentModule === 'logs'} onClick={() => { setCurrentModule('logs'); setMobileMenuOpen(false); }} icon={<History size={18} />} label="Logs do Sistema" />}
          {isMaster && (<> <div className="pt-6 pb-2 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Painel Admin</div> <NavButton active={currentModule === 'filiais'} onClick={() => { setCurrentModule('filiais'); setMobileMenuOpen(false); }} icon={<FolderOpen size={18} />} label="Filiais" /> <NavButton active={currentModule === 'users'} onClick={() => { setCurrentModule('users'); setMobileMenuOpen(false); }} icon={<UserCog size={18} />} label="Usuários" /> </>)}
        </nav>
        <div className="p-6 bg-slate-50 mt-auto border-t space-y-3">
          <button onClick={() => setShowPasswordModal(true)} className="w-full flex items-center justify-center gap-2 text-[10px] font-black uppercase text-slate-500 hover:text-blue-600 transition-colors">
            <Lock size={12} /> Alterar Senha
          </button>
          <button onClick={onSignOut} className="w-full flex items-center justify-center gap-2 text-xs font-black uppercase text-slate-500 hover:text-red-600">
            <LogOut size={14} /> Sair do Sistema
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 p-4 sm:p-6 md:p-10 overflow-y-auto print:m-0 mt-16 lg:mt-0">
        {currentModule === 'entry' && <EntryModule userEmail={userEmail} fdas={fdasWithItems} allHistory={rawItems} addFda={addFda} toggleFda={toggleFda} updateFdaNumber={updateFdaNumber} deleteFda={deleteFda} saveItem={saveItem} updateItem={updateItem} deleteItem={deleteItem} editTarget={itemToEdit} clearEditTarget={() => setItemToEdit(null)} onEdit={triggerEdit} onPreview={(files, title) => setModalPreview({ title, files })} filiais={filiais} userFiliais={userFiliais} isMaster={isMaster} refreshData={refreshData} />}
        {currentModule === 'launched' && <LaunchedModule allItems={allItems} userPermissions={userPermissions} onEdit={triggerEdit} onDelete={deleteItem} onPreview={(files, title) => setModalPreview({ title: title || 'Visualização', files })} updateItem={updateItem} refreshData={refreshData} />}
        {currentModule === 'finance' && <FinanceModule allItems={allItems} isMaster={isMaster} userPermissions={userPermissions} updateItem={updateItem} onPreview={(files, title) => setModalPreview({ title, files })} onDelete={deleteItem} refreshData={refreshData} />}
        {currentModule === 'filiais' && isMaster && <FiliaisModule filiais={filiais} userEmail={userEmail} refreshData={refreshData} />}
        {currentModule === 'users' && isMaster && <UserManagementModule usersList={usersList} filiais={filiais} refreshData={refreshData} />}
        {currentModule === 'logs' && <LogsModule logs={logsList} refreshData={refreshData} />}
      </main>

      {/* Modal de Anexos */}
      {modalPreview && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-5 border-b flex justify-between items-center"><h3 className="font-black text-slate-800 uppercase text-xs tracking-widest flex gap-2"><Paperclip size={18} className="text-blue-600" /> {modalPreview.title}</h3><button onClick={() => setModalPreview(null)} className="p-2 hover:bg-slate-100 rounded-lg"><X size={20} /></button></div>
            <div className="p-8 max-h-[70vh] overflow-y-auto bg-slate-50/50">
              {modalPreview.files?.length > 0 ? (
                <ul className="space-y-4">
                  {modalPreview.files.map((file, idx) => (
                    <li key={idx} className="flex flex-col gap-3 p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-300 hover:shadow-md transition-all">
                      <div className="flex items-center gap-4">
                        {/* Thumbnail para imagens */}
                        {file.url && file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                          <img src={file.url} alt={file.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg flex-shrink-0"><FileText size={20} /></div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-700 truncate">{file.name}</p>
                          <p className="text-[10px] text-slate-400 font-black uppercase mt-0.5">{file.date || new Date().toLocaleString()}</p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          {/* Botão Download */}
                          <button
                            onClick={() => handleDownloadFile(file)}
                            className="px-3 py-2 text-[10px] font-black uppercase text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg transition-all flex items-center gap-1"
                            title="Download"
                          >
                            <Download size={12} /> Download
                          </button>
                          {/* Botão Visualizar */}
                          <button
                            onClick={() => handleViewFile(file)}
                            className="px-3 py-2 text-[10px] font-black uppercase text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition-all flex items-center gap-1"
                          >
                            <Eye size={12} /> Visualizar
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-center py-10 text-slate-400 font-medium italic"><AlertCircle className="mx-auto mb-2 text-slate-300" /> <p>Sem anexos.</p></div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Alterar Senha */}
      {showPasswordModal && (
        <ChangePasswordModal
          onClose={() => setShowPasswordModal(false)}
          onConfirm={handleChangePassword}
        />
      )}
    </div>
  );
};

// --- COMPONENTES AUXILIARES ---
const FdaNumberInput = ({ initialValue, onSave }) => {
  const [value, setValue] = useState(initialValue);

  // Sincronizar se o valor externo mudar (ex: refreshData)
  // mas apenas se o usuário não estiver com o foco (para não perder o que está digitando)
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleBlur = () => {
    if (value !== initialValue) {
      onSave(value);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  return (
    <input
      type="text"
      value={value}
      onClick={e => e.stopPropagation()}
      onChange={e => setValue(e.target.value.toUpperCase())}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="bg-transparent font-mono text-xl font-black text-blue-600 focus:outline-none w-full uppercase"
    />
  );
};

const FilterBar = ({ search, onSearchChange, sortBy, onSortChange, filterStatus, onFilterChange, showStatusFilter = false, groupBy, onGroupChange, showGroupBy = false }) => {
  const sortOptions = [
    { value: 'vencimento-asc', label: 'Vencimento (Mais Antigo)' },
    { value: 'vencimento-desc', label: 'Vencimento (Mais Recente)' },
    { value: 'valor-asc', label: 'Valor (Menor)' },
    { value: 'valor-desc', label: 'Valor (Maior)' },
    { value: 'servico-asc', label: 'Serviço (A-Z)' },
    { value: 'servico-desc', label: 'Serviço (Z-A)' },
    { value: 'categoria-asc', label: 'Categoria (A-Z)' },
    { value: 'categoria-desc', label: 'Categoria (Z-A)' }
  ];

  const statusOptions = [
    { value: 'all', label: 'Todos os Status' },
    { value: 'PENDENTE', label: 'Pendente' },
    { value: 'PROVISIONADO', label: 'Provisionado' },
    { value: 'APROVADO', label: 'Aprovado' },
    { value: 'PAGO', label: 'Pago' }
  ];

  const groupOptions = [
    { value: 'vencimento', label: 'Vencimento' },
    { value: 'cliente', label: 'Cliente/Fornecedor (A-Z)' },
    { value: 'servico', label: 'Serviço (A-Z)' },
    { value: 'categoria', label: 'Categoria (A-Z)' }
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 shadow-sm">
      <div className="flex flex-col md:flex-row gap-4">
        {/* Campo de Pesquisa */}
        <div className="flex-1 flex items-center gap-2 bg-slate-50 rounded-lg px-4 py-2 border border-slate-200">
          <Search className="text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Pesquisar por serviço, fornecedor, FDA..."
            className="flex-1 bg-transparent outline-none text-sm font-medium text-slate-700"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
          />
        </div>

        {/* Ordenação */}
        <div className="flex items-center gap-2">
          <ArrowUpDown className="text-slate-400" size={18} />
          <select
            value={sortBy}
            onChange={e => onSortChange(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors outline-none cursor-pointer"
          >
            {sortOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Filtro de Status (opcional) */}
        {showStatusFilter && (
          <div className="flex items-center gap-2">
            <Filter className="text-slate-400" size={18} />
            <select
              value={filterStatus}
              onChange={e => onFilterChange(e.target.value)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors outline-none cursor-pointer"
            >
              {statusOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Agrupamento (opcional) */}
        {showGroupBy && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest hidden lg:block">Agrupar por:</span>
            <select
              value={groupBy}
              onChange={e => onGroupChange(e.target.value)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors outline-none cursor-pointer"
            >
              {groupOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
};

const NavButton = ({ active, onClick, icon, label }) => (<button onClick={onClick} className={`w-full flex items-center gap-3 px-6 py-4 rounded-xl transition-all font-bold text-sm tracking-tight ${active ? 'bg-blue-600 text-white shadow-xl translate-x-1' : 'text-slate-400 hover:text-slate-800 hover:bg-slate-100'}`}>{icon}<span>{label}</span></button>);

// Componente de Botão de Exportação
const ExportButton = ({ data, filename, label = "Exportar Dados" }) => {
  const [showMenu, setShowMenu] = useState(false);

  const handleExport = (format) => {
    if (format === 'csv') {
      exportToCSV(data, filename);
    } else if (format === 'json') {
      exportToJSON(data, filename);
    } else if (format === 'excel') {
      exportToExcel(data, filename);
    }
    setShowMenu(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-green-700 transition-all shadow-md"
      >
        <Download size={16} />
        <span className="hidden sm:inline">{label}</span>
      </button>

      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-20">
            <button
              onClick={() => handleExport('excel')}
              className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors flex items-center gap-2 text-sm font-bold text-slate-700"
            >
              <FileSpreadsheet size={16} className="text-green-600" />
              Excel (.xls)
            </button>
            <button
              onClick={() => handleExport('csv')}
              className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors flex items-center gap-2 text-sm font-bold text-slate-700"
            >
              <FileText size={16} className="text-blue-600" />
              CSV (.csv)
            </button>
            <button
              onClick={() => handleExport('json')}
              className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors flex items-center gap-2 text-sm font-bold text-slate-700"
            >
              <FileIcon size={16} className="text-purple-600" />
              JSON (.json)
            </button>
          </div>
        </>
      )}
    </div>
  );
};
const StatusBadge = ({ status }) => {
  const styles = { 'PENDENTE': 'bg-red-100 text-red-600', 'PROVISIONADO': 'bg-yellow-100 text-yellow-700', 'APROVADO': 'bg-blue-100 text-blue-700', 'PAGO': 'bg-green-100 text-green-700' };
  return (<span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg tracking-widest ${styles[status] || styles['PENDENTE']}`}>{status}</span>);
};
const InputField = ({ label, type = "text", value, onChange, placeholder = "", highlight = false, list }) => (<div className="flex flex-col gap-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label><input list={list} type={type} value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} placeholder={placeholder} className={`w-full px-4 py-2.5 border rounded-xl text-sm font-bold transition-all outline-none uppercase ${highlight ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 focus:border-blue-400 focus:bg-white text-slate-700'}`} /></div>);
const FileUploadButton = ({ label, icon, onUpload, color, isUploading = false }) => {
  const inputId = `file-${label}-${Math.random()}`;
  const colors = { blue: 'bg-blue-50 text-blue-600 hover:bg-blue-100', slate: 'bg-slate-50 text-slate-500 hover:bg-slate-100' };

  const handleFileChange = (e) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];

      // Validar arquivo
      const validation = validateFile(file);
      if (!validation.valid) {
        alert(validation.error);
        e.target.value = '';
        return;
      }

      // Passou na validação
      onUpload({
        file,
        name: file.name,
        size: formatFileSize(file.size),
        date: new Date().toLocaleString()
      });

      // Limpar input para permitir mesmo arquivo novamente
      e.target.value = '';
    }
  };

  return (
    <div className="flex-1">
      <input
        type="file"
        id={inputId}
        className="hidden"
        onChange={handleFileChange}
        disabled={isUploading}
      />
      <label
        htmlFor={inputId}
        className={`flex items-center justify-center gap-2 p-3 border border-dashed rounded-xl cursor-pointer font-black text-[10px] uppercase tracking-wider transition-all ${isUploading ? 'opacity-50 cursor-not-allowed' : colors[color]}`}
      >
        {isUploading ? (
          <>
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            Enviando...
          </>
        ) : (
          <>
            {icon} {label}
          </>
        )}
      </label>
    </div>
  );
};

// --- MÓDULOS ---

const LogsModule = ({ logs }) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('data-desc');
  const [filterAction, setFilterAction] = useState('all');

  // Extrair ações únicas para o filtro
  const uniqueActions = useMemo(() => {
    const actions = [...new Set(logs.map(log => log.action))];
    return ['all', ...actions.sort()];
  }, [logs]);

  // Função de ordenação
  const applySorting = (items) => {
    const sorted = [...items];
    switch (sortBy) {
      case 'data-asc':
        return sorted.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      case 'data-desc':
        return sorted.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      case 'usuario-asc':
        return sorted.sort((a, b) => a.user.localeCompare(b.user));
      case 'usuario-desc':
        return sorted.sort((a, b) => b.user.localeCompare(a.user));
      case 'acao-asc':
        return sorted.sort((a, b) => a.action.localeCompare(b.action));
      case 'acao-desc':
        return sorted.sort((a, b) => b.action.localeCompare(a.action));
      default:
        return sorted;
    }
  };

  // Filtragem de Logs
  const filteredLogs = useMemo(() => {
    let filtered = logs;

    // Filtro por texto
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(log =>
        log.user.toLowerCase().includes(s) ||
        log.action.toLowerCase().includes(s) ||
        log.details.toLowerCase().includes(s)
      );
    }

    // Filtro por ação
    if (filterAction !== 'all') {
      filtered = filtered.filter(log => log.action === filterAction);
    }

    // Aplicar ordenação
    return applySorting(filtered);
  }, [logs, search, sortBy, filterAction]);

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight uppercase">Logs do Sistema</h2>
            <p className="text-slate-500 font-medium mt-1">Auditoria de ações dos usuários</p>
          </div>
          <ExportButton
            data={filteredLogs.map(log => ({
              'Data/Hora': new Date(log.timestamp).toLocaleString('pt-BR'),
              'Usuário': log.user,
              'Ação': log.action,
              'Detalhes': log.details
            }))}
            filename="logs-sistema"
            label="Exportar"
          />
        </div>

        {/* Barra de Filtros Customizada para Logs */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Campo de Pesquisa */}
            <div className="flex-1 flex items-center gap-2 bg-slate-50 rounded-lg px-4 py-2 border border-slate-200">
              <Search className="text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Pesquisar usuário, ação ou detalhes..."
                className="flex-1 bg-transparent outline-none text-sm font-medium text-slate-700"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Filtro por Ação */}
            <div className="flex items-center gap-2">
              <Filter className="text-slate-400" size={18} />
              <select
                value={filterAction}
                onChange={e => setFilterAction(e.target.value)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors outline-none cursor-pointer"
              >
                <option value="all">Todas as Ações</option>
                {uniqueActions.filter(a => a !== 'all').map(action => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
            </div>

            {/* Ordenação */}
            <div className="flex items-center gap-2">
              <ArrowUpDown className="text-slate-400" size={18} />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors outline-none cursor-pointer"
              >
                <option value="data-desc">Data (Mais Recente)</option>
                <option value="data-asc">Data (Mais Antigo)</option>
                <option value="usuario-asc">Usuário (A-Z)</option>
                <option value="usuario-desc">Usuário (Z-A)</option>
                <option value="acao-asc">Ação (A-Z)</option>
                <option value="acao-desc">Ação (Z-A)</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="p-5 font-black uppercase text-[10px] tracking-widest text-slate-400 cursor-pointer hover:text-blue-600" onClick={() => setSortBy(sortBy === 'data-asc' ? 'data-desc' : 'data-asc')}>
                Data/Hora {sortBy.includes('data') && (sortBy.includes('asc') ? '↑' : '↓')}
              </th>
              <th className="p-5 font-black uppercase text-[10px] tracking-widest text-slate-400 cursor-pointer hover:text-blue-600" onClick={() => setSortBy(sortBy === 'usuario-asc' ? 'usuario-desc' : 'usuario-asc')}>
                Usuário {sortBy.includes('usuario') && (sortBy.includes('asc') ? '↑' : '↓')}
              </th>
              <th className="p-5 font-black uppercase text-[10px] tracking-widest text-slate-400 cursor-pointer hover:text-blue-600" onClick={() => setSortBy(sortBy === 'acao-asc' ? 'acao-desc' : 'acao-asc')}>
                Ação {sortBy.includes('acao') && (sortBy.includes('asc') ? '↑' : '↓')}
              </th>
              <th className="p-5 font-black uppercase text-[10px] tracking-widest text-slate-400">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan="4" className="p-10 text-center text-slate-400 italic">
                  {search || filterAction !== 'all' ? 'Nenhum registro encontrado com os filtros aplicados.' : 'Nenhum registro encontrado.'}
                </td>
              </tr>
            ) : (
              filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="p-5 font-mono text-xs text-slate-600">{new Date(log.timestamp).toLocaleString('pt-BR')}</td>
                  <td className="p-5 font-bold text-slate-700">{log.user}</td>
                  <td className="p-5">
                    <span className="font-black text-[10px] uppercase bg-slate-100 rounded px-2 py-1 text-slate-600">
                      {log.action}
                    </span>
                  </td>
                  <td className="p-5 text-slate-600 text-sm">{log.details}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Contador de Resultados */}
      <div className="mt-4 text-center text-sm text-slate-500 font-medium">
        Exibindo {filteredLogs.length} de {logs.length} registros
      </div>
    </div>
  );
};


const EntryModule = ({ userEmail, fdas, addFda, toggleFda, updateFdaNumber, deleteFda, saveItem, updateItem, deleteItem, allHistory, editTarget, clearEditTarget, onEdit, onPreview, filiais, userFiliais, isMaster }) => {
  const [activeFdaId, setActiveFdaId] = useState(null);
  const [selectedFilial, setSelectedFilial] = useState('');
  const [formData, setFormData] = useState({
    status: 'PENDENTE', navio: '', vencimento: '', servicos: '', categoria: '', documento: '', dataEmissao: '',
    valorBruto: 0, centroCusto: '', nfs: '', valorBase: 0, valorLiquido: 0, cartaCredito: 0,
    pis: 0, cofins: 0, csll: 0, guia5952: 0, irrf: 0, guia1708: 0, inss: 0, iss: 0, impostoRet: 0, multa: 0, juros: 0, total: 0,
    clienteFornecedor: '', cnpjCpf: '',
    banco: '', codigoBanco: '', agencia: '', contaCorrente: '', chavePix: '', dataPagamento: '', valorPago: 0, jurosPagos: 0
  });
  const [anexosNF, setAnexosNF] = useState([]);
  const [anexosBoleto, setAnexosBoleto] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [previewImage, setPreviewImage] = useState(null);

  // Auto-fill Suggestions
  const clients = useMemo(() => [...new Set(allHistory.map(i => i.data.clienteFornecedor).filter(Boolean))], [allHistory]);
  const vessels = useMemo(() => [...new Set(allHistory.map(i => i.data.navio).filter(Boolean))], [allHistory]);
  const categories = useMemo(() => [...new Set(allHistory.map(i => i.data.categoria).filter(Boolean))], [allHistory]);

  useEffect(() => {
    if (editTarget) {
      setFormData(editTarget.data);
      setAnexosNF(editTarget.anexosNF || []);
      setAnexosBoleto(editTarget.anexosBoleto || []);
      setActiveFdaId(editTarget.fdaId);
      const fda = fdas.find(f => f.id === editTarget.fdaId);
      if (fda && !fda.isOpen) toggleFda(fda.id, false);
    }
  }, [editTarget]);

  const handleInputChange = (field, value) => {
    let newData = { ...formData, [field]: value };
    if (field === 'clienteFornecedor') {
      const lastEntry = allHistory.find(i => i.data.clienteFornecedor === value);
      if (lastEntry) {
        newData.banco = lastEntry.data.banco || '';
        newData.codigoBanco = lastEntry.data.codigoBanco || '';
        newData.agencia = lastEntry.data.agencia || '';
        newData.contaCorrente = lastEntry.data.contaCorrente || '';
        newData.chavePix = lastEntry.data.chavePix || '';
        newData.cnpjCpf = lastEntry.data.cnpjCpf || '';
      }
    }
    const taxFields = ['valorBruto', 'cartaCredito', 'inss', 'iss', 'multa', 'juros', 'pis', 'cofins', 'csll', 'irrf'];

    if (taxFields.includes(field)) {
      const v = parseFloat(field === 'valorBruto' ? value : newData.valorBruto) || 0;
      const cartaCredito = parseFloat(field === 'cartaCredito' ? value : newData.cartaCredito) || 0;
      const multa = parseFloat(field === 'multa' ? value : newData.multa) || 0;
      const juros = parseFloat(field === 'juros' ? value : newData.juros) || 0;
      const inss = parseFloat(field === 'inss' ? value : newData.inss) || 0;
      const iss = parseFloat(field === 'iss' ? value : newData.iss) || 0;

      // Auto-calc taxes ONLY if changing Valor Bruto
      if (field === 'valorBruto') {
        newData.pis = Number((v * 0.0065).toFixed(2));
        newData.cofins = Number((v * 0.03).toFixed(2));
        newData.csll = Number((v * 0.01).toFixed(2));
        newData.irrf = Number((v * 0.015).toFixed(2));
      }

      // Recalculate Aggregates based on current values (whether auto-calculated or manually changed)
      const pis = parseFloat(newData.pis) || 0;
      const cofins = parseFloat(newData.cofins) || 0;
      const csll = parseFloat(newData.csll) || 0;
      const irrf = parseFloat(newData.irrf) || 0;

      newData.guia5952 = Number((pis + cofins + csll).toFixed(2));
      newData.guia1708 = Number(irrf.toFixed(2));
      newData.valorBase = v;

      const totalRet = (newData.guia5952 || 0) + (newData.guia1708 || 0) + inss + iss;
      newData.impostoRet = totalRet;

      // Total Líquido = Valor Bruto - Impostos - Carta de Crédito
      newData.valorLiquido = v - totalRet - cartaCredito;

      // Total = Valor Líquido + Multa + Juros
      newData.total = newData.valorLiquido + multa + juros;
    }
    setFormData(newData);
  };

  // Função para gerar preview de imagem
  const generateImagePreview = (file) => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewImage({ name: file.name, url: e.target.result });
      };
      reader.readAsDataURL(file);
    }
  };

  // Função para deletar arquivo com confirmação
  const handleDeleteFile = (file, source) => {
    if (window.confirm(`Deseja deletar o arquivo "${file.name}"?`)) {
      if (source === 'nf') {
        setAnexosNF(anexosNF.filter(f => f !== file));
      } else {
        setAnexosBoleto(anexosBoleto.filter(f => f !== file));
      }
      logAction(userEmail, 'DELETAR ARQUIVO LOCAL', `Arquivo removido: ${file.name}`);
    }
  };

  // Função para download de arquivo
  const handleDownloadFile = async (file) => {
    try {
      let base64Url = file.url;

      // Se for chunked
      if (file.fileId) {
        // TODO: Adicionar feedback de loading pro usuário aqui seria bom
        const rebuiltBase64 = await getFileFromChunks(file.fileId);
        if (rebuiltBase64) {
          base64Url = rebuiltBase64;
        } else {
          alert("Não foi possível recuperar o conteúdo do arquivo.");
          return;
        }
      }

      if (base64Url) {
        // Arquivo já salvo (Base64 ou URL antiga)
        if (base64Url.startsWith('data:')) {
          // Base64
          const a = document.createElement('a');
          a.href = base64Url;
          a.download = file.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          // URL antiga
          const response = await fetch(base64Url);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = file.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } else if (file.file) {
        // Arquivo local (antes de salvar)
        const url = URL.createObjectURL(file.file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      logAction(userEmail, 'DOWNLOAD ARQUIVO', `Arquivo baixado: ${file.name}`);
    } catch (error) {
      console.error('Erro ao baixar arquivo:', error);
      alert('Erro ao baixar arquivo');
    }
  };

  const handleSave = async (fdaId) => {
    // Validação básica
    if (!formData.servicos || !formData.vencimento) {
      alert('Por favor, preencha os campos obrigatórios: Serviço e Vencimento');
      return;
    }

    // Previne múltiplos cliques
    if (isSaving) {
      return;
    }

    setIsSaving(true);

    try {
      if (editTarget) {
        // Atualiza o item existente (não cria duplicado)
        // CORREÇÃO: updateItem espera (id, data, filesNF, filesBoleto)
        // Agora passamos os arrays mesmo se vazios, para permitir exclusão
        await updateItem(editTarget.id, formData, anexosNF, anexosBoleto);
        clearEditTarget();
      } else {
        // Cria novo item
        await saveItem(fdaId, formData, anexosNF, anexosBoleto);
      }

      // Limpa o formulário após sucesso
      setFormData({
        status: 'PENDENTE', navio: '', vencimento: '', servicos: '', categoria: '', documento: '', dataEmissao: '', valorBruto: 0, centroCusto: '', nfs: '', valorBase: 0, valorLiquido: 0, pis: 0, cofins: 0, csll: 0, guia5952: 0, irrf: 0, guia1708: 0, inss: 0, iss: 0, impostoRet: 0, multa: 0, juros: 0, total: 0, clienteFornecedor: '', cnpjCpf: '', banco: '', codigoBanco: '', agencia: '', contaCorrente: '', chavePix: '', dataPagamento: '', valorPago: 0, jurosPagos: 0
      });
      setAnexosNF([]);
      setAnexosBoleto([]);
      setActiveFdaId(null);

      // Feedback de sucesso
      alert(editTarget ? '✓ Item atualizado com sucesso!' : '✓ Item gravado com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('❌ Erro ao salvar o item. Verifique os anexos e tente novamente.\n\nDetalhes: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <datalist id="clients-list">{clients.map(c => <option key={c} value={c} />)}</datalist>
      <datalist id="vessels-list">{vessels.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="categories-list">{categories.map(c => <option key={c} value={c} />)}</datalist>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10">
        <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight uppercase">Lançamento de Itens</h2>
        <div className="flex flex-wrap items-center gap-4">
          <ExportButton
            data={fdas.flatMap(fda =>
              fda.items.map(item => ({
                'Atendimento': fda.number,
                'Filial': filiais.find(f => f.id === fda.filialId)?.nome || 'N/A',
                'Serviço': item.data.servicos,
                'Cliente/Fornecedor': item.data.clienteFornecedor,
                'CNPJ/CPF': item.data.cnpjCpf || 'N/A',
                'Navio': item.data.navio || 'N/A',
                'Documento': item.data.documento || 'N/A',
                'NF': item.data.nfs || 'N/A',
                'Emissão': item.data.dataEmissao || 'N/A',
                'Vencimento': item.data.vencimento || 'N/A',
                'Valor Bruto': parseFloat(item.data.valorBruto || 0).toFixed(2),
                'Carta de Crédito': parseFloat(item.data.cartaCredito || 0).toFixed(2),
                'Valor Líquido': parseFloat(item.data.valorLiquido || 0).toFixed(2),
                'Status': item.data.status,
                'Centro Custo': item.data.centroCusto || 'N/A',
                'Banco': item.data.banco || 'N/A',
                'Agência': item.data.agencia || 'N/A',
                'Conta': item.data.contaCorrente || 'N/A',
                'PIX': item.data.chavePix || 'N/A'
              }))
            )}
            filename="lancamentos"
            label="Exportar"
          />
          <select
            value={selectedFilial}
            onChange={(e) => setSelectedFilial(e.target.value)}
            className="px-4 py-3 bg-white border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all text-sm font-bold"
          >
            <option value="">Selecione a Filial</option>
            {(isMaster ? filiais : filiais.filter(f => userFiliais.includes(f.id))).map(filial => (
              <option key={filial.id} value={filial.id}>{filial.nome}</option>
            ))}
          </select>
          <button onClick={() => addFda(selectedFilial)} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest flex items-center gap-2 hover:bg-slate-800 shadow-xl transition-all whitespace-nowrap"><Plus size={18} /> Novo Atendimento</button>
        </div>
      </div>
      <div className="space-y-8">{fdas.map(f => (
        <div key={f.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 p-6 flex justify-between items-center cursor-pointer" onClick={() => toggleFda(f.id, f.isOpen)}>
            <div className="flex items-center gap-5">
              <div className={`p-2 rounded-lg ${f.isOpen ? 'bg-blue-100 text-blue-600' : 'bg-slate-200'}`}>{f.isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>
              <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Numero de Atendimento</label><FdaNumberInput initialValue={f.number} onSave={(val) => updateFdaNumber(f.id, val)} /></div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={e => { e.stopPropagation(); deleteFda(f.id, f.number); }} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir atendimento vazio"><Trash2 size={18} /></button>
              <button onClick={e => { e.stopPropagation(); setActiveFdaId(activeFdaId === f.id ? null : f.id); }} className="bg-white border-2 border-blue-600 text-blue-600 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest">{activeFdaId === f.id ? 'Fechar' : 'Novo Lançamento'}</button>
            </div>
          </div>

          {activeFdaId === f.id && (
            <div className="p-8 border-t border-blue-100 bg-blue-50/20">
              <h4 className="font-black text-blue-600 uppercase tracking-widest mb-6 border-b pb-2 flex justify-between">
                <span>{editTarget ? 'Editando Item' : 'Novo Item'}</span>
                {editTarget && <button onClick={clearEditTarget} className="text-red-500 text-[10px] underline">Cancelar Edição</button>}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-4">
                  <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dados Principais</h5>
                  <InputField label="Navio (Vessel)" list="vessels-list" value={formData.navio} onChange={v => handleInputChange('navio', v)} />
                  <div className="grid grid-cols-2 gap-2">
                    <InputField label="Serviços" value={formData.servicos} onChange={v => handleInputChange('servicos', v)} />
                    <InputField label="Categoria" list="categories-list" value={formData.categoria} onChange={v => handleInputChange('categoria', v)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <InputField label="Documento" value={formData.documento} onChange={v => handleInputChange('documento', v)} />
                    <InputField label="NF (Invoice)" value={formData.nfs} onChange={v => handleInputChange('nfs', v)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <InputField label="Emissão" type="date" value={formData.dataEmissao} onChange={v => handleInputChange('dataEmissao', v)} />
                    <InputField label="Vencimento" type="date" value={formData.vencimento} onChange={v => handleInputChange('vencimento', v)} />
                  </div>
                </div>
                <div className="space-y-4">
                  <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Financeiro & Impostos</h5>
                  <div className="grid grid-cols-2 gap-2">
                    <InputField label="Valor Bruto" type="number" value={formData.valorBruto} onChange={v => handleInputChange('valorBruto', v)} highlight />
                    <InputField label="Carta de Crédito" type="number" value={formData.cartaCredito} onChange={v => handleInputChange('cartaCredito', v)} highlight />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <InputField label="PIS (0.65%)" type="number" value={formData.pis} onChange={v => handleInputChange('pis', v)} />
                    <InputField label="COFINS (3%)" type="number" value={formData.cofins} onChange={v => handleInputChange('cofins', v)} />
                    <InputField label="CSLL (1%)" type="number" value={formData.csll} onChange={v => handleInputChange('csll', v)} />
                    <InputField label="IRRF (1.5%)" type="number" value={formData.irrf} onChange={v => handleInputChange('irrf', v)} />
                    <InputField label="INSS" type="number" value={formData.inss} onChange={v => handleInputChange('inss', v)} />
                    <InputField label="ISS" type="number" value={formData.iss} onChange={v => handleInputChange('iss', v)} />
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-200">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Total Líquido</p>
                    <p className="text-2xl font-black text-blue-900">R$ {(formData.valorLiquido || 0).toFixed(2)}</p>
                    <p className="text-[9px] text-blue-600 mt-1 font-medium">Valor Bruto - Impostos - Carta de Crédito</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pagamento & Anexos</h5>
                  <InputField label="Cliente / Fornecedor" list="clients-list" value={formData.clienteFornecedor} onChange={v => handleInputChange('clienteFornecedor', v)} />
                  <div className="grid grid-cols-2 gap-2">
                    <InputField label="Banco" value={formData.banco} onChange={v => handleInputChange('banco', v)} />
                    <InputField label="Agência" value={formData.agencia} onChange={v => handleInputChange('agencia', v)} />
                    <InputField label="Conta" value={formData.contaCorrente} onChange={v => handleInputChange('contaCorrente', v)} />
                    <InputField label="PIX" value={formData.chavePix} onChange={v => handleInputChange('chavePix', v)} />
                  </div>
                  <div className="flex gap-2 mt-4">
                    <FileUploadButton label="Nota" icon={<Receipt size={14} />} onUpload={fileData => {
                      setAnexosNF([...anexosNF, fileData]);
                      generateImagePreview(fileData.file);
                    }} color="blue" isUploading={isUploading} />
                    <FileUploadButton label="Boleto" icon={<Banknote size={14} />} onUpload={fileData => {
                      setAnexosBoleto([...anexosBoleto, fileData]);
                      generateImagePreview(fileData.file);
                    }} color="slate" isUploading={isUploading} />
                  </div>

                  {/* Preview de Imagem */}
                  {previewImage && (
                    <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Visualização</span>
                        <button onClick={() => setPreviewImage(null)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                      </div>
                      <img src={previewImage.url} alt={previewImage.name} className="max-h-48 rounded-lg object-contain mx-auto" />
                      <p className="text-[10px] text-slate-600 font-bold mt-2 truncate">{previewImage.name}</p>
                    </div>
                  )}

                  {/* Lista de Arquivos com Melhorias */}
                  <div className="space-y-2 mt-4">
                    {[...anexosNF, ...anexosBoleto].map((file, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 hover:border-blue-300 transition-all group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {file.file?.type.startsWith('image/') ? (
                              <img src={URL.createObjectURL(file.file)} alt={file.name} className="w-8 h-8 rounded object-cover" />
                            ) : (
                              <FileText size={16} className="text-slate-400 flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-bold text-xs text-slate-800">{file.name}</p>
                              <p className="text-[9px] text-slate-400">Tamanho: {file.size || 'N/A'}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1 ml-2 flex-shrink-0">
                          <button
                            onClick={() => handleDownloadFile(file)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Download"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteFile(file, anexosNF.includes(file) ? 'nf' : 'boleto')}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Deletar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Banner de Status de Salvamento */}
                  {isSaving && (
                    <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mt-4 animate-pulse">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <div>
                          <p className="font-black text-blue-800 text-sm uppercase tracking-wide">
                            {anexosNF.filter(f => f.file).length + anexosBoleto.filter(f => f.file).length > 0
                              ? '📤 Enviando arquivos para o servidor...'
                              : '💾 Salvando dados...'}
                          </p>
                          <p className="text-xs text-blue-600 mt-1">Por favor, aguarde. Não feche esta janela.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => handleSave(f.id)}
                    disabled={isSaving || isUploading}
                    className="w-full py-4 bg-green-600 text-white font-black uppercase tracking-widest rounded-xl hover:bg-green-700 shadow-lg mt-6 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                        {anexosNF.length > 0 || anexosBoleto.length > 0 ? 'Enviando Arquivos...' : 'Salvando...'}
                      </>
                    ) : (
                      <>
                        <Save size={18} />
                        {editTarget ? 'Atualizar Item' : 'Gravar Lançamento'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {f.isOpen && (
            <div className="p-6 space-y-4">
              {f.items.map((it, idx) => (
                <div key={it.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-blue-300 shadow-sm transition-all">
                  <div className="p-5 flex justify-between items-center">
                    <div className="flex gap-5 items-center">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-black text-slate-400 text-[10px]">{idx + 1}</div>
                      <div>
                        <p className="font-black text-slate-700 uppercase text-sm">{it.data.servicos}</p>
                        <p className="text-[10px] text-slate-400 font-black uppercase">DOC: {it.data.documento} • R$ {it.data.valorLiquido}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <StatusBadge status={it.data.status} />
                      <button onClick={() => {
                        if (it.anexosNF && it.anexosNF.length > 0) onPreview(it.anexosNF, "Nota Fiscal");
                        else alert("Sem Nota Fiscal anexada");
                      }} className="p-1 px-2 text-[10px] uppercase font-bold text-blue-600 hover:bg-blue-50 rounded bg-transparent border border-blue-100 mr-1">Nota</button>
                      <button onClick={() => {
                        if (it.anexosBoleto && it.anexosBoleto.length > 0) onPreview(it.anexosBoleto, "Boleto");
                        else alert("Sem Boleto anexado");
                      }} className="p-1 px-2 text-[10px] uppercase font-bold text-slate-500 hover:bg-slate-50 rounded bg-transparent border border-slate-200 mr-2">Boleto</button>
                      <button onClick={(e) => { e.stopPropagation(); onEdit(it); }} className="p-2 text-slate-300 hover:text-blue-600"><Edit size={16} /></button>
                      <button onClick={() => deleteItem(it.id)} className="p-2 text-slate-300 hover:text-red-600"><Trash2 size={16} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}</div>
    </div>
  );
};

const LaunchedModule = ({ allItems, onDelete, onEdit, onPreview, userPermissions, updateItem, refreshData }) => {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('abertos');
  const [sortBy, setSortBy] = useState('vencimento-asc');
  const [filterStatus, setFilterStatus] = useState('all');
  const [eO, setEO] = useState(false);
  const exportRef = useRef(null);

  // Estado do modal de comprovante
  const [comprovanteModal, setComprovanteModal] = useState(null); // { item } ou null
  const [comprovanteFile, setComprovanteFile] = useState(null);
  const [comprovanteUploading, setComprovanteUploading] = useState(false);
  const comprovanteInputRef = useRef(null);

  const handleAnexarComprovante = async () => {
    if (!comprovanteFile || !comprovanteModal) return;
    // Validação básica
    const ext = '.' + comprovanteFile.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      alert('Tipo de arquivo não permitido. Use: PDF, PNG, JPG ou XLSX');
      return;
    }
    if (comprovanteFile.size > MAX_FILE_SIZE) {
      alert('Arquivo muito grande. Tamanho máximo: 5MB');
      return;
    }
    setComprovanteUploading(true);
    try {
      const fileId = await saveFileChunks(comprovanteFile);
      const novoComprovante = {
        name: comprovanteFile.name,
        fileId,
        date: new Date().toLocaleString('pt-BR'),
        size: formatFileSize(comprovanteFile.size)
      };
      const item = comprovanteModal.item;
      const comprovantesAtuais = item.comprovantes || [];
      await updateItem(item.id, item.data, null, null, [...comprovantesAtuais, novoComprovante]);
      alert('✓ Comprovante anexado com sucesso!');
      setComprovanteModal(null);
      setComprovanteFile(null);
      if (refreshData) refreshData();
    } catch (err) {
      alert('Erro ao anexar comprovante: ' + err.message);
    } finally {
      setComprovanteUploading(false);
    }
  };

  // Verificação de Permissão para Abas
  const canViewOpen = userPermissions.includes('all_tabs') || userPermissions.includes('launched_open');
  const canViewPaid = userPermissions.includes('all_tabs') || userPermissions.includes('launched_paid');

  // Ajusta a aba padrão se o usuário não tiver acesso à 'abertos'
  useEffect(() => {
    if (!canViewOpen && canViewPaid) setTab('liquidados');
  }, [canViewOpen, canViewPaid]);

  useEffect(() => { const h = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setEO(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);

  // Função de ordenação
  const applySorting = (items) => {
    const sorted = [...items];
    switch (sortBy) {
      case 'vencimento-asc':
        return sorted.sort((a, b) => new Date(a.data.vencimento) - new Date(b.data.vencimento));
      case 'vencimento-desc':
        return sorted.sort((a, b) => new Date(b.data.vencimento) - new Date(a.data.vencimento));
      case 'valor-asc':
        return sorted.sort((a, b) => parseFloat(a.data.total) - parseFloat(b.data.total));
      case 'valor-desc':
        return sorted.sort((a, b) => parseFloat(b.data.total) - parseFloat(a.data.total));
      case 'servico-asc':
        return sorted.sort((a, b) => (a.data.servicos || '').localeCompare(b.data.servicos || ''));
      case 'servico-desc':
        return sorted.sort((a, b) => (b.data.servicos || '').localeCompare(a.data.servicos || ''));
      case 'categoria-asc':
        return sorted.sort((a, b) => (a.data.categoria || '').localeCompare(b.data.categoria || ''));
      case 'categoria-desc':
        return sorted.sort((a, b) => (b.data.categoria || '').localeCompare(a.data.categoria || ''));
      default:
        return sorted;
    }
  };

  const filtered = useMemo(() => {
    let items = allItems.filter(i => {
      const matchText = (
        (i.data.servicos || '').toLowerCase().includes(search.toLowerCase()) ||
        (i.data.categoria || '').toLowerCase().includes(search.toLowerCase()) ||
        (i.fdaNumber || '').toLowerCase().includes(search.toLowerCase()) ||
        (i.data.clienteFornecedor || '').toLowerCase().includes(search.toLowerCase())
      );
      const matchTab = tab === 'abertos' ? i.data.status !== 'PAGO' : i.data.status === 'PAGO';
      const matchStatus = filterStatus === 'all' ? true : i.data.status === filterStatus;
      return matchText && matchTab && matchStatus;
    });
    return applySorting(items);
  }, [allItems, search, tab, sortBy, filterStatus]);

  if (!canViewOpen && !canViewPaid) return <div className="text-center py-20 text-slate-400">Acesso restrito a este módulo.</div>;

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight uppercase">Itens Lançados</h2>
          <ExportButton
            data={filtered.map(item => ({
              'FDA': item.fdaNumber,
              'Filial': item.filialName,
              'Categoria': item.data.categoria || 'N/A',
              'Serviço': item.data.servicos,
              'Cliente/Fornecedor': item.data.clienteFornecedor,
              'CNPJ/CPF': item.data.cnpjCpf || 'N/A',
              'Navio': item.data.navio || 'N/A',
              'Documento': item.data.documento || 'N/A',
              'NF': item.data.nfs || 'N/A',
              'Vencimento': item.data.vencimento,
              'Valor Total': `R$ ${parseFloat(item.data.valorLiquido || 0).toFixed(2)}`,
              'Status': item.data.status,
              'Centro Custo': item.data.centroCusto || 'N/A',
              'Data Provisionamento': item.data.dataProvisionamento || 'N/A',
              'Data Aprovação': item.data.dataAprovacao || 'N/A',
              'Data Pagamento': item.data.dataPagamentoReal || 'N/A'
            }))}
            filename={`itens-lancados-${tab}`}
            label="Exportar"
          />
        </div>

        {/* Barra de Filtros */}
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          sortBy={sortBy}
          onSortChange={setSortBy}
          filterStatus={filterStatus}
          onFilterChange={setFilterStatus}
          showStatusFilter={tab === 'abertos'}
        />
      </header>

      <div className="flex gap-4 mb-6">
        {canViewOpen && <button onClick={() => setTab('abertos')} className={`px-6 py-2 rounded-full font-black uppercase text-[10px] tracking-widest transition-all ${tab === 'abertos' ? 'bg-slate-800 text-white' : 'bg-white text-slate-400 border'}`}>Em Aberto</button>}
        {canViewPaid && <button onClick={() => setTab('liquidados')} className={`px-6 py-2 rounded-full font-black uppercase text-[10px] tracking-widest transition-all ${tab === 'liquidados' ? 'bg-green-600 text-white' : 'bg-white text-slate-400 border'}`}>Liquidados</button>}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-blue-600" onClick={() => setSortBy(sortBy === 'vencimento-asc' ? 'vencimento-desc' : 'vencimento-asc')}>
                Vencimento {sortBy.includes('vencimento') && (sortBy.includes('asc') ? '↑' : '↓')}
              </th>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-blue-600" onClick={() => setSortBy(sortBy === 'categoria-asc' ? 'categoria-desc' : 'categoria-asc')}>
                Categoria {sortBy.includes('categoria') && (sortBy.includes('asc') ? '↑' : '↓')}
              </th>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-blue-600" onClick={() => setSortBy(sortBy === 'servico-asc' ? 'servico-desc' : 'servico-asc')}>
                Serviço / FDA {sortBy.includes('servico') && (sortBy.includes('asc') ? '↑' : '↓')}
              </th>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right cursor-pointer hover:text-blue-600" onClick={() => setSortBy(sortBy === 'valor-asc' ? 'valor-desc' : 'valor-asc')}>
                Valor {sortBy.includes('valor') && (sortBy.includes('asc') ? '↑' : '↓')}
              </th>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
              <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 font-medium">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="5" className="p-10 text-center text-slate-400 italic">Nenhum item encontrado com os filtros aplicados.</td>
              </tr>
            ) : (
              filtered.map(i => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="p-5 font-bold text-slate-800">{i.data.vencimento ? new Date(i.data.vencimento.includes('T') ? i.data.vencimento : `${i.data.vencimento}T12:00:00`).toLocaleDateString('pt-BR') : 'Sem Data'}</td>
                  <td className="p-5 font-black text-slate-600 uppercase text-xs">{i.data.categoria || '-'}</td>
                  <td className="p-5">
                    <div className="font-black text-slate-800 uppercase text-xs">{i.data.servicos}</div>
                    <div className="text-[10px] text-blue-600 font-black mt-1">{i.fdaNumber}</div>
                    <div className="text-[10px] text-slate-400 font-medium mt-1">{i.data.clienteFornecedor}</div>
                  </td>
                  <td className="p-5 text-right font-black text-slate-900">R$ {parseFloat(i.data.valorLiquido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="p-5 text-center"><StatusBadge status={i.data.status} /></td>
                  <td className="p-5 text-center">
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <div className="flex gap-1 mr-2">
                        <button onClick={() => onPreview(i.anexosNF, "Nota Fiscal")} className={`p-1 px-2 text-[9px] uppercase font-bold rounded border ${i.anexosNF?.length > 0 ? 'text-blue-600 border-blue-200 hover:bg-blue-50' : 'text-slate-300 border-slate-100'}`} disabled={!i.anexosNF?.length}>Nota</button>
                        <button onClick={() => onPreview(i.anexosBoleto, "Boleto")} className={`p-1 px-2 text-[9px] uppercase font-bold rounded border ${i.anexosBoleto?.length > 0 ? 'text-slate-600 border-slate-200 hover:bg-slate-50' : 'text-slate-300 border-slate-100'}`} disabled={!i.anexosBoleto?.length}>Boleto</button>
                        {tab === 'liquidados' && (
                          <button
                            onClick={() => onPreview(i.comprovantes, "Comprovantes")}
                            className={`p-1 px-2 text-[9px] uppercase font-bold rounded border ${i.comprovantes?.length > 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' : 'bg-slate-50 text-slate-300 border-slate-100'}`}
                            disabled={!i.comprovantes?.length}
                            title={i.comprovantes?.length ? `${i.comprovantes.length} comprovante(s)` : 'Sem comprovantes'}
                          >🧾 Comp.</button>
                        )}
                      </div>
                      {tab === 'liquidados' && (
                        <button
                          onClick={() => { setComprovanteModal({ item: i }); setComprovanteFile(null); }}
                          className="flex items-center gap-1 px-3 py-1.5 text-[9px] uppercase font-black rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-sm"
                          title="Anexar comprovante de pagamento"
                        >
                          <Paperclip size={11} /> Comprovante
                        </button>
                      )}
                      <button onClick={() => onEdit(i)} className="p-2 text-slate-400 hover:text-blue-600" title="Editar"><Edit size={18} /></button>
                      <button onClick={() => onDelete(i.id)} className="p-2 text-slate-400 hover:text-red-600" title="Excluir"><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Contador de Resultados */}
      <div className="mt-4 text-center text-sm text-slate-500 font-medium">
        Exibindo {filtered.length} de {allItems.filter(i => tab === 'abertos' ? i.data.status !== 'PAGO' : i.data.status === 'PAGO').length} itens
      </div>

      {/* Modal de Anexar Comprovante */}
      {comprovanteModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b flex justify-between items-center bg-emerald-50">
              <h3 className="font-black text-emerald-800 uppercase text-xs tracking-widest flex items-center gap-2">
                <Paperclip size={16} className="text-emerald-600" />
                Anexar Comprovante de Pagamento
              </h3>
              <button onClick={() => { setComprovanteModal(null); setComprovanteFile(null); }} className="p-2 hover:bg-emerald-100 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Info do item */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Item</p>
                <p className="font-black text-slate-800 text-sm uppercase">{comprovanteModal.item.data.servicos}</p>
                <p className="text-xs text-slate-500 mt-1">{comprovanteModal.item.fdaNumber} • R$ {parseFloat(comprovanteModal.item.data.valorLiquido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>

              {/* Comprovantes já anexados */}
              {comprovanteModal.item.comprovantes?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Comprovantes já anexados ({comprovanteModal.item.comprovantes.length})</p>
                  {comprovanteModal.item.comprovantes.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <FileText size={14} className="text-emerald-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-700 truncate">{c.name}</p>
                        <p className="text-[9px] text-slate-400">{c.date} • {c.size}</p>
                      </div>
                      <button
                        onClick={() => onPreview([c], 'Comprovante')}
                        className="p-1 text-emerald-600 hover:bg-emerald-100 rounded"
                        title="Visualizar"
                      >
                        <Eye size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload novo comprovante */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Novo Comprovante</p>
                <input
                  ref={comprovanteInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.xlsx"
                  className="hidden"
                  onChange={(e) => setComprovanteFile(e.target.files?.[0] || null)}
                />
                {!comprovanteFile ? (
                  <button
                    onClick={() => comprovanteInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-emerald-300 rounded-xl py-8 flex flex-col items-center gap-2 hover:border-emerald-500 hover:bg-emerald-50 transition-all group"
                  >
                    <Paperclip size={24} className="text-emerald-400 group-hover:text-emerald-600" />
                    <p className="text-sm font-black text-emerald-600">Clique para selecionar arquivo</p>
                    <p className="text-[10px] text-slate-400">PDF, PNG, JPG ou XLSX • Máx. 5MB</p>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 p-4 bg-emerald-50 border-2 border-emerald-300 rounded-xl">
                    <FileText size={20} className="text-emerald-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-700 text-sm truncate">{comprovanteFile.name}</p>
                      <p className="text-[10px] text-slate-400">{formatFileSize(comprovanteFile.size)}</p>
                    </div>
                    <button
                      onClick={() => setComprovanteFile(null)}
                      className="p-1 text-slate-400 hover:text-red-500 rounded"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>

              {/* Banner de carregamento */}
              {comprovanteUploading && (
                <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="font-black text-emerald-800 text-sm uppercase tracking-wide">📤 Enviando comprovante...</p>
                  </div>
                </div>
              )}

              {/* Botões de ação */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setComprovanteModal(null); setComprovanteFile(null); }}
                  className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-black uppercase text-xs tracking-widest rounded-xl hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAnexarComprovante}
                  disabled={!comprovanteFile || comprovanteUploading}
                  className="flex-1 py-3 bg-emerald-600 text-white font-black uppercase text-xs tracking-widest rounded-xl hover:bg-emerald-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {comprovanteUploading ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Enviando...</>
                  ) : (
                    <><Paperclip size={14} /> Anexar Comprovante</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const FinanceModule = ({ allItems, isMaster, updateItem, onDelete, onPreview, userPermissions, refreshData }) => {
  const [aT, setAT] = useState('PENDENTE');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('vencimento-asc');
  const [groupBy, setGroupBy] = useState('vencimento');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);

  // Estado do modal de comprovante
  const [comprovanteModal, setComprovanteModal] = useState(null); // { item } ou null
  const [comprovanteFile, setComprovanteFile] = useState(null);
  const [comprovanteUploading, setComprovanteUploading] = useState(false);
  const comprovanteInputRef = useRef(null);

  const handleAnexarComprovante = async () => {
    if (!comprovanteFile || !comprovanteModal) return;
    // Validação básica
    const ext = '.' + comprovanteFile.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      alert('Tipo de arquivo não permitido. Use: PDF, PNG, JPG ou XLSX');
      return;
    }
    if (comprovanteFile.size > MAX_FILE_SIZE) {
      alert('Arquivo muito grande. Tamanho máximo: 5MB');
      return;
    }
    setComprovanteUploading(true);
    try {
      const fileId = await saveFileChunks(comprovanteFile);
      const novoComprovante = {
        name: comprovanteFile.name,
        fileId,
        date: new Date().toLocaleString('pt-BR'),
        size: formatFileSize(comprovanteFile.size)
      };
      const item = comprovanteModal.item;
      const comprovantesAtuais = item.comprovantes || [];
      await updateItem(item.id, item.data, null, null, [...comprovantesAtuais, novoComprovante]);
      alert('✓ Comprovante anexado com sucesso!');
      setComprovanteModal(null);
      setComprovanteFile(null);
      if (refreshData) refreshData();
    } catch (err) {
      alert('Erro ao anexar comprovante: ' + err.message);
    } finally {
      setComprovanteUploading(false);
    }
  };

  // Definição das Abas com Permissões
  const steps = useMemo(() => {
    const allSteps = {
      'PENDENTE': { label: 'A Pagar', next: 'PROVISIONADO', btn: 'Provisionar', color: 'bg-yellow-500', perm: 'finance_pending' },
      'PROVISIONADO': { label: 'Provisionado', next: 'APROVADO', prev: 'PENDENTE', btn: 'Aprovar', color: 'bg-blue-600', perm: 'finance_provision' },
      'APROVADO': { label: 'Aprovado', next: 'PAGO', prev: 'PROVISIONADO', btn: 'Liquidar', color: 'bg-green-600', perm: 'finance_approved' },
      'PAGO': { label: 'Liquidados', prev: 'APROVADO', perm: 'finance_paid' }
    };
    // Filtra abas baseadas nas permissões do usuário
    if (userPermissions.includes('all_tabs')) return allSteps;
    return Object.fromEntries(Object.entries(allSteps).filter(([_, val]) => userPermissions.includes(val.perm)));
  }, [userPermissions]);

  // Ajusta a aba inicial se o usuário não tiver acesso à 'PENDENTE'
  useEffect(() => {
    const availableKeys = Object.keys(steps);
    if (availableKeys.length > 0 && !availableKeys.includes(aT)) {
      setAT(availableKeys[0]);
    }
  }, [steps]);

  // Função de ordenação
  const applySorting = (items) => {
    const sorted = [...items];
    switch (sortBy) {
      case 'vencimento-asc':
        return sorted.sort((a, b) => new Date(a.data.vencimento) - new Date(b.data.vencimento));
      case 'vencimento-desc':
        return sorted.sort((a, b) => new Date(b.data.vencimento) - new Date(a.data.vencimento));
      case 'valor-asc':
        return sorted.sort((a, b) => parseFloat(a.data.total) - parseFloat(b.data.total));
      case 'valor-desc':
        return sorted.sort((a, b) => parseFloat(b.data.total) - parseFloat(a.data.total));
      case 'servico-asc':
        return sorted.sort((a, b) => (a.data.servicos || '').localeCompare(b.data.servicos || ''));
      case 'servico-desc':
        return sorted.sort((a, b) => (b.data.servicos || '').localeCompare(a.data.servicos || ''));
      case 'categoria-asc':
        return sorted.sort((a, b) => (a.data.categoria || '').localeCompare(b.data.categoria || ''));
      case 'categoria-desc':
        return sorted.sort((a, b) => (b.data.categoria || '').localeCompare(a.data.categoria || ''));
      default:
        return sorted;
    }
  };

  const groupedItems = useMemo(() => {
    if (!Object.keys(steps).includes(aT)) return [];

    let filtered = allItems.filter(i => i.data.status === aT && (
      i.data.servicos.toLowerCase().includes(search.toLowerCase()) ||
      i.data.clienteFornecedor.toLowerCase().includes(search.toLowerCase()) ||
      (i.data.categoria || '').toLowerCase().includes(search.toLowerCase()) ||
      (i.data.navio || '').toLowerCase().includes(search.toLowerCase())
    ));

    // Aplica ordenação
    filtered = applySorting(filtered);

    const groups = {};
    filtered.forEach(item => {
      let dateKey = 'Sem Data';
      if (groupBy === 'vencimento') dateKey = item.data.vencimento || 'Sem Data';
      if (groupBy === 'cliente') dateKey = item.data.clienteFornecedor || 'Sem Cliente';
      if (groupBy === 'servico') dateKey = item.data.servicos || 'Sem Serviço';
      if (groupBy === 'categoria') dateKey = item.data.categoria || 'Sem Categoria';

      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(item);
    });

    return Object.keys(groups).sort().map(date => ({
      date,
      items: groups[date],
      total: groups[date].reduce((sum, item) => sum + parseFloat(item.data.valorLiquido || 0), 0)
    }));
  }, [allItems, aT, search, steps, sortBy, groupBy]);

  const handleStatus = async (id, cur, s) => {
    const n = new Date().toISOString().split('T')[0];
    let ups = { status: s };
    if (s === 'PROVISIONADO') ups.dataProvisionamento = n;
    if (s === 'APROVADO') ups.dataAprovacao = n;
    if (s === 'PAGO') ups.dataPagamentoReal = n;
    await updateItem(id, { ...cur, ...ups });
  };

  // Funções de seleção múltipla
  const toggleSelection = (itemId) => {
    setSelectedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const toggleSelectAll = () => {
    const allIds = groupedItems.flatMap(group => group.items.map(item => item.id));
    if (selectedItems.length === allIds.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(allIds);
    }
  };

  const approveSelected = async () => {
    if (selectedItems.length === 0) {
      alert('Selecione pelo menos um item para aprovar');
      return;
    }

    if (!window.confirm(`Deseja aprovar ${selectedItems.length} ${selectedItems.length === 1 ? 'item' : 'itens'}?`)) {
      return;
    }

    const n = new Date().toISOString().split('T')[0];
    for (const itemId of selectedItems) {
      const item = groupedItems.flatMap(g => g.items).find(i => i.id === itemId);
      if (item) {
        await handleStatus(item.id, item.data, 'APROVADO');
      }
    }
    setSelectedItems([]);
    setSelectionMode(false);
  };

  const totalSelecionado = useMemo(() => {
    return groupedItems
      .flatMap(group => group.items)
      .filter(item => selectedItems.includes(item.id))
      .reduce((sum, item) => sum + parseFloat(item.data.valorLiquido || 0), 0);
  }, [selectedItems, groupedItems]);

  // Limpar seleção ao trocar de aba
  useEffect(() => {
    setSelectedItems([]);
    setSelectionMode(false);
  }, [aT]);

  const openFile = (files, title) => {
    if (files && files.length > 0) {
      onPreview(files, title);
    } else {
      alert("Nenhum arquivo anexado.");
    }
  };

  // Calcular total geral da aba
  const totalGeral = useMemo(() => {
    return groupedItems.reduce((sum, group) => sum + group.total, 0);
  }, [groupedItems]);

  const totalItens = useMemo(() => {
    return groupedItems.reduce((sum, group) => sum + group.items.length, 0);
  }, [groupedItems]);

  if (Object.keys(steps).length === 0) return <div className="text-center py-20 text-slate-400">Acesso restrito a este módulo.</div>;

  return (
    <div className="max-w-7xl mx-auto">
      <header className="mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight uppercase">Contas a Pagar</h2>
          <ExportButton
            data={groupedItems.flatMap(group => group.items).map(item => ({
              'Vencimento': item.data.vencimento,
              'Categoria': item.data.categoria || 'N/A',
              'Serviço': item.data.servicos,
              'Cliente/Fornecedor': item.data.clienteFornecedor,
              'CNPJ/CPF': item.data.cnpjCpf || 'N/A',
              'Navio': item.data.navio || 'N/A',
              'Documento': item.data.documento || 'N/A',
              'NF': item.data.nfs || 'N/A',
              'Valor Total': `R$ ${parseFloat(item.data.valorLiquido || 0).toFixed(2)}`,
              'Status': item.data.status,
              'Centro Custo': item.data.centroCusto || 'N/A',
              'Data Provisionamento': item.data.dataProvisionamento || 'N/A',
              'Data Aprovação': item.data.dataAprovacao || 'N/A',
              'Data Pagamento Real': item.data.dataPagamentoReal || 'N/A',
              'Banco': item.data.banco || 'N/A',
              'Agência': item.data.agencia || 'N/A',
              'Conta': item.data.contaCorrente || 'N/A',
              'PIX': item.data.chavePix || 'N/A',
              'Valor Pago': item.data.valorPago ? `R$ ${parseFloat(item.data.valorPago).toFixed(2)}` : 'N/A'
            }))}
            filename={`contas-a-pagar-${aT.toLowerCase()}`}
            label="Exportar"
          />
        </div>

        {/* Barra de Filtros */}
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          sortBy={sortBy}
          onSortChange={setSortBy}
          showStatusFilter={false}
          showGroupBy={true}
          groupBy={groupBy}
          onGroupChange={setGroupBy}
        />
      </header>

      <div className="flex gap-2 border-b mb-8 overflow-x-auto">
        {Object.keys(steps).map(key => (
          <button key={key} onClick={() => setAT(key)} className={`px-10 py-3 text-[10px] font-black uppercase tracking-widest border-b-4 transition-all whitespace-nowrap ${aT === key ? `border-blue-600 text-blue-600 bg-blue-50/50` : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            {steps[key].label}
          </button>
        ))}
      </div>

      {/* Resumo da Aba */}
      {totalItens > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-slate-50 rounded-xl p-6 mb-6 border border-blue-100">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total na Aba</p>
              <p className="text-2xl font-black text-slate-800">R$ {totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quantidade</p>
              <p className="text-2xl font-black text-slate-800">{totalItens} {totalItens === 1 ? 'item' : 'itens'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Barra de Seleção Múltipla (apenas na aba PROVISIONADO) */}
      {aT === 'PROVISIONADO' && totalItens > 0 && (
        <div className="mb-6">
          {!selectionMode ? (
            <button
              onClick={() => setSelectionMode(true)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-md"
            >
              <CheckCircle2 size={18} />
              Selecionar Múltiplos
            </button>
          ) : (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-blue-300 text-blue-700 rounded-lg font-bold text-xs hover:bg-blue-50 transition-all"
                  >
                    <CheckCircle2 size={16} />
                    {selectedItems.length === groupedItems.flatMap(g => g.items).length ? 'Desmarcar Todos' : 'Marcar Todos'}
                  </button>
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-blue-700 uppercase tracking-widest">
                      {selectedItems.length} {selectedItems.length === 1 ? 'item selecionado' : 'itens selecionados'}
                    </span>
                    {selectedItems.length > 0 && (
                      <span className="text-sm font-black text-blue-900">
                        Total: R$ {totalSelecionado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={approveSelected}
                    disabled={selectedItems.length === 0}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-green-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 size={18} />
                    Aprovar Selecionados
                  </button>
                  <button
                    onClick={() => {
                      setSelectionMode(false);
                      setSelectedItems([]);
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-200 text-slate-700 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-slate-300 transition-all"
                  >
                    <X size={18} />
                    <span className="hidden sm:inline">Cancelar</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-8">
        {groupedItems.length === 0 ? (
          <div className="text-center py-20 text-slate-300 italic font-medium">
            {search ? 'Nenhum item encontrado com os filtros aplicados.' : 'Nenhum item nesta etapa.'}
          </div>
        ) : (
          groupedItems.map(group => (
            <div key={group.date} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Calendar size={16} className="text-slate-400" />
                  <span className="font-black text-slate-700 text-xs uppercase tracking-widest">
                    {groupBy === 'vencimento' ? (
                      <>Vencimento: {group.date !== 'Sem Data' ? new Date(group.date.includes('T') ? group.date : `${group.date}T12:00:00`).toLocaleDateString('pt-BR') : 'Sem Data'}</>
                    ) : (
                      <>{groupBy === 'cliente' ? 'Cliente/Fornecedor' : groupBy === 'categoria' ? 'Categoria' : 'Serviço'}: {group.date}</>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold text-slate-500">{group.items.length} {group.items.length === 1 ? 'item' : 'itens'}</span>
                  <span className="text-sm font-black text-slate-700">R$ {group.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              <table className="w-full text-sm text-left">
                <tbody className="divide-y divide-slate-50">
                  {group.items.map(it => (
                    <tr key={it.id} className="hover:bg-slate-50 transition-colors">
                      {/* Checkbox (apenas no modo de seleção e aba PROVISIONADO) */}
                      {selectionMode && aT === 'PROVISIONADO' && (
                        <td className="p-3 w-12">
                          <input
                            type="checkbox"
                            checked={selectedItems.includes(it.id)}
                            onChange={() => toggleSelection(it.id)}
                            className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="p-3 sm:p-5 w-full sm:w-1/3">
                        <div className="font-black text-slate-800 uppercase text-xs">{it.data.servicos}</div>
                        <div className="text-[10px] text-slate-400 font-bold mt-1">{it.data.clienteFornecedor}</div>
                        <div className="text-[10px] text-emerald-600 font-bold mt-1 uppercase px-2 py-0.5 bg-emerald-50 rounded inline-block border border-emerald-100">{it.data.categoria || 'SEM CATEGORIA'}</div>
                        {it.data.navio && <div className="text-[10px] text-blue-600 font-bold mt-1 block">🚢 {it.data.navio}</div>}
                      </td>
                      <td className="p-3 sm:p-5 text-right font-black text-slate-900 w-auto sm:w-1/6">
                        <div className="whitespace-nowrap">R$ {parseFloat(it.data.valorLiquido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                      </td>
                      <td className="p-3 sm:p-5 text-center w-auto sm:w-1/4 hidden md:table-cell">
                        <div className="flex gap-2 justify-center flex-wrap">
                          <button onClick={() => openFile(it.anexosNF, "Nota Fiscal")} className="flex items-center gap-1 text-[9px] font-bold uppercase bg-blue-50 text-blue-600 px-3 py-1.5 rounded hover:bg-blue-100 transition-colors"><ExternalLink size={10} /> Nota</button>
                          <button onClick={() => openFile(it.anexosBoleto, "Boleto")} className="flex items-center gap-1 text-[9px] font-bold uppercase bg-slate-50 text-slate-600 px-3 py-1.5 rounded hover:bg-slate-100 transition-colors"><ExternalLink size={10} /> Boleto</button>
                          {aT === 'PAGO' && (
                            <button
                              onClick={() => onPreview(it.comprovantes, "Comprovantes")}
                              className={`flex items-center gap-1 text-[9px] font-bold uppercase ${it.comprovantes?.length > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-300'} px-3 py-1.5 rounded hover:bg-emerald-100 transition-colors`}
                              disabled={!it.comprovantes?.length}
                              title={it.comprovantes?.length ? `${it.comprovantes.length} comprovante(s)` : 'Sem comprovantes'}
                            >
                              <ExternalLink size={10} /> Comp.
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-3 sm:p-5 text-center w-auto sm:w-1/4">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {aT === 'PAGO' && (
                            <button
                              onClick={() => { setComprovanteModal({ item: it }); setComprovanteFile(null); }}
                              className="flex items-center gap-1 px-3 py-2 text-[9px] uppercase font-black rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-md"
                              title="Anexar comprovante de pagamento"
                            >
                              <Paperclip size={11} /> Comprovante
                            </button>
                          )}
                          {steps[aT].prev && (
                            <button onClick={() => handleStatus(it.id, it.data, steps[aT].prev)} className="p-2 text-slate-400 hover:text-orange-500 transition-colors" title="Retornar Status"><Undo2 size={18} /></button>
                          )}
                          {steps[aT].next && !selectionMode && (
                            <button onClick={() => handleStatus(it.id, it.data, steps[aT].next)} className={`px-3 sm:px-4 py-2 ${steps[aT].color} text-white rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-widest shadow-md hover:opacity-90 transition-all whitespace-nowrap`}>
                              {steps[aT].btn}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>

      {/* Modal de Anexar Comprovante */}
      {comprovanteModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b flex justify-between items-center bg-emerald-50">
              <h3 className="font-black text-emerald-800 uppercase text-xs tracking-widest flex items-center gap-2">
                <Paperclip size={16} className="text-emerald-600" />
                Anexar Comprovante de Pagamento
              </h3>
              <button onClick={() => { setComprovanteModal(null); setComprovanteFile(null); }} className="p-2 hover:bg-emerald-100 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Info do item */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Item</p>
                <p className="font-black text-slate-800 text-sm uppercase">{comprovanteModal.item.data.servicos}</p>
                <p className="text-xs text-slate-500 mt-1">{comprovanteModal.item.fdaNumber} • R$ {parseFloat(comprovanteModal.item.data.valorLiquido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>

              {/* Comprovantes já anexados */}
              {comprovanteModal.item.comprovantes?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Comprovantes já anexados ({comprovanteModal.item.comprovantes.length})</p>
                  {comprovanteModal.item.comprovantes.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <FileText size={14} className="text-emerald-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-700 truncate">{c.name}</p>
                        <p className="text-[9px] text-slate-400">{c.date} • {c.size}</p>
                      </div>
                      <button
                        onClick={() => onPreview([c], 'Comprovante')}
                        className="p-1 text-emerald-600 hover:bg-emerald-100 rounded"
                        title="Visualizar"
                      >
                        <Eye size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload novo comprovante */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Novo Comprovante</p>
                <input
                  ref={comprovanteInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.xlsx"
                  className="hidden"
                  onChange={(e) => setComprovanteFile(e.target.files?.[0] || null)}
                />
                {!comprovanteFile ? (
                  <button
                    onClick={() => comprovanteInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-emerald-300 rounded-xl py-8 flex flex-col items-center gap-2 hover:border-emerald-500 hover:bg-emerald-50 transition-all group"
                  >
                    <Paperclip size={24} className="text-emerald-400 group-hover:text-emerald-600" />
                    <p className="text-sm font-black text-emerald-600">Clique para selecionar arquivo</p>
                    <p className="text-[10px] text-slate-400">PDF, PNG, JPG ou XLSX • Máx. 5MB</p>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 p-4 bg-emerald-50 border-2 border-emerald-300 rounded-xl">
                    <FileText size={20} className="text-emerald-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-700 text-sm truncate">{comprovanteFile.name}</p>
                      <p className="text-[10px] text-slate-400">{formatFileSize(comprovanteFile.size)}</p>
                    </div>
                    <button
                      onClick={() => setComprovanteFile(null)}
                      className="p-1 text-slate-400 hover:text-red-500 rounded"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>

              {/* Banner de carregamento */}
              {comprovanteUploading && (
                <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="font-black text-emerald-800 text-sm uppercase tracking-wide">📤 Enviando comprovante...</p>
                  </div>
                </div>
              )}

              {/* Botões de ação */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setComprovanteModal(null); setComprovanteFile(null); }}
                  className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-black uppercase text-xs tracking-widest rounded-xl hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAnexarComprovante}
                  disabled={!comprovanteFile || comprovanteUploading}
                  className="flex-1 py-3 bg-emerald-600 text-white font-black uppercase text-xs tracking-widest rounded-xl hover:bg-emerald-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {comprovanteUploading ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Enviando...</>
                  ) : (
                    <><Paperclip size={14} /> Anexar Comprovante</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
// --- MÓDULO DE GERENCIAMENTO DE FILIAIS ---
const FiliaisModule = ({ filiais, userEmail, refreshData }) => {
  const [novaFilial, setNovaFilial] = useState('');
  const [editando, setEditando] = useState(null);
  const [nomeEdit, setNomeEdit] = useState('');

  const adicionarFilial = async () => {
    if (!novaFilial.trim()) {
      alert('Digite o nome da filial');
      return;
    }

    try {
      await fetch(`${API_URL}/filiais`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novaFilial.trim(), criadoPor: userEmail })
      });
      await logAction(userEmail, 'CRIAR FILIAL', `Filial criada: ${novaFilial}`);
      setNovaFilial('');
      refreshData();
    } catch (error) {
      console.error('Erro ao criar filial:', error);
      alert('Erro ao criar filial');
    }
  };

  const atualizarFilial = async (id) => {
    if (!nomeEdit.trim()) {
      alert('Digite o nome da filial');
      return;
    }

    try {
      await fetch(`${API_URL}/filiais/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeEdit.trim() })
      });
      await logAction(userEmail, 'ATUALIZAR FILIAL', `Filial atualizada: ${nomeEdit}`);
      setEditando(null);
      setNomeEdit('');
      refreshData();
    } catch (error) {
      console.error('Erro ao atualizar filial:', error);
      alert('Erro ao atualizar filial');
    }
  };

  const excluirFilial = async (id, nome) => {
    if (!window.confirm(`Tem certeza que deseja excluir a filial "${nome}"?`)) return;

    try {
      await fetch(`${API_URL}/filiais/${id}`, { method: 'DELETE' });
      await logAction(userEmail, 'EXCLUIR FILIAL', `Filial excluída: ${nome}`);
      refreshData();
    } catch (error) {
      console.error('Erro ao excluir filial:', error);
      alert('Erro ao excluir filial');
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight uppercase">Gerenciar Filiais</h2>
        <ExportButton
          data={filiais.map(f => ({
            'Nome': f.nome,
            'Criado em': new Date(f.criadoEm).toLocaleDateString('pt-BR'),
            'Criado por': f.criadoPor
          }))}
          filename="filiais"
          label="Exportar"
        />
      </div>

      {/* Adicionar Nova Filial */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 mb-8">
        <h3 className="font-black text-slate-700 uppercase text-xs tracking-widest mb-4">Nova Filial</h3>
        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            value={novaFilial}
            onChange={(e) => setNovaFilial(e.target.value)}
            placeholder="Nome da filial (ex: Filial Rio de Janeiro)"
            className="flex-1 px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all text-sm font-medium"
            onKeyPress={(e) => e.key === 'Enter' && adicionarFilial()}
          />
          <button
            onClick={adicionarFilial}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg hover:shadow-xl transition-all whitespace-nowrap"
          >
            <Plus size={18} className="inline mr-2" />
            Adicionar
          </button>
        </div>
      </div>

      {/* Lista de Filiais */}
      <div className="space-y-4">
        {filiais.length === 0 ? (
          <div className="text-center py-20 text-slate-300 italic font-medium">
            Nenhuma filial cadastrada. Adicione a primeira filial acima.
          </div>
        ) : (
          filiais.map((filial) => (
            <div key={filial.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between">
                {editando === filial.id ? (
                  <div className="flex-1 flex items-center gap-4">
                    <input
                      type="text"
                      value={nomeEdit}
                      onChange={(e) => setNomeEdit(e.target.value)}
                      className="flex-1 px-4 py-2 bg-slate-50 border-2 border-blue-500 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none text-sm font-medium"
                      autoFocus
                      onKeyPress={(e) => e.key === 'Enter' && atualizarFilial(filial.id)}
                    />
                    <button
                      onClick={() => atualizarFilial(filial.id)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-black uppercase hover:bg-green-700"
                    >
                      <CheckCircle2 size={16} className="inline mr-1" />
                      Salvar
                    </button>
                    <button
                      onClick={() => {
                        setEditando(null);
                        setNomeEdit('');
                      }}
                      className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-xs font-black uppercase hover:bg-slate-300"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      <h3 className="font-black text-slate-800 text-lg">{filial.nome}</h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Criado em {new Date(filial.criadoEm).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditando(filial.id);
                          setNomeEdit(filial.nome);
                        }}
                        className="p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => excluirFilial(filial.id, filial.nome)}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// --- MÓDULO DE GERENCIAMENTO DE USUÁRIOS ATUALIZADO ---
const UserManagementModule = ({ usersList, filiais, refreshData }) => {
  const [newUserEmail, setNewUserEmail] = useState('');

  const permissions = [
    { id: 'entry', label: 'Módulo: Lançamento', category: 'module' },
    { id: 'launched', label: 'Módulo: Itens Lançados', category: 'module' },
    { id: 'launched_open', label: 'Aba: Em Aberto', category: 'tab' },
    { id: 'launched_paid', label: 'Aba: Liquidados', category: 'tab' },
    { id: 'finance', label: 'Módulo: Contas a Pagar', category: 'module' },
    { id: 'finance_pending', label: 'Aba: A Pagar', category: 'tab' },
    { id: 'finance_provision', label: 'Aba: Provisionado', category: 'tab' },
    { id: 'finance_approved', label: 'Aba: Aprovado', category: 'tab' },
    { id: 'finance_paid', label: 'Aba: Liquidados', category: 'tab' },
    { id: 'logs', label: 'Módulo: Logs', category: 'module' }
  ];

  const addUser = async () => {
    if (!newUserEmail || !newUserEmail.includes('@')) {
      alert('Digite um e-mail válido');
      return;
    }

    try {
      await fetch(`${API_URL}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newUserEmail, modules: ['entry'], filiais: [] })
      });
      await logAction(MASTER_USER, 'ADICIONAR USUÁRIO', `Usuário ${newUserEmail} adicionado`);
      setNewUserEmail('');
      refreshData();
    } catch (error) {
      console.error('Erro ao adicionar usuário:', error);
      alert('Erro ao adicionar usuário');
    }
  };

  const handleUpdate = async (email, moduleId, isChecked) => {
    const user = usersList.find(u => u.email === email);
    if (!user) return;

    const currentModules = user.modules || [];
    const newModules = isChecked
      ? [...currentModules, moduleId]
      : currentModules.filter(m => m !== moduleId);

    try {
      await fetch(`${API_URL}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, modules: newModules, filiais: user.filiais || [] })
      });
      await logAction(MASTER_USER, 'ATUALIZAR PERMISSÃO', `Permissões de ${email} atualizadas`);
      refreshData();
    } catch (error) {
      console.error('Erro ao atualizar permissões:', error);
      alert('Erro ao atualizar permissões');
    }
  };

  const handleFilialUpdate = async (email, filialId, isChecked) => {
    const user = usersList.find(u => u.email === email);
    if (!user) return;

    const currentFiliais = user.filiais || [];
    const newFiliais = isChecked
      ? [...currentFiliais, filialId]
      : currentFiliais.filter(f => f !== filialId);

    try {
      await fetch(`${API_URL}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, modules: user.modules || [], filiais: newFiliais })
      });
      await logAction(MASTER_USER, 'ATUALIZAR FILIAIS', `Filiais de ${email} atualizadas`);
      refreshData();
    } catch (error) {
      console.error('Erro ao atualizar filiais:', error);
      alert('Erro ao atualizar filiais');
    }
  };

  const deleteUser = async (email) => {
    if (email === MASTER_USER) {
      alert('Não é possível remover o usuário master');
      return;
    }

    if (!window.confirm(`Tem certeza que deseja remover ${email}?`)) return;

    try {
      await fetch(`${API_URL}/permissions/${email}`, { method: 'DELETE' });
      await logAction(MASTER_USER, 'REMOVER USUÁRIO', `Usuário ${email} removido`);
      refreshData();
    } catch (error) {
      console.error('Erro ao remover usuário:', error);
      alert('Erro ao remover usuário');
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight uppercase">Gerenciar Usuários</h2>
        <ExportButton
          data={[...usersList].sort((a, b) => (a.email || '').localeCompare(b.email || '')).map(u => ({
            'E-mail': u.email,
            'Módulos': (u.modules || []).join(', '),
            'Filiais': (u.filiais || []).map(fId => filiais.find(f => f.id === fId)?.nome).filter(Boolean).join(', ') || 'Nenhuma',
            'Criado em': u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : 'N/A'
          }))}
          filename="usuarios"
          label="Exportar"
        />
      </div>

      {/* Adicionar Novo Usuário */}
      <div className="bg-white p-4 sm:p-8 rounded-2xl shadow-sm border border-slate-200 mb-8">
        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="email"
            placeholder="nome@empresa.com"
            className="flex-1 border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none text-sm font-medium"
            value={newUserEmail}
            onChange={e => setNewUserEmail(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addUser()}
          />
          <button
            onClick={addUser}
            className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black uppercase text-xs hover:bg-blue-700 transition-all whitespace-nowrap"
          >
            Autorizar
          </button>
        </div>
      </div>

      {/* Lista de Usuários */}
      <div className="grid gap-6">
        {[...usersList].sort((a, b) => (a.email || '').localeCompare(b.email || '')).map(user => (
          <div key={user.email} className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <UserCog size={18} className="text-blue-600" />
                {user.email}
                {user.email === MASTER_USER && (
                  <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-black uppercase">Master</span>
                )}
              </h3>
              {user.email !== MASTER_USER && (
                <button
                  onClick={() => deleteUser(user.email)}
                  className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Remover usuário"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>

            {/* Permissões - Módulos */}
            <div className="mb-6">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Módulos de Acesso</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {permissions.filter(p => p.category === 'module').map(perm => (
                  <label key={perm.id} className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer hover:bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      checked={user.modules?.includes(perm.id)}
                      onChange={(e) => handleUpdate(user.email, perm.id, e.target.checked)}
                      disabled={user.email === MASTER_USER}
                    />
                    {perm.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Permissões - Abas */}
            <div className="mb-6">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Abas Específicas</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {permissions.filter(p => p.category === 'tab').map(perm => (
                  <label key={perm.id} className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer hover:bg-blue-50 p-3 rounded-lg border border-blue-200 bg-blue-50/30">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      checked={user.modules?.includes(perm.id)}
                      onChange={(e) => handleUpdate(user.email, perm.id, e.target.checked)}
                      disabled={user.email === MASTER_USER}
                    />
                    {perm.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Filiais */}
            <div>
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Filiais Autorizadas</h4>
              {filiais.length === 0 ? (
                <p className="text-sm text-slate-400 italic">Nenhuma filial cadastrada. Cadastre filiais primeiro.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {filiais.map(filial => (
                    <label key={filial.id} className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer hover:bg-slate-50 p-2 rounded">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
                        checked={user.filiais?.includes(filial.id)}
                        onChange={(e) => handleFilialUpdate(user.email, filial.id, e.target.checked)}
                        disabled={user.email === MASTER_USER}
                      />
                      {filial.nome}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};