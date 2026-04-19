import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { 
  Home, CheckCircle2, ClipboardList, Settings, LogOut, 
  Plus, Save, Loader2, ChevronLeft, ChevronRight, Search, 
  Phone, FileDown, Trash2, Users, Calendar, ShieldCheck, Pencil, X, TrendingUp, Info, AlertTriangle, Eye, ChevronDown, ChevronUp
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { fr } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoDahira from './assets/logodahira.png';

function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState('login'); 
  const [selectedKourel, setSelectedKourel] = useState(null);
  const [members, setMembers] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [attendanceDate, setAttendanceDate] = useState(new Date());
  const [stats, setStats] = useState({ totalSessions: 0, globalRate: 0 });
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [kourels, setKourels] = useState([]);
  const [kourelStats, setKourelsStats] = useState({});
  const [allProfiles, setAllProfiles] = useState([]);
  const [toast, setToast] = useState(null);
  const [mgmtTab, setMgmtTab] = useState('members');
  const [searchTerm, setSearchTerm] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  
  const [newMember, setNewMember] = useState({ name: '', phone: '' });
  const [editingMember, setEditingMember] = useState(null);
  const [histSearch, setHistSearch] = useState('');
  const [histStatus, setHistStatus] = useState('Tous');
  const [expandedSession, setExpandedSession] = useState(null);

  const [modal, setModal] = useState({ show: false, title: '', msg: '', onConfirm: null, type: 'confirm' });

  useEffect(() => { checkUser(); }, []);
  useEffect(() => {
    if (selectedKourel && view === 'attendance' && members.length > 0) loadExistingAttendance();
  }, [attendanceDate, selectedKourel, view, members]);

  const filteredHistory = useMemo(() => {
    return history.filter(h => {
      const matchMonth = h.date.startsWith(selectedMonth);
      const matchSearch = histSearch === '' || h.members?.name.toLowerCase().includes(histSearch.toLowerCase());
      const matchStatus = histStatus === 'Tous' || h.status === histStatus;
      return matchMonth && matchSearch && matchStatus;
    });
  }, [history, selectedMonth, histSearch, histStatus]);

  const sessionsList = useMemo(() => {
    return [...new Set(history.map(h => h.date))].sort((a,b) => new Date(b) - new Date(a));
  }, [history]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const confirmAction = (title, msg, onConfirm, type = 'confirm') => {
    setModal({ show: true, title, msg, onConfirm, type });
  };

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { setUser(session.user); await fetchProfile(session.user.id); } 
      else { setView('login'); setLoading(false); }
    } catch (err) { setLoading(false); }
  };

  const fetchProfile = async (uid) => {
    try {
      const { data, error } = await supabase.from('profiles').select('*, kourels(*)').eq('id', uid).single();
      if (!error && data) {
        setProfile(data);
        if (data.role === 'surveillant' && data.kourels) {
          setSelectedKourel(data.kourels);
          await loadKourelData(data.kourels.id);
          setView('dashboard');
        } else {
          await fetchGlobalStats();
          setView('selection');
        }
      } else setView('login');
    } finally { setLoading(false); }
  };

  const fetchGlobalStats = async () => {
    try {
      const { data: kList } = await supabase.from('kourels').select('*').order('name');
      setKourels(kList || []);
      setAllProfiles(pList || []);
      const { data: allAtt } = await supabase.from('attendance').select('status, date, members(kourel_id)');
      const sMap = {};
      (kList || []).forEach(k => {
        const kAtt = allAtt?.filter(a => a.members?.kourel_id === k.id) || [];
        const pres = kAtt.filter(a => a.status === 'Présent').length;
        sMap[k.id] = { rate: kAtt.length > 0 ? Math.round((pres / kAtt.length) * 100) : 0, sessions: [...new Set(kAtt.map(a => a.date))].length };
      });
      setKourelsStats(sMap);
    } catch (e) {}
  };

  const loadKourelData = async (kid) => {
    try {
      const { data: mData } = await supabase.from('members').select('*').eq('kourel_id', kid).eq('active', true).order('name');
      const { data: amData } = await supabase.from('members').select('*').eq('kourel_id', kid).order('name');
      setMembers(mData || []);
      setAllMembers(amData || []);
      const { data: aData } = await supabase.from('attendance').select('*, members!inner(*)').eq('members.kourel_id', kid);
      if (aData) {
        const dates = [...new Set(aData.map(d => d.date))];
        const pres = aData.filter(d => d.status === 'Présent').length;
        setStats({ totalSessions: dates.length, globalRate: aData.length > 0 ? Math.round((pres / aData.length) * 100) : 0 });
        setHistory(aData.sort((a,b) => new Date(b.date) - new Date(a.date)));
      }
    } catch (e) {}
  };

  const loadExistingAttendance = async () => {
    const dateStr = format(attendanceDate, 'yyyy-MM-dd');
    const { data } = await supabase.from('attendance').select('member_id, status').eq('date', dateStr).in('member_id', members.map(m => m.id));
    const newAtt = {};
    members.forEach(m => newAtt[m.id] = 'Présent');
    if (data?.length > 0) {
      data.forEach(row => newAtt[row.member_id] = row.status);
    }
    setAttendance(newAtt);
  };

  const saveAttendance = async () => {
    if (profile?.role !== 'surveillant') return;
    setSaving(true);
    try {
      const dateStr = format(attendanceDate, 'yyyy-MM-dd');
      await supabase.from('attendance').delete().eq('date', dateStr).in('member_id', members.map(m => m.id));
      const records = Object.entries(attendance).map(([mId, status]) => ({ member_id: mId, status, date: dateStr }));
      const { error } = await supabase.from('attendance').insert(records);
      if (!error) { showToast('Régistre mis à jour'); await loadKourelData(selectedKourel.id); setView('dashboard'); }
    } catch (e) { showToast('Erreur', 'error'); }
    setSaving(false);
  };

  const handleUpdateProfile = async (pId, newRole, newKourelId) => {
    await supabase.from('profiles').update({ role: newRole, kourel_id: newKourelId }).eq('id', pId);
    await fetchGlobalStats();
    showToast('Profil validé');
  };

  const handleAddOrUpdateMember = async () => {
    if (!newMember.name.trim()) return;
    setSaving(true);
    const payload = { name: newMember.name, phone: newMember.phone };
    if (editingMember) await supabase.from('members').update(payload).eq('id', editingMember.id);
    else await supabase.from('members').insert([{ ...payload, kourel_id: selectedKourel.id }]);
    await loadKourelData(selectedKourel.id);
    setNewMember({ name: '', phone: '' }); setEditingMember(null);
    showToast('Enregistrement réussi');
    setSaving(false);
  };

  const handleDeleteMember = async (id) => {
    confirmAction("Suppression", "Retirer ce membre ?", async () => {
      await supabase.from('members').delete().eq('id', id);
      await loadKourelData(selectedKourel.id);
      showToast('Retiré');
    }, 'danger');
  };

  const deleteSession = async (date) => {
    confirmAction("Suppression", `Effacer la séance du ${date} ?`, async () => {
      await supabase.from('attendance').delete().eq('date', date).in('member_id', allMembers.map(m => m.id));
      await loadKourelData(selectedKourel.id);
      showToast('Effacée');
    }, 'danger');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) await fetchProfile(data.user.id);
    else { showToast('Accès refusé', 'error'); setLoading(false); }
  };

  const generateFilteredPDF = (date = null) => {
    const doc = new jsPDF();
    const data = date ? history.filter(h => h.date === date) : filteredHistory;
    const periodLabel = date ? format(parseISO(date), 'dd MMMM yyyy', { locale: fr }) : format(parseISO(selectedMonth + "-01"), 'MMMM yyyy', { locale: fr });
    doc.setFontSize(22); doc.setTextColor(0, 51, 98); doc.text("SAYTU NUXBA", 14, 20);
    autoTable(doc, { startY: 40, head: [['NOM ET PRENOM', 'STATUT', 'DATE']], body: data.map(h => [h.members?.name.toUpperCase(), h.status.toUpperCase(), h.date]), headStyles: { fillColor: [0, 51, 98] } });
    doc.save('rapport.pdf');
  };

  const GoldGradientText = ({ children, className = "" }) => (
    <span className={`bg-gradient-to-r from-[#dc9b3f] via-[#f0bd53] to-[#f3df8f] bg-clip-text text-transparent drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.1)] ${className}`}>
      {children}
    </span>
  );

  const LogoCercle = ({ size = "w-24 h-24" }) => (
    <div className={`${size} rounded-full bg-white border border-[#003362]/10 p-2 flex items-center justify-center shadow-sm mx-auto overflow-hidden`}>
      <img src={logoDahira} alt="Logo" className="w-full h-full object-contain" />
    </div>
  );

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white space-y-6">
      <LogoCercle size="w-32 h-32" />
      <Loader2 className="animate-spin text-[#003362]" size={32} />
    </div>
  );

  const navItems = [
    { id: 'dashboard', label: 'Accueil', icon: Home, roles: ['surveillant', 'coordinateur'] },
    { id: 'attendance', label: 'Appel', icon: CheckCircle2, roles: ['surveillant'] },
    { id: 'history', label: 'Historique', icon: ClipboardList, roles: ['surveillant', 'coordinateur'] },
    { id: 'mgmt', label: 'Gestion', icon: Settings, roles: ['surveillant', 'coordinateur'] },
  ].filter(item => item.roles.includes(profile?.role));

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans flex flex-col antialiased">
      
      {modal.show && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[#003362]/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-[2rem] shadow-2xl overflow-hidden">
            <div className={`p-8 text-center space-y-4 ${modal.type === 'danger' ? 'bg-red-50' : 'bg-emerald-50'}`}>
              <h3 className="text-lg font-black uppercase text-[#003362]">{modal.title}</h3>
              <p className="text-sm text-slate-500 font-medium">{modal.msg}</p>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <button onClick={() => setModal({ ...modal, show: false })} className="py-4 rounded-xl font-black text-[10px] uppercase text-slate-400 bg-slate-50">Annuler</button>
              <button onClick={() => { modal.onConfirm(); setModal({ ...modal, show: false }); }} className={`py-4 rounded-xl font-black text-[10px] uppercase text-white ${modal.type === 'danger' ? 'bg-red-600' : 'bg-[#003362]'}`}>Confirmer</button>
            </div>
          </div>
        </div>
      )}

      {user && (
        <header className="sticky top-0 z-[80] bg-[#003362] text-white h-16 border-b border-[#f0bd53]/30">
          <div className="max-w-4xl mx-auto px-4 h-full flex justify-between items-center">
            <div className="flex items-center gap-3">
              <LogoCercle size="w-10 h-10" />
              <span className="font-bold tracking-tighter text-sm uppercase hidden sm:inline">Saytu Nuxba</span>
            </div>
            <nav className="hidden md:flex gap-6">
              {navItems.map(item => (
                <button key={item.id} onClick={() => setView(item.id)} className={`flex items-center gap-2 text-xs font-black uppercase transition-colors ${view === item.id ? 'text-[#f0bd53]' : 'text-slate-300 hover:text-white'}`}>
                  <item.icon size={16} /> {item.label}
                </button>
              ))}
            </nav>
            <button onClick={() => confirmAction("Déconnexion", "Quitter ?", () => supabase.auth.signOut().then(() => window.location.reload()))} className="p-1 text-slate-300 hover:text-red-400"><LogOut size={20}/></button>
          </div>
        </header>
      )}

      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-6 py-2 rounded-full shadow-2xl text-white font-black text-[9px] uppercase tracking-widest z-[150] bg-[#003362] animate-in slide-in-from-top-4`}>
          {toast.msg}
        </div>
      )}

      <main className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-8 pb-32">
        {view === 'login' && (
          <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-12">
            <LogoCercle size="w-40 h-40" />
            <form onSubmit={handleLogin} className="w-full max-w-sm bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-2xl space-y-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#dc9b3f] via-[#f0bd53] to-[#f3df8f]"></div>
              <div className="text-center space-y-1">
                <h1 className="text-xl font-black uppercase tracking-tight text-[#003362]">Espace Saytu</h1>
                <p className="text-slate-400 text-[9px] font-black uppercase tracking-[0.2em]">Nuxbatul Haqabatil Xadiimiyyah</p>
              </div>
              <div className="space-y-3">
                <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-sm" />
                <input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-sm" />
              </div>
              <button className="w-full py-4 rounded-xl bg-gradient-to-r from-[#dc9b3f] via-[#f0bd53] to-[#f3df8f] text-white font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all shadow-lg shadow-[#f0bd53]/20">Se Connecter</button>
            </form>
          </div>
        )}

        {view === 'selection' && (
          <div className="space-y-6 animate-in fade-in">
            <h2 className="text-xl font-black uppercase tracking-tighter border-l-4 border-[#f0bd53] pl-4 text-[#003362]">Registre des Kourels</h2>
            <div className="grid gap-3">
              {kourels.map(k => (
                <div key={k.id} onClick={() => { setSelectedKourel(k); loadKourelData(k.id); setView('dashboard'); }} className="p-6 bg-white border border-slate-100 rounded-2xl flex justify-between items-center cursor-pointer hover:border-[#003362] transition-all shadow-sm group">
                  <div className="space-y-1"><p className="font-black text-slate-900 group-hover:text-[#003362] uppercase text-sm">{k.name}</p><p className="text-[10px] text-[#dc9b3f] font-black uppercase">{k.location}</p></div>
                  <div className="bg-[#003362] text-white px-4 py-2 rounded-lg font-black text-sm">{kourelStats[k.id]?.rate}%</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedKourel && (
          <div className="animate-in fade-in space-y-6">
            {view === 'dashboard' && (
              <div className="space-y-6">
                <div className="bg-[#003362] text-white p-8 rounded-[2rem] space-y-6 shadow-xl relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-[#dc9b3f]/10 rounded-full blur-2xl"></div>
                   <h2 className="text-2xl font-black uppercase tracking-tighter relative z-10">{selectedKourel.name}</h2>
                   <div className="grid grid-cols-2 gap-4 relative z-10">
                      <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                        <GoldGradientText className="text-3xl font-black">{stats.globalRate}%</GoldGradientText>
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Assiduité</p>
                      </div>
                      <div className="bg-white/5 p-5 rounded-2xl border border-white/10">
                        <p className="text-3xl font-black">{members.length}</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Membres Actifs</p>
                      </div>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                   {profile?.role === 'surveillant' && (
                     <button onClick={() => setView('attendance')} className="bg-gradient-to-r from-[#dc9b3f] to-[#f0bd53] text-white p-6 rounded-2xl shadow-xl flex items-center justify-between group active:scale-95 transition-all">
                        <div className="text-left"><p className="font-black uppercase text-xs tracking-widest">Faire l'appel</p><p className="text-[9px] opacity-80 font-bold uppercase">{format(new Date(), 'EEEE d MMMM', { locale: fr })}</p></div>
                        <div className="bg-white/20 p-2 rounded-lg group-hover:rotate-12 transition-transform"><CheckCircle2 size={24}/></div>
                     </button>
                   )}
                   <button onClick={() => setView('history')} className="bg-white border border-slate-100 p-6 rounded-2xl flex items-center justify-between hover:border-[#003362] transition-all shadow-sm">
                      <div className="text-left"><p className="font-black text-[#003362] uppercase text-xs tracking-widest">Historique</p><p className="text-[9px] text-slate-400 font-bold uppercase">Consulter les archives</p></div>
                      <ClipboardList className="text-slate-200" size={24} />
                   </button>
                </div>
              </div>
            )}

            {view === 'attendance' && (
              <div className="space-y-6 pb-20">
                <div className="bg-white border border-slate-200 p-6 rounded-2xl flex flex-col items-center gap-4 shadow-sm relative">
                  <p className="text-[10px] font-black text-[#003362] uppercase tracking-[0.3em]">{format(attendanceDate, 'EEEE d MMMM yyyy', { locale: fr })}</p>
                  <div className="flex items-center gap-10">
                    <button onClick={() => setAttendanceDate(new Date(attendanceDate.setDate(attendanceDate.getDate()-1)))} className="p-2 bg-slate-50 text-[#003362] rounded-lg"><ChevronLeft size={20}/></button>
                    <div className="relative"><Calendar className="text-[#dc9b3f]" size={28}/><input type="date" value={format(attendanceDate, 'yyyy-MM-dd')} onChange={e => setAttendanceDate(parseISO(e.target.value))} className="absolute inset-0 opacity-0 cursor-pointer" /></div>
                    <button onClick={() => setAttendanceDate(new Date(attendanceDate.setDate(attendanceDate.getDate()+1)))} className="p-2 bg-slate-50 text-[#003362] rounded-lg"><ChevronRight size={20}/></button>
                  </div>
                </div>
                <div className="space-y-3">
                  {members.map(m => (
                    <div key={m.id} className="bg-white p-4 rounded-xl border border-slate-50 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm">
                      <p className="font-black text-slate-800 uppercase text-xs truncate max-w-[200px]">{m.name}</p>
                      <div className="flex gap-1">
                        {[{ l: 'ABSENT', v: 'Absent', c: 'bg-red-600' }, { l: 'NGANT', v: 'Excusé', c: 'bg-[#dc9b3f]' }, { l: 'PRÉSENT', v: 'Présent', c: 'bg-[#003362]' }].map((btn) => (
                          <button key={btn.v} onClick={() => setAttendance({...attendance, [m.id]: btn.v})} className={`px-4 py-2 rounded-lg font-black text-[8px] transition-all ${attendance[m.id] === btn.v ? `${btn.c} text-white shadow-lg` : 'bg-slate-50 text-slate-300'}`}>{btn.l}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="fixed bottom-24 left-0 right-0 px-6 z-[100]"><button onClick={() => confirmAction("Validation", "Valider la séance ?", saveAttendance)} disabled={saving} className="w-full max-w-xs mx-auto py-4 rounded-xl bg-[#003362] text-white font-black uppercase text-[10px] tracking-widest shadow-2xl block">{saving ? 'EN COURS...' : 'VALIDER L\'APPEL'}</button></div>
              </div>
            )}

            {view === 'history' && (
              <div className="space-y-6">
                <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-4 shadow-lg text-left">
                  <div className="flex justify-between items-center"><h2 className="text-sm font-black uppercase tracking-tight text-[#003362]">Archives</h2><button onClick={() => generateFilteredPDF()} disabled={filteredHistory.length === 0} className="bg-[#003362] text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase shadow-lg">Export PDF</button></div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-xs" />
                    <input type="text" placeholder="Membre..." value={histSearch} onChange={e => setHistSearch(e.target.value)} className="p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-xs" />
                    <select value={histStatus} onChange={e => setHistStatus(e.target.value)} className="p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-xs"><option value="Tous">Tous</option><option value="Présent">Présents</option><option value="Absent">Absents</option><option value="Excusé">NGANT</option></select>
                  </div>
                </div>
                <div className="space-y-3">
                  {sessionsList.filter(d => d.startsWith(selectedMonth)).map(date => (
                    <div key={date} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                       <button onClick={() => setExpandedSession(expandedSession === date ? null : date)} className="w-full p-6 flex justify-between items-center">
                         <div className="text-left space-y-1"><p className="font-black text-[#003362] uppercase text-xs">{format(parseISO(date), 'EEEE d MMMM yyyy', { locale: fr })}</p></div>
                         <div className="flex items-center gap-3"><button onClick={(e) => { e.stopPropagation(); generateFilteredPDF(date); }} className="p-2 text-emerald-600 bg-emerald-50 rounded-lg"><FileDown size={16}/></button>{expandedSession === date ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}</div>
                       </button>
                       {expandedSession === date && (
                         <div className="p-6 bg-slate-50 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-2">
                           {history.filter(h => h.date === date).map(h => (
                             <div key={h.id} className="bg-white p-3 rounded-lg border border-slate-100 flex justify-between items-center"><p className="font-bold text-[10px] uppercase text-slate-700">{h.members?.name}</p><span className={`text-[7px] font-black px-2 py-0.5 rounded ${h.status === 'Présent' ? 'bg-emerald-50 text-emerald-700' : h.status === 'Absent' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{h.status.toUpperCase()}</span></div>
                           ))}
                         </div>
                       )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-[#003362]/95 backdrop-blur-xl border-t border-[#f0bd53]/30 h-16 flex justify-around items-center z-[120] px-2 shadow-2xl">
        {navItems.map(item => (
          <button key={item.id} onClick={() => setView(item.id)} className={`flex flex-col items-center gap-1 p-2 transition-all ${view === item.id ? 'text-[#f0bd53] scale-110' : 'text-slate-300 opacity-60'}`}>
            <item.icon size={22} strokeWidth={view === item.id ? 3 : 2} />
            <span className="text-[8px] font-black uppercase">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default App;
