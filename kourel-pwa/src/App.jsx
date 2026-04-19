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

  // Système de Modale Institutionnelle
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
      if (!error) { showToast('Fichier mis à jour'); await loadKourelData(selectedKourel.id); setView('dashboard'); }
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
      "Suppression de membre", 
      "Voulez-vous retirer définitivement ce membre du registre ?", 
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
      "Supprimer la session", 
      `Êtes-vous sûr de vouloir effacer l'intégralité des pointages du ${date} ?`, 
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
    const monthLabel = format(parseISO(selectedMonth + "-01"), 'MMMM yyyy', { locale: fr });
    doc.setFontSize(22); doc.setTextColor(5, 150, 105); doc.text("SAYTU KUREL", 14, 20);
    doc.setFontSize(12); doc.setTextColor(30, 41, 59); doc.text(`Rapport de présence - ${selectedKourel.name}`, 14, 28);
    autoTable(doc, { 
      startY: 40, head: [['NOM ET PRENOM', 'STATUT', 'DATE']], 
      body: filteredHistory.map(h => [h.members?.name.toUpperCase(), h.status.toUpperCase(), h.date]),
      headStyles: { fillColor: [6, 95, 70] }
    });
    doc.save('rapport.pdf');
  };

  if (loading) return <div className="h-screen flex flex-col items-center justify-center bg-white space-y-4"><Loader2 className="animate-spin text-emerald-700" size={40} /><p className="text-[10px] font-black text-emerald-800 uppercase tracking-[0.3em]">Saytu Kurel</p></div>;

  const navItems = [
    { id: 'dashboard', label: 'Accueil', icon: Home, roles: ['surveillant', 'coordinateur'] },
    { id: 'attendance', label: 'Appel', icon: CheckCircle2, roles: ['surveillant'] },
    { id: 'history', label: 'Historique', icon: ClipboardList, roles: ['surveillant', 'coordinateur'] },
    { id: 'mgmt', label: 'Gestion', icon: Settings, roles: ['surveillant', 'coordinateur'] },
  ].filter(item => item.roles.includes(profile?.role));

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-slate-900 font-sans flex flex-col antialiased">
      
      {/* MODALE INSTITUTIONNELLE */}
      {modal.show && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
            <div className={`p-8 text-center space-y-4 ${modal.type === 'danger' ? 'bg-red-50' : 'bg-emerald-50'}`}>
              <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center ${modal.type === 'danger' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                {modal.type === 'danger' ? <AlertTriangle size={32}/> : <ShieldCheck size={32}/>}
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black uppercase tracking-tight">{modal.title}</h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">{modal.msg}</p>
              </div>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <button onClick={() => setModal({ ...modal, show: false })} className="py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-400 bg-slate-50 hover:bg-slate-100 transition-colors">Annuler</button>
              <button onClick={() => { modal.onConfirm(); setModal({ ...modal, show: false }); }} className={`py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white shadow-lg transition-all active:scale-95 ${modal.type === 'danger' ? 'bg-red-600 shadow-red-100' : 'bg-emerald-700 shadow-emerald-100'}`}>Confirmer</button>
            </div>
          </div>
        </div>
      )}

      {user && (
        <header className="sticky top-0 z-[80] bg-emerald-900 text-white shadow-lg border-b-4 border-amber-600/30">
          <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-amber-500" size={24} />
              <span className="font-bold tracking-tighter text-xl uppercase">Saytu</span>
            </div>
            <nav className="hidden md:flex gap-6">
              {navItems.map(item => (
                <button key={item.id} onClick={() => setView(item.id)} className={`flex items-center gap-2 text-xs font-black uppercase transition-colors ${view === item.id ? 'text-amber-400' : 'text-emerald-300 hover:text-white'}`}>
                  <item.icon size={16} /> {item.label}
                </button>
              ))}
            </nav>
            <button onClick={() => confirmAction("Déconnexion", "Voulez-vous quitter votre espace ?", () => supabase.auth.signOut().then(() => window.location.reload()))} className="p-1 text-emerald-300 hover:text-red-400"><LogOut size={20}/></button>
          </div>
        </header>
      )}

      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl text-white font-black text-[10px] uppercase tracking-widest z-[150] animate-in slide-in-from-top-4 ${toast.type === 'success' ? 'bg-emerald-800' : 'bg-red-700'}`}>
          {toast.msg}
        </div>
      )}

      <main className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-8 pb-32">
        
        {view === 'login' && (
          <div className="min-h-[60vh] flex items-center justify-center p-4">
            <form onSubmit={handleLogin} className="w-full max-w-sm bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl space-y-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-emerald-700"></div>
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-emerald-50 rounded-2xl mx-auto flex items-center justify-center text-emerald-700 border border-emerald-100 shadow-inner"><ShieldCheck size={32} /></div>
                <h1 className="text-2xl font-black uppercase tracking-tight pt-2">Espace de Gestion</h1>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Saytu Kurel Supervision</p>
              </div>
              <div className="space-y-4">
                <input type="email" placeholder="Identifiant" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-emerald-600 transition-all font-bold text-sm" />
                <input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-emerald-600 transition-all font-bold text-sm" />
              </div>
              <button className="w-full bg-emerald-800 text-white p-5 rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-emerald-100 hover:bg-emerald-900 active:scale-95 transition-all">Accéder au Registre</button>
            </form>
          </div>
        )}

        {view === 'selection' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <h2 className="text-2xl font-black uppercase tracking-tighter border-l-8 border-amber-500 pl-4">Registre des Kourels</h2>
            <div className="grid gap-4">
              {kourels.map(k => (
                <div key={k.id} onClick={() => { setSelectedKourel(k); loadKourelData(k.id); setView('dashboard'); }} className="p-8 bg-white border border-slate-200 rounded-[2.5rem] flex justify-between items-center cursor-pointer hover:border-emerald-600 transition-all shadow-sm group">
                  <div className="space-y-1">
                    <p className="font-black text-slate-900 group-hover:text-emerald-700 uppercase text-lg leading-tight">{k.name}</p>
                    <p className="text-[10px] text-emerald-600 font-black uppercase tracking-widest">{k.location}</p>
                  </div>
                  <div className="bg-emerald-50 text-emerald-800 px-6 py-3 rounded-2xl font-black text-xl border border-emerald-100">{kourelStats[k.id]?.rate}%</div>
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
                  {[{ label: 'Sessions', value: stats.totalSessions, color: 'text-slate-900' }, { label: 'Assiduité', value: `${stats.globalRate}%`, color: 'text-emerald-700' }, { label: 'Membres', value: members.length, color: 'text-emerald-900' }].map((s, i) => (
                    <div key={i} className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm text-center border-b-4 border-b-slate-100">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-2">{s.label}</p>
                      <p className={`text-4xl font-black ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
                {profile?.role === 'surveillant' && (
                  <button onClick={() => setView('attendance')} className="w-full bg-emerald-800 text-white p-10 rounded-[3rem] shadow-2xl flex flex-col items-center justify-center gap-2 group active:scale-[0.98] transition-all border-b-8 border-emerald-950">
                    <span className="text-2xl font-black uppercase tracking-tight">Ouvrir le Registre</span>
                    <span className="text-[10px] text-emerald-200 font-black uppercase tracking-widest opacity-80">{format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}</span>
                  </button>
                )}
                {profile?.role === 'coordinateur' && (
                  <div className="bg-gradient-to-br from-emerald-800 to-emerald-950 p-10 rounded-[3rem] text-white flex flex-col items-center text-center space-y-6 shadow-2xl border-b-8 border-emerald-950">
                    <TrendingUp size={48} className="text-amber-500" />
                    <div className="space-y-2">
                      <h3 className="text-xl font-black uppercase tracking-tight">Supervision des Données</h3>
                      <p className="text-xs text-emerald-200 font-medium uppercase tracking-widest leading-relaxed">Consultation des archives et exports officiels</p>
                    </div>
                    <button onClick={() => setView('history')} className="bg-amber-600 text-white px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-amber-900/20 active:scale-95 transition-all">Consulter l'Historique</button>
                  </div>
                )}
              </>
            )}

            {view === 'attendance' && (
              <div className="space-y-6 pb-20">
                <div className="bg-white border border-emerald-100 p-10 rounded-[3rem] flex flex-col items-center gap-6 shadow-lg relative">
                  <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-amber-50 text-amber-800 px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-amber-200">Date de séance</div>
                  <p className="text-lg font-black text-emerald-900 uppercase pt-4">{format(attendanceDate, 'EEEE d MMMM yyyy', { locale: fr })}</p>
                  <div className="flex items-center gap-12">
                    <button onClick={() => setAttendanceDate(new Date(attendanceDate.setDate(attendanceDate.getDate()-1)))} className="p-4 bg-emerald-50 text-emerald-700 rounded-2xl hover:bg-emerald-100 transition-all"><ChevronLeft size={24}/></button>
                    <div className="relative cursor-pointer group"><Calendar className="text-emerald-700 group-hover:scale-110 transition-transform" size={40}/><input type="date" value={format(attendanceDate, 'yyyy-MM-dd')} onChange={e => setAttendanceDate(parseISO(e.target.value))} className="absolute inset-0 opacity-0 cursor-pointer" /></div>
                    <button onClick={() => setAttendanceDate(new Date(attendanceDate.setDate(attendanceDate.getDate()+1)))} className="p-4 bg-emerald-50 text-emerald-700 rounded-2xl hover:bg-emerald-100 transition-all"><ChevronRight size={24}/></button>
                  </div>
                </div>
                <div className="relative group"><Search className="absolute left-6 top-5 text-slate-300 group-focus-within:text-emerald-600 transition-colors" size={20} /><input type="text" placeholder="RECHERCHER DANS LA LISTE..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-5 pl-14 bg-white border border-slate-200 rounded-[1.5rem] outline-none focus:ring-2 ring-emerald-600 font-black text-[10px] tracking-widest shadow-sm" /></div>
                <div className="space-y-3">
                  {members.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase())).map(m => (
                    <div key={m.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-6 shadow-sm hover:border-emerald-100 transition-all">
                      <p className="font-black text-slate-800 text-center sm:text-left uppercase text-sm tracking-tight">{m.name}</p>
                      <div className="flex gap-2 w-full sm:w-auto">
                        {[
                          { l: 'ABSENT', v: 'Absent', c: 'bg-red-600' },
                          { l: 'NGANT', v: 'Excusé', c: 'bg-amber-600' },
                          { l: 'PRÉSENT', v: 'Présent', c: 'bg-emerald-700' },
                        ].map((btn) => (
                          <button key={btn.v} onClick={() => setAttendance({...attendance, [m.id]: btn.v})} className={`flex-1 sm:flex-none px-5 py-4 rounded-2xl font-black text-[10px] uppercase tracking-tighter transition-all ${
                            attendance[m.id] === btn.v ? `${btn.c} text-white shadow-xl scale-105` : 'bg-slate-50 text-slate-400 border border-slate-100'
                          }`}>{btn.l}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="fixed bottom-24 left-0 right-0 px-6 md:px-0 md:static flex justify-center z-[100]"><button onClick={() => confirmAction("Validation de l'appel", "Confirmez-vous l'enregistrement de cette séance ?", saveAttendance)} disabled={saving} className="w-full max-w-sm py-6 bg-emerald-900 text-white rounded-[2rem] font-black uppercase tracking-[0.3em] text-[11px] shadow-2xl border-b-8 border-emerald-950 active:translate-y-1 active:border-b-4 transition-all">{saving ? 'VALIDATION...' : 'VALIDER LE REGISTRE'}</button></div>
              </div>
            )}

            {view === 'history' && (
              <div className="space-y-8">
                <div className="bg-white border border-slate-200 p-10 rounded-[3rem] space-y-8 shadow-lg">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3"><ClipboardList className="text-emerald-700" size={32}/><h2 className="text-2xl font-black uppercase tracking-tight">Activité du Kourel</h2></div>
                    <button onClick={generateFilteredPDF} disabled={filteredHistory.length === 0} className="bg-emerald-800 text-white px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-xl shadow-emerald-100 disabled:opacity-30">Export PDF</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400 ml-3">Période Mensuelle</label><input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-2 ring-emerald-600" /></div>
                    <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400 ml-3">Nom du Membre</label><input type="text" placeholder="Rechercher..." value={histSearch} onChange={e => setHistSearch(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-2 ring-emerald-600" /></div>
                    <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400 ml-3">État Civil</label><select value={histStatus} onChange={e => setHistStatus(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xs outline-none focus:ring-2 ring-emerald-600"><option value="Tous">Tous les statuts</option><option value="Présent">Présents</option><option value="Absent">Absents</option><option value="Excusé">NGANT</option></select></div>
                  </div>
                </div>

                <div className="space-y-10">
                  {[...new Set(filteredHistory.map(h => h.date))].sort((a,b) => new Date(b)-new Date(a)).map(date => (
                    <div key={date} className="space-y-6 animate-in slide-in-from-bottom-2">
                      <div className="flex items-center gap-6 px-4">
                         <p className="text-[11px] font-black uppercase text-emerald-900 tracking-[0.3em] whitespace-nowrap">{format(parseISO(date), 'EEEE d MMMM yyyy', { locale: fr })}</p>
                         <div className="h-0.5 flex-1 bg-gradient-to-r from-emerald-100 to-transparent"></div>
                         {profile?.role === 'coordinateur' && <button onClick={() => deleteSession(date)} className="p-2 text-red-400 hover:text-red-600 transition-colors"><Trash2 size={20}/></button>}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredHistory.filter(h => h.date === date).map(h => (
                          <div key={h.id} className="bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm flex justify-between items-center hover:border-emerald-200 transition-colors">
                            <p className="font-bold text-sm text-slate-700 uppercase tracking-tight">{h.members?.name}</p>
                            <span className={`text-[8px] font-black px-3 py-1.5 rounded-xl border ${
                              h.status === 'Présent' ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 
                              h.status === 'Absent' ? 'text-red-700 bg-red-50 border-red-100' : 
                              'text-amber-700 bg-amber-50 border-amber-100'
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
                <div className="flex bg-white p-1.5 rounded-[1.5rem] border border-slate-100 shadow-sm overflow-hidden max-w-sm">
                   <button onClick={() => setMgmtTab('members')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${mgmtTab === 'members' ? 'bg-emerald-800 text-white shadow-lg' : 'text-slate-400'}`}>Membres</button>
                   <button onClick={() => setMgmtTab('sessions')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${mgmtTab === 'sessions' ? 'bg-emerald-800 text-white shadow-lg' : 'text-slate-400'}`}>Sessions</button>
                   {profile?.role === 'coordinateur' && <button onClick={() => setMgmtTab('users')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${mgmtTab === 'users' ? 'bg-emerald-800 text-white shadow-lg' : 'text-slate-400'}`}>Admin</button>}
                </div>

                {mgmtTab === 'members' && (
                  <div className="space-y-6">
                    {profile?.role === 'surveillant' && (
                      <div className="bg-white border border-emerald-100 p-10 rounded-[3rem] space-y-6 shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-[4rem]"></div>
                        <div className="flex justify-between items-center"><p className="text-[11px] font-black uppercase tracking-widest text-emerald-800 underline decoration-amber-500 underline-offset-8">{editingMember ? 'Modification du Registre' : 'Nouvelle Inscription'}</p>{editingMember && <button onClick={() => { setEditingMember(null); setNewMember({name:'', phone:''}); }} className="p-2 bg-slate-100 rounded-full"><X size={16}/></button>}</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <input type="text" placeholder="Prénom & Nom du membre" value={newMember.name} onChange={e => setNewMember({...newMember, name: e.target.value})} className="p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm" />
                          <input type="tel" placeholder="Numéro de téléphone" value={newMember.phone} onChange={e => setNewMember({...newMember, phone: e.target.value})} className="p-5 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm" />
                        </div>
                        <button onClick={handleAddOrUpdateMember} disabled={saving} className="w-full bg-emerald-800 text-white p-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl">
                          {editingMember ? <Save size={18}/> : <Plus size={18}/>} {editingMember ? 'Valider les Changements' : 'Inscrire au Kourel'}
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-3">
                      {allMembers.map(m => (
                        <div key={m.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 flex justify-between items-center shadow-sm hover:border-emerald-100 transition-all">
                          <div className="space-y-1"><p className="font-black text-slate-800 uppercase text-sm tracking-tight">{m.name}</p><p className="text-[10px] text-emerald-600 font-bold tracking-widest">{m.phone || 'AUCUN CONTACT'}</p></div>
                          <div className="flex gap-2">
                             {m.phone && <a href={`tel:${m.phone}`} className="p-3 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-100"><Phone size={18}/></a>}
                             {profile?.role === 'surveillant' && (
                               <div className="flex gap-2">
                                 <button onClick={() => { setEditingMember(m); setNewMember({name: m.name, phone: m.phone || ''}); window.scrollTo({top:0, behavior:'smooth'}); }} className="p-3 bg-slate-50 text-slate-600 rounded-2xl border border-slate-200"><Pencil size={18}/></button>
                                 <button onClick={() => confirmAction("Statut Membre", `Voulez-vous changer le statut de ${m.name} ?`, async () => { await supabase.from('members').update({active: !m.active}).eq('id', m.id); loadKourelData(selectedKourel.id); })} className={`p-3 rounded-2xl border ${m.active ? 'text-amber-700 bg-amber-50 border-amber-100' : 'text-emerald-700 bg-emerald-50 border-emerald-100'}`}><Users size={18}/></button>
                                 <button onClick={() => handleDeleteMember(m.id)} className="p-3 bg-red-50 text-red-600 rounded-2xl border border-red-100"><Trash2 size={18}/></button>
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

      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-emerald-900/95 backdrop-blur-xl border-t-4 border-amber-600 h-20 flex justify-around items-center z-[120] px-2 shadow-2xl">
        {navItems.map(item => (
          <button key={item.id} onClick={() => setView(item.id)} className={`flex flex-col items-center gap-1 p-2 min-w-[75px] transition-all ${view === item.id ? 'text-amber-400 scale-110' : 'text-emerald-300 opacity-60'}`}>
            <item.icon size={24} strokeWidth={view === item.id ? 3 : 2} />
            <span className="text-[9px] font-black uppercase tracking-widest">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default App;
