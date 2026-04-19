import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { 
  Home, CheckCircle2, ClipboardList, Settings, LogOut, 
  Plus, Save, Loader2, ChevronLeft, ChevronRight, Search, 
  Phone, FileDown, Trash2, Users, Calendar, ShieldCheck, Pencil, X, TrendingUp, Info, AlertTriangle
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { fr } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoDahira from './assets/logo_dahira.png';

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

  const [modal, setModal] = useState({ show: false, title: '', msg: '', onConfirm: null, type: 'confirm' });

  useEffect(() => { checkUser(); }, []);
  useEffect(() => {
    if (selectedKourel && view === 'attendance') loadExistingAttendance();
  }, [attendanceDate, selectedKourel, view]);

  const filteredHistory = useMemo(() => {
    return history.filter(h => {
      const matchMonth = h.date.startsWith(selectedMonth);
      const matchSearch = histSearch === '' || h.members?.name.toLowerCase().includes(histSearch.toLowerCase());
      const matchStatus = histStatus === 'Tous' || h.status === histStatus;
      return matchMonth && matchSearch && matchStatus;
    });
  }, [history, selectedMonth, histSearch, histStatus]);

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
      const { data: pList } = await supabase.from('profiles').select('*');
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
    confirmAction(
      "Suppression", 
      "Voulez-vous retirer définitivement ce membre ?", 
      async () => {
        await supabase.from('members').delete().eq('id', id);
        await loadKourelData(selectedKourel.id);
        showToast('Membre retiré');
      },
      'danger'
    );
  };

  const deleteSession = async (date) => {
    confirmAction(
      "Suppression", 
      `Effacer la séance du ${date} ?`, 
      async () => {
        await supabase.from('attendance').delete().eq('date', date).in('member_id', allMembers.map(m => m.id));
        await loadKourelData(selectedKourel.id);
        showToast('Session effacée');
      },
      'danger'
    );
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) await fetchProfile(data.user.id);
    else { showToast('Accès refusé', 'error'); setLoading(false); }
  };

  const generateFilteredPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(22); doc.setTextColor(0, 51, 98); doc.text("SAYTU KUREL", 14, 20);
    doc.setFontSize(12); doc.setTextColor(30, 41, 59); doc.text(`Rapport - ${selectedKourel.name}`, 14, 28);
    autoTable(doc, { 
      startY: 40, head: [['NOM ET PRENOM', 'STATUT', 'DATE']], 
      body: filteredHistory.map(h => [h.members?.name.toUpperCase(), h.status.toUpperCase(), h.date]),
      headStyles: { fillColor: [0, 51, 98] }
    });
    doc.save('rapport.pdf');
  };

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white space-y-6">
      <img src={logoDahira} alt="Logo" className="w-32 h-32 animate-pulse" />
      <Loader2 className="animate-spin text-[#003362]" size={40} />
      <p className="text-[10px] font-black text-[#003362] uppercase tracking-[0.3em]">Saytu Kurel</p>
    </div>
  );

  const navItems = [
    { id: 'dashboard', label: 'Accueil', icon: Home, roles: ['surveillant', 'coordinateur'] },
    { id: 'attendance', label: 'Appel', icon: CheckCircle2, roles: ['surveillant'] },
    { id: 'history', label: 'Historique', icon: ClipboardList, roles: ['surveillant', 'coordinateur'] },
    { id: 'mgmt', label: 'Gestion', icon: Settings, roles: ['surveillant', 'coordinateur'] },
  ].filter(item => item.roles.includes(profile?.role));

  const GoldGradientText = ({ children, className = "" }) => (
    <span className={`bg-gradient-to-r from-[#dc9b3f] via-[#f0bd53] to-[#f3df8f] bg-clip-text text-transparent ${className}`}>
      {children}
    </span>
  );

  const GoldGradientBtn = ({ onClick, children, className = "", disabled = false }) => (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`bg-gradient-to-r from-[#dc9b3f] via-[#f0bd53] to-[#f3df8f] text-white font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-[#f0bd53]/20 ${className}`}
    >
      {children}
    </button>
  );

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans flex flex-col antialiased">
      
      {modal.show && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[#003362]/40 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100">
            <div className={`p-8 text-center space-y-4 ${modal.type === 'danger' ? 'bg-red-50' : 'bg-amber-50'}`}>
              <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center ${modal.type === 'danger' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-[#dc9b3f]'}`}>
                {modal.type === 'danger' ? <AlertTriangle size={32}/> : <ShieldCheck size={32}/>}
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black uppercase tracking-tight text-[#003362]">{modal.title}</h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">{modal.msg}</p>
              </div>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <button onClick={() => setModal({ ...modal, show: false })} className="py-4 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-400 bg-slate-50">Annuler</button>
              <button onClick={() => { modal.onConfirm(); setModal({ ...modal, show: false }); }} className={`py-4 rounded-xl font-black text-[10px] uppercase tracking-widest text-white shadow-lg transition-all ${modal.type === 'danger' ? 'bg-red-600' : 'bg-[#003362]'}`}>Confirmer</button>
            </div>
          </div>
        </div>
      )}

      {user && (
        <header className="sticky top-0 z-[80] bg-[#003362] text-white shadow-md border-b-2 border-[#f0bd53]">
          <div className="max-w-4xl mx-auto px-4 py-3 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <img src={logoDahira} alt="Logo" className="w-10 h-10 object-contain bg-white rounded-full p-0.5" />
              <span className="font-bold tracking-tighter text-lg uppercase hidden sm:inline">Saytu Kurel</span>
            </div>
            <nav className="hidden md:flex gap-8">
              {navItems.map(item => (
                <button key={item.id} onClick={() => setView(item.id)} className={`flex items-center gap-2 text-xs font-black uppercase transition-colors ${view === item.id ? 'text-[#f0bd53]' : 'text-slate-300 hover:text-white'}`}>
                  <item.icon size={16} /> {item.label}
                </button>
              ))}
            </nav>
            <button onClick={() => confirmAction("Déconnexion", "Quitter l'espace ?", () => supabase.auth.signOut().then(() => window.location.reload()))} className="p-1 text-slate-300 hover:text-[#f0bd53] transition-colors"><LogOut size={20}/></button>
          </div>
        </header>
      )}

      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl text-white font-black text-[10px] uppercase tracking-widest z-[150] animate-in slide-in-from-top-4 ${toast.type === 'success' ? 'bg-[#003362]' : 'bg-red-700'}`}>
          {toast.msg}
        </div>
      )}

      <main className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-8 pb-32">
        
        {view === 'login' && (
          <div className="min-h-[70vh] flex flex-col items-center justify-center p-4">
            <img src={logoDahira} alt="Logo" className="w-32 h-32 mb-8" />
            <form onSubmit={handleLogin} className="w-full max-w-sm bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-2xl space-y-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#dc9b3f] via-[#f0bd53] to-[#f3df8f]"></div>
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-black uppercase tracking-tight text-[#003362]">Espace Saytu</h1>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Dahira Nuxbatul Haqabatil Xadiimiyyah</p>
              </div>
              <div className="space-y-4">
                <input type="email" placeholder="Identifiant" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 ring-[#003362] transition-all font-bold text-sm" />
                <input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 ring-[#003362] transition-all font-bold text-sm" />
              </div>
              <GoldGradientBtn className="w-full py-5 rounded-2xl text-[11px]">Se Connecter</GoldGradientBtn>
            </form>
          </div>
        )}

        {view === 'selection' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <h2 className="text-2xl font-black uppercase tracking-tighter border-l-8 border-[#f0bd53] pl-4 text-[#003362]">Registre des Kourels</h2>
            <div className="grid gap-4">
              {kourels.map(k => (
                <div key={k.id} onClick={() => { setSelectedKourel(k); loadKourelData(k.id); setView('dashboard'); }} className="p-8 bg-white border border-slate-200 rounded-[2rem] flex justify-between items-center cursor-pointer hover:border-[#003362] transition-all shadow-sm group">
                  <div className="space-y-1">
                    <p className="font-black text-slate-900 group-hover:text-[#003362] uppercase text-lg leading-tight">{k.name}</p>
                    <p className="text-[10px] text-[#dc9b3f] font-black uppercase tracking-widest">{k.location}</p>
                  </div>
                  <div className="bg-[#003362] text-white px-6 py-3 rounded-xl font-black text-xl border border-[#003362] shadow-lg shadow-[#003362]/10">{kourelStats[k.id]?.rate}%</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedKourel && (
          <div className="animate-in fade-in duration-500 space-y-8">
            {view === 'dashboard' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[{ label: 'Sessions', value: stats.totalSessions, color: 'text-[#003362]' }, { label: 'Assiduité', value: `${stats.globalRate}%`, color: 'text-emerald-700' }, { label: 'Membres', value: members.length, color: 'text-[#dc9b3f]' }].map((s, i) => (
                    <div key={i} className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm text-center">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-2">{s.label}</p>
                      <p className={`text-4xl font-black ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
                {profile?.role === 'surveillant' && (
                  <GoldGradientBtn onClick={() => setView('attendance')} className="w-full p-10 rounded-[2.5rem] flex flex-col items-center justify-center gap-2">
                    <span className="text-2xl font-black uppercase tracking-tight">Ouvrir le Registre</span>
                    <span className="text-[10px] text-white/80 font-black uppercase tracking-widest">{format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}</span>
                  </GoldGradientBtn>
                )}
                {profile?.role === 'coordinateur' && (
                  <div className="bg-[#003362] p-10 rounded-[2.5rem] text-white flex flex-col items-center text-center space-y-6 shadow-2xl">
                    <TrendingUp size={48} className="text-[#f0bd53]" />
                    <div className="space-y-2">
                      <h3 className="text-xl font-black uppercase tracking-tight text-[#f0bd53]">Supervision Master</h3>
                      <p className="text-xs text-slate-300 font-medium uppercase tracking-widest leading-relaxed">Archives et rapports officiels</p>
                    </div>
                    <button onClick={() => setView('history')} className="bg-white text-[#003362] px-10 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">Consulter l'Historique</button>
                  </div>
                )}
              </>
            )}

            {view === 'attendance' && (
              <div className="space-y-6 pb-20">
                <div className="bg-white border border-[#003362]/10 p-8 rounded-[2rem] flex flex-col items-center gap-6 shadow-lg relative">
                  <GoldGradientText className="text-[10px] font-black uppercase tracking-widest">Date de la séance</GoldGradientText>
                  <p className="text-lg font-black text-[#003362] uppercase">{format(attendanceDate, 'EEEE d MMMM yyyy', { locale: fr })}</p>
                  <div className="flex items-center gap-12">
                    <button onClick={() => setAttendanceDate(new Date(attendanceDate.setDate(attendanceDate.getDate()-1)))} className="p-4 bg-slate-50 text-[#003362] rounded-xl hover:bg-slate-100 transition-all shadow-sm"><ChevronLeft size={24}/></button>
                    <div className="relative group"><Calendar className="text-[#dc9b3f] transition-transform group-hover:scale-110" size={40}/><input type="date" value={format(attendanceDate, 'yyyy-MM-dd')} onChange={e => setAttendanceDate(parseISO(e.target.value))} className="absolute inset-0 opacity-0 cursor-pointer" /></div>
                    <button onClick={() => setAttendanceDate(new Date(attendanceDate.setDate(attendanceDate.getDate()+1)))} className="p-4 bg-slate-50 text-[#003362] rounded-xl hover:bg-slate-100 transition-all shadow-sm"><ChevronRight size={24}/></button>
                  </div>
                </div>
                <div className="relative"><Search className="absolute left-6 top-5 text-slate-300" size={20} /><input type="text" placeholder="RECHERCHER DANS LE KUREL..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-5 pl-14 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-[#003362] font-black text-[10px] tracking-widest" /></div>
                <div className="space-y-3">
                  {members.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase())).map(m => (
                    <div key={m.id} className="bg-white p-6 rounded-2xl border border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-6 shadow-sm">
                      <p className="font-black text-slate-800 text-center sm:text-left uppercase text-sm tracking-tight">{m.name}</p>
                      <div className="flex gap-2 w-full sm:w-auto">
                        {[
                          { l: 'ABSENT', v: 'Absent', c: 'bg-red-600' },
                          { l: 'NGANT', v: 'Excusé', c: 'bg-[#dc9b3f]' },
                          { l: 'PRÉSENT', v: 'Présent', c: 'bg-[#003362]' },
                        ].map((btn) => (
                          <button key={btn.v} onClick={() => setAttendance({...attendance, [m.id]: btn.v})} className={`flex-1 sm:flex-none px-5 py-4 rounded-xl font-black text-[10px] uppercase transition-all ${
                            attendance[m.id] === btn.v ? `${btn.c} text-white shadow-xl scale-105` : 'bg-slate-50 text-slate-300'
                          }`}>{btn.l}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="fixed bottom-24 left-0 right-0 px-6 md:px-0 md:static flex justify-center z-[100]"><GoldGradientBtn onClick={() => confirmAction("Validation", "Enregistrer cette séance ?", saveAttendance)} disabled={saving} className="w-full max-w-sm py-6 rounded-[2rem] text-[11px] tracking-[0.3em]">{saving ? 'VALIDATION...' : 'VALIDER LE REGISTRE'}</GoldGradientBtn></div>
              </div>
            )}

            {view === 'history' && (
              <div className="space-y-8">
                <div className="bg-white border border-slate-200 p-8 rounded-[2rem] space-y-6 shadow-lg">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3"><ClipboardList className="text-[#003362]" size={32}/><h2 className="text-2xl font-black uppercase tracking-tight text-[#003362]">Activité du Kourel</h2></div>
                    <button onClick={generateFilteredPDF} disabled={filteredHistory.length === 0} className="bg-[#003362] text-white px-6 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg">Export PDF</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400 ml-3">Période</label><input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-black text-xs outline-none focus:ring-2 ring-[#003362]" /></div>
                    <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400 ml-3">Nom</label><input type="text" placeholder="Rechercher..." value={histSearch} onChange={e => setHistSearch(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-black text-xs outline-none focus:ring-2 ring-[#003362]" /></div>
                    <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400 ml-3">Statut</label><select value={histStatus} onChange={e => setHistStatus(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-black text-xs outline-none focus:ring-2 ring-[#003362]"><option value="Tous">Tous</option><option value="Présent">Présents</option><option value="Absent">Absents</option><option value="Excusé">NGANT</option></select></div>
                  </div>
                </div>

                <div className="space-y-10">
                  {[...new Set(filteredHistory.map(h => h.date))].sort((a,b) => new Date(b)-new Date(a)).map(date => (
                    <div key={date} className="space-y-6">
                      <div className="flex items-center gap-6 px-4">
                         <p className="text-[11px] font-black uppercase text-[#003362] tracking-[0.3em] whitespace-nowrap">{format(parseISO(date), 'EEEE d MMMM yyyy', { locale: fr })}</p>
                         <div className="h-0.5 flex-1 bg-gradient-to-r from-[#f0bd53] to-transparent"></div>
                         {profile?.role === 'coordinateur' && <button onClick={() => deleteSession(date)} className="p-2 text-red-400 hover:text-red-600 transition-colors"><Trash2 size={20}/></button>}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredHistory.filter(h => h.date === date).map(h => (
                          <div key={h.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center">
                            <p className="font-bold text-sm text-slate-700 uppercase tracking-tight">{h.members?.name}</p>
                            <span className={`text-[8px] font-black px-3 py-1.5 rounded-lg border ${
                              h.status === 'Présent' ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 
                              h.status === 'Absent' ? 'text-red-700 bg-red-50 border-red-100' : 
                              'text-[#dc9b3f] bg-amber-50 border-amber-100'
                            }`}>{h.status === 'Excusé' ? 'NGANT' : h.status.toUpperCase()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'mgmt' && (
              <div className="space-y-10">
                <div className="flex bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm overflow-hidden max-w-sm">
                   <button onClick={() => setMgmtTab('members')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${mgmtTab === 'members' ? 'bg-[#003362] text-white shadow-lg' : 'text-slate-400'}`}>Membres</button>
                   <button onClick={() => setMgmtTab('sessions')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${mgmtTab === 'sessions' ? 'bg-[#003362] text-white shadow-lg' : 'text-slate-400'}`}>Sessions</button>
                   {profile?.role === 'coordinateur' && <button onClick={() => setMgmtTab('users')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${mgmtTab === 'users' ? 'bg-[#003362] text-white shadow-lg' : 'text-slate-400'}`}>Admin</button>}
                </div>

                {mgmtTab === 'members' && (
                  <div className="space-y-6">
                    {profile?.role === 'surveillant' && (
                      <div className="bg-white border border-[#003362]/10 p-10 rounded-[3rem] space-y-6 shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-bl-[4rem]"></div>
                        <div className="flex justify-between items-center"><GoldGradientText className="text-[11px] font-black uppercase tracking-widest underline decoration-[#003362] underline-offset-8">{editingMember ? 'Modification' : 'Nouvelle Inscription'}</GoldGradientText>{editingMember && <button onClick={() => { setEditingMember(null); setNewMember({name:'', phone:''}); }} className="p-2 bg-slate-100 rounded-full"><X size={16}/></button>}</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <input type="text" placeholder="Prénom & Nom" value={newMember.name} onChange={e => setNewMember({...newMember, name: e.target.value})} className="p-5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-sm" />
                          <input type="tel" placeholder="Téléphone" value={newMember.phone} onChange={e => setNewMember({...newMember, phone: e.target.value})} className="p-5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-sm" />
                        </div>
                        <GoldGradientBtn onClick={handleAddOrUpdateMember} disabled={saving} className="w-full py-5 rounded-xl text-[11px] tracking-[0.2em] flex items-center justify-center gap-3">
                          {editingMember ? <Save size={18}/> : <Plus size={18}/>} {editingMember ? 'Sauvegarder' : 'Inscrire au Kourel'}
                        </GoldGradientBtn>
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-3">
                      {allMembers.map(m => (
                        <div key={m.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 flex justify-between items-center shadow-sm">
                          <div className="space-y-1"><p className="font-black text-slate-800 uppercase text-sm tracking-tight">{m.name}</p><p className="text-[10px] text-[#003362] font-black tracking-widest">{m.phone || 'AUCUN CONTACT'}</p></div>
                          <div className="flex gap-2">
                             {m.phone && <a href={`tel:${m.phone}`} className="p-3 bg-slate-50 text-[#003362] rounded-xl border border-slate-100"><Phone size={18}/></a>}
                             {profile?.role === 'surveillant' && (
                               <div className="flex gap-2">
                                 <button onClick={() => { setEditingMember(m); setNewMember({name: m.name, phone: m.phone || ''}); window.scrollTo({top:0, behavior:'smooth'}); }} className="p-3 bg-slate-50 text-slate-600 rounded-xl border border-slate-100"><Pencil size={18}/></button>
                                 <button onClick={() => confirmAction("Statut", `Changer le statut de ${m.name} ?`, async () => { await supabase.from('members').update({active: !m.active}).eq('id', m.id); loadKourelData(selectedKourel.id); })} className={`p-3 rounded-xl border ${m.active ? 'text-amber-700 bg-amber-50 border-amber-100' : 'text-[#003362] bg-[#003362]/5 border-[#003362]/10'}`}><Users size={18}/></button>
                                 <button onClick={() => handleDeleteMember(m.id)} className="p-3 bg-red-50 text-red-600 rounded-xl border border-red-100"><Trash2 size={18}/></button>
                               </div>
                             )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-[#003362]/95 backdrop-blur-xl border-t-4 border-[#f0bd53] h-20 flex justify-around items-center z-[120] px-2 shadow-2xl">
        {navItems.map(item => (
          <button key={item.id} onClick={() => setView(item.id)} className={`flex flex-col items-center gap-1 p-2 min-w-[75px] transition-all ${view === item.id ? 'text-[#f0bd53] scale-110' : 'text-slate-300 opacity-60'}`}>
            <item.icon size={24} strokeWidth={view === item.id ? 3 : 2} />
            <span className="text-[9px] font-black uppercase tracking-widest">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default App;
