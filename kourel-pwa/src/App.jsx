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
      "Retirer définitivement ce membre ?", 
      async () => {
        await supabase.from('members').delete().eq('id', id);
        await loadKourelData(selectedKourel.id);
        showToast('Membre retiré');
      },
      'danger'
    );
  };

  const deleteSession = async (date) => {
    confirmAction("Suppression", `Effacer la séance du ${date} ?`, async () => {
      await supabase.from('attendance').delete().eq('date', date).in('member_id', allMembers.map(m => m.id));
      await loadKourelData(selectedKourel.id);
      showToast('Session effacée');
    }, 'danger');
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
    autoTable(doc, { 
      startY: 40, head: [['NOM ET PRENOM', 'STATUT', 'DATE']], 
      body: filteredHistory.map(h => [h.members?.name.toUpperCase(), h.status.toUpperCase(), h.date]),
      headStyles: { fillColor: [0, 51, 98] }
    });
    doc.save('rapport.pdf');
  };

  const GoldGradientText = ({ children, className = "" }) => (
    <span className={`bg-gradient-to-r from-[#dc9b3f] via-[#f0bd53] to-[#f3df8f] bg-clip-text text-transparent drop-shadow-[0_2px_3px_rgba(0,0,0,0.2)] ${className}`}>
      {children}
    </span>
  );

  const GoldGradientBtn = ({ onClick, children, className = "", disabled = false }) => (
    <button onClick={onClick} disabled={disabled} className={`bg-gradient-to-r from-[#dc9b3f] via-[#f0bd53] to-[#f3df8f] text-white font-black uppercase tracking-widest transition-all active:scale-95 shadow-xl shadow-[#f0bd53]/20 drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.25)] ${className}`}>
      {children}
    </button>
  );

  const LogoSceau = ({ size = "w-32 h-32", withAnimation = false }) => (
    <div className={`relative ${size} mx-auto ${withAnimation ? 'animate-bounce-slow' : ''}`}>
      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#dc9b3f] via-[#f3df8f] to-[#dc9b3f] p-1.5 shadow-2xl">
        <div className="w-full h-full rounded-full bg-[#003362] p-1">
          <div className="w-full h-full rounded-full bg-white flex items-center justify-center p-2 overflow-hidden">
            <img src={logoDahira} alt="Logo Dahira" className="w-full h-full object-contain" />
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white space-y-12">
      <LogoSceau size="w-48 h-48" withAnimation={true} />
      <div className="text-center space-y-4">
        <Loader2 className="animate-spin text-[#003362] mx-auto" size={40} />
        <p className="text-[11px] font-black text-[#003362] uppercase tracking-[0.4em] animate-pulse">Initialisation du Registre</p>
      </div>
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
      <style>{`
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-bounce-slow { animation: bounce-slow 4s ease-in-out infinite; }
      `}</style>

      {modal.show && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[#003362]/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
            <div className={`p-8 text-center space-y-4 ${modal.type === 'danger' ? 'bg-red-50' : 'bg-amber-50'}`}>
              <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center ${modal.type === 'danger' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-[#dc9b3f]'}`}>
                {modal.type === 'danger' ? <AlertTriangle size={32}/> : <ShieldCheck size={32}/>}
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight text-[#003362]">{modal.title}</h3>
              <p className="text-sm text-slate-500 font-medium">{modal.msg}</p>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <button onClick={() => setModal({ ...modal, show: false })} className="py-4 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-400 bg-slate-50">Annuler</button>
              <button onClick={() => { modal.onConfirm(); setModal({ ...modal, show: false }); }} className={`py-4 rounded-xl font-black text-[10px] uppercase tracking-widest text-white ${modal.type === 'danger' ? 'bg-red-600' : 'bg-[#003362]'}`}>Confirmer</button>
            </div>
          </div>
        </div>
      )}

      {user && (
        <header className="sticky top-0 z-[80] bg-[#003362] text-white shadow-xl h-24 border-b-2 border-[#f0bd53]">
          <div className="max-w-4xl mx-auto px-4 h-full flex justify-between items-center relative">
            <div className="flex items-center gap-3">
              <div className="translate-y-4">
                <LogoSceau size="w-24 h-24" />
              </div>
              <span className="font-bold tracking-tighter text-xl uppercase hidden sm:inline ml-4 pt-2">Saytu Kurel</span>
            </div>
            <nav className="hidden md:flex gap-8 pt-2">
              {navItems.map(item => (
                <button key={item.id} onClick={() => setView(item.id)} className={`flex items-center gap-2 text-xs font-black uppercase transition-colors ${view === item.id ? 'text-[#f0bd53]' : 'text-slate-300 hover:text-white'}`}>
                  <item.icon size={16} /> {item.label}
                </button>
              ))}
            </nav>
            <button onClick={() => confirmAction("Déconnexion", "Quitter l'espace ?", () => supabase.auth.signOut().then(() => window.location.reload()))} className="p-1 text-slate-300 hover:text-[#f0bd53] pt-2"><LogOut size={22}/></button>
          </div>
        </header>
      )}

      <main className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-12 pb-32">
        {view === 'login' && (
          <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 space-y-12">
            <LogoSceau size="w-48 h-48" withAnimation={true} />
            <form onSubmit={handleLogin} className="w-full max-w-sm bg-white p-10 rounded-[3rem] border border-slate-100 shadow-2xl space-y-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#dc9b3f] via-[#f0bd53] to-[#f3df8f]"></div>
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-black uppercase tracking-tight text-[#003362]">Espace Saytu</h1>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Dahira Nuxbatul Haqabatil Xadiimiyyah</p>
              </div>
              <div className="space-y-4">
                <input type="email" placeholder="Identifiant" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm" />
                <input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm" />
              </div>
              <GoldGradientBtn className="w-full py-5 rounded-2xl text-[11px]">Se Connecter</GoldGradientBtn>
            </form>
          </div>
        )}

        {view === 'selection' && (
          <div className="space-y-8 animate-in fade-in">
            <h2 className="text-2xl font-black uppercase tracking-tighter border-l-8 border-[#f0bd53] pl-4 text-[#003362]">Kourels de la Dahira</h2>
            <div className="grid gap-6">
              {kourels.map(k => (
                <div key={k.id} onClick={() => { setSelectedKourel(k); loadKourelData(k.id); setView('dashboard'); }} className="p-8 bg-white border border-slate-200 rounded-[2.5rem] flex justify-between items-center cursor-pointer hover:shadow-2xl hover:border-[#003362] transition-all group border-b-4 border-b-slate-100">
                  <div><p className="font-black text-slate-900 group-hover:text-[#003362] uppercase text-xl">{k.name}</p><p className="text-[11px] text-[#dc9b3f] font-black uppercase tracking-widest">{k.location}</p></div>
                  <div className="bg-[#003362] text-white px-8 py-4 rounded-2xl font-black text-2xl border-b-4 border-b-[#f0bd53]">{kourelStats[k.id]?.rate}%</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedKourel && (
          <div className="animate-in fade-in space-y-10">
            {view === 'dashboard' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[{ label: 'Sessions', value: stats.totalSessions, color: 'text-[#003362]' }, { label: 'Assiduité', value: `${stats.globalRate}%`, color: 'text-emerald-700' }, { label: 'Membres', value: members.length, color: 'text-[#dc9b3f]' }].map((s, i) => (
                    <div key={i} className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-lg text-center border-b-8 border-b-slate-50">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-3">{s.label}</p>
                      <p className={`text-5xl font-black ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
                {profile?.role === 'surveillant' && (
                  <GoldGradientBtn onClick={() => setView('attendance')} className="w-full p-12 rounded-[3rem] flex flex-col items-center justify-center gap-3 border-b-8 border-[#dc9b3f]">
                    <span className="text-3xl font-black uppercase tracking-tight">Ouvrir le Registre</span>
                    <span className="text-xs text-white/90 font-black uppercase tracking-widest">{format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}</span>
                  </GoldGradientBtn>
                )}
                {profile?.role === 'coordinateur' && (
                  <div className="bg-[#003362] p-12 rounded-[3.5rem] text-white flex flex-col items-center text-center space-y-6 shadow-2xl border-b-8 border-[#f0bd53]">
                    <TrendingUp size={64} className="text-[#f0bd53]" />
                    <div className="space-y-2">
                      <GoldGradientText className="text-2xl font-black uppercase tracking-tight">Supervision Master</GoldGradientText>
                      <p className="text-xs text-slate-300 font-medium uppercase tracking-[0.2em]">Archives et rapports officiels</p>
                    </div>
                    <button onClick={() => setView('history')} className="bg-white text-[#003362] px-12 py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl">Accéder aux Archives</button>
                  </div>
                )}
              </>
            )}

            {view === 'attendance' && (
              <div className="space-y-8 pb-20">
                <div className="bg-white border border-[#003362]/10 p-10 rounded-[3rem] flex flex-col items-center gap-6 shadow-2xl relative">
                  <GoldGradientText className="text-[11px] font-black uppercase tracking-[0.3em]">Session du Jour</GoldGradientText>
                  <p className="text-xl font-black text-[#003362] uppercase">{format(attendanceDate, 'EEEE d MMMM yyyy', { locale: fr })}</p>
                  <div className="flex items-center gap-12">
                    <button onClick={() => setAttendanceDate(new Date(attendanceDate.setDate(attendanceDate.getDate()-1)))} className="p-4 bg-slate-50 text-[#003362] rounded-2xl"><ChevronLeft size={28}/></button>
                    <div className="relative group p-2"><Calendar className="text-[#dc9b3f] transition-transform group-hover:scale-110" size={48}/><input type="date" value={format(attendanceDate, 'yyyy-MM-dd')} onChange={e => setAttendanceDate(parseISO(e.target.value))} className="absolute inset-0 opacity-0 cursor-pointer" /></div>
                    <button onClick={() => setAttendanceDate(new Date(attendanceDate.setDate(attendanceDate.getDate()+1)))} className="p-4 bg-slate-50 text-[#003362] rounded-2xl"><ChevronRight size={28}/></button>
                  </div>
                </div>
                <div className="space-y-4">
                  {members.map(m => (
                    <div key={m.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-8 shadow-sm">
                      <p className="font-black text-slate-800 uppercase text-sm tracking-tighter">{m.name}</p>
                      <div className="flex gap-2 w-full sm:w-auto">
                        {[{ l: 'ABSENT', v: 'Absent', c: 'bg-red-600' }, { l: 'NGANT', v: 'Excusé', c: 'bg-[#dc9b3f]' }, { l: 'PRÉSENT', v: 'Présent', c: 'bg-[#003362]' }].map((btn) => (
                          <button key={btn.v} onClick={() => setAttendance({...attendance, [m.id]: btn.v})} className={`flex-1 sm:flex-none px-6 py-4 rounded-2xl font-black text-[10px] transition-all ${attendance[m.id] === btn.v ? `${btn.c} text-white shadow-xl scale-105` : 'bg-slate-50 text-slate-300'}`}>{btn.l}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="fixed bottom-24 left-0 right-0 px-6 z-[100]"><GoldGradientBtn onClick={() => confirmAction("Validation", "Enregistrer la séance ?", saveAttendance)} disabled={saving} className="w-full max-w-sm py-6 rounded-[2.5rem] text-[12px] tracking-[0.4em] mx-auto block">VALIDER L'APPEL</GoldGradientBtn></div>
              </div>
            )}

            {view === 'history' && (
              <div className="space-y-8">
                <div className="bg-white border border-slate-200 p-8 rounded-[2rem] space-y-6 shadow-lg">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3"><ClipboardList className="text-[#003362]" size={32}/><h2 className="text-2xl font-black uppercase tracking-tight text-[#003362]">Archives</h2></div>
                    <button onClick={generateFilteredPDF} disabled={filteredHistory.length === 0} className="bg-[#003362] text-white px-6 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg">Export PDF</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs" />
                    <input type="text" placeholder="Membre..." value={histSearch} onChange={e => setHistSearch(e.target.value)} className="p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs" />
                    <select value={histStatus} onChange={e => setHistStatus(e.target.value)} className="p-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"><option value="Tous">Tous Statuts</option><option value="Présent">Présents</option><option value="Absent">Absents</option><option value="Excusé">NGANT</option></select>
                  </div>
                </div>
                <div className="space-y-6">
                  {sessionsList.filter(d => d.startsWith(selectedMonth)).map(date => (
                    <div key={date} className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm flex justify-between items-center">
                       <p className="font-black text-[#003362] uppercase text-sm">{format(parseISO(date), 'EEEE d MMMM yyyy', { locale: fr })}</p>
                       <div className="flex items-center gap-2">
                          <button onClick={() => { setAttendanceDate(parseISO(date)); setView('attendance'); }} className="p-3 bg-slate-50 text-[#003362] rounded-xl hover:bg-[#003362] hover:text-white transition-all"><Pencil size={18}/></button>
                          {profile?.role === 'coordinateur' && <button onClick={() => deleteSession(date)} className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all"><Trash2 size={18}/></button>}
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
                        <GoldGradientText className="text-[11px] font-black uppercase tracking-widest">{editingMember ? 'Modification' : 'Nouvelle Inscription'}</GoldGradientText>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <input type="text" placeholder="Nom Complet" value={newMember.name} onChange={e => setNewMember({...newMember, name: e.target.value})} className="p-5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none" />
                          <input type="tel" placeholder="Téléphone" value={newMember.phone} onChange={e => setNewMember({...newMember, phone: e.target.value})} className="p-5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none" />
                        </div>
                        <GoldGradientBtn onClick={handleAddOrUpdateMember} className="w-full py-5 rounded-xl text-[11px] tracking-[0.2em]">{editingMember ? 'Valider' : 'Inscrire'}</GoldGradientBtn>
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-3">
                      {allMembers.map(m => (
                        <div key={m.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 flex justify-between items-center shadow-sm">
                          <div><p className="font-black text-slate-800 uppercase text-sm tracking-tight">{m.name}</p><p className="text-[10px] text-[#003362] font-black">{m.phone || 'SANS CONTACT'}</p></div>
                          <div className="flex gap-2">
                             {m.phone && <a href={`tel:${m.phone}`} className="p-3 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100"><Phone size={18}/></a>}
                             {profile?.role === 'surveillant' && (
                               <div className="flex gap-2">
                                 <button onClick={() => { setEditingMember(m); setNewMember({name: m.name, phone: m.phone || ''}); window.scrollTo({top:0, behavior:'smooth'}); }} className="p-3 bg-slate-50 text-slate-600 rounded-xl border border-slate-200"><Pencil size={18}/></button>
                                 <button onClick={() => handleDeleteMember(m.id)} className="p-3 bg-red-50 text-red-600 rounded-xl border border-red-100"><Trash2 size={18}/></button>
                               </div>
                             )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {mgmtTab === 'sessions' && (
                  <div className="grid gap-3">
                    {sessionsList.map(date => (
                      <div key={date} className="bg-white p-6 rounded-[2rem] border border-slate-100 flex justify-between items-center shadow-sm">
                         <div className="space-y-1">
                           <p className="font-black text-[#003362] uppercase text-sm">{format(parseISO(date), 'dd/MM/yyyy')}</p>
                           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{format(parseISO(date), 'EEEE', { locale: fr })}</p>
                         </div>
                         <div className="flex items-center gap-2">
                           <button onClick={() => { setAttendanceDate(parseISO(date)); setView('attendance'); }} className="p-3 bg-slate-50 text-[#003362] rounded-xl hover:bg-[#003362] hover:text-white transition-all"><Pencil size={18}/></button>
                           {profile?.role === 'coordinateur' && <button onClick={() => deleteSession(date)} className="p-3 bg-red-50 text-red-600 rounded-xl"><Trash2 size={18}/></button>}
                         </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-[#003362]/95 backdrop-blur-xl border-t-4 border-[#f0bd53] h-24 flex justify-around items-center z-[120] px-4 shadow-2xl">
        {navItems.map(item => (
          <button key={item.id} onClick={() => setView(item.id)} className={`flex flex-col items-center gap-1 p-2 transition-all ${view === item.id ? 'text-[#f0bd53] scale-110' : 'text-slate-300 opacity-60'}`}>
            <item.icon size={26} strokeWidth={view === item.id ? 3 : 2} />
            <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default App;
