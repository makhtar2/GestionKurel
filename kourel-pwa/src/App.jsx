import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { 
  Home, CheckCircle2, ClipboardList, Settings, LogOut, 
  Plus, Save, Loader2, ChevronLeft, ChevronRight, Search, 
  Phone, FileDown, Trash2, Users, Calendar, ShieldCheck, Pencil, X, TrendingUp
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

  useEffect(() => { checkUser(); }, []);
  useEffect(() => {
    if (selectedKourel && view === 'attendance') loadExistingAttendance();
  }, [attendanceDate, selectedKourel, view]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
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
      showToast('Session chargée');
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
      if (!error) { showToast('Appel validé !'); await loadKourelData(selectedKourel.id); setView('dashboard'); }
    } catch (e) { showToast('Erreur', 'error'); }
    setSaving(false);
  };

  const handleUpdateProfile = async (pId, newRole, newKourelId) => {
    await supabase.from('profiles').update({ role: newRole, kourel_id: newKourelId }).eq('id', pId);
    await fetchGlobalStats();
    showToast('Profil mis à jour');
  };

  const handleAddOrUpdateMember = async () => {
    if (!newMember.name.trim()) return;
    setSaving(true);
    const payload = { name: newMember.name, phone: newMember.phone };
    if (editingMember) await supabase.from('members').update(payload).eq('id', editingMember.id);
    else await supabase.from('members').insert([{ ...payload, kourel_id: selectedKourel.id }]);
    await loadKourelData(selectedKourel.id);
    setNewMember({ name: '', phone: '' }); setEditingMember(null);
    showToast('Effectué');
    setSaving(false);
  };

  const handleDeleteMember = async (id) => {
    if (window.confirm('Supprimer ?')) {
      await supabase.from('members').delete().eq('id', id);
      await loadKourelData(selectedKourel.id);
      showToast('Supprimé');
    }
  };

  const deleteSession = async (date) => {
    if (window.confirm('Supprimer session ?')) {
      await supabase.from('attendance').delete().eq('date', date).in('member_id', allMembers.map(m => m.id));
      await loadKourelData(selectedKourel.id);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) await fetchProfile(data.user.id);
    else { showToast('Accès refusé', 'error'); setLoading(false); }
  };

  const generateMonthlyPDF = () => {
    const doc = new jsPDF();
    const start = startOfMonth(parseISO(selectedMonth + "-01"));
    const end = endOfMonth(start);
    const monthlyData = history.filter(h => isWithinInterval(parseISO(h.date), { start, end }));
    doc.text(`Rapport ${selectedKourel.name} - ${format(start, 'MMMM yyyy', { locale: fr })}`, 14, 20);
    autoTable(doc, { startY: 30, head: [['Nom', 'Statut', 'Date']], body: monthlyData.map(h => [h.members?.name, h.status, h.date]), headStyles: { fillColor: [30, 41, 59] } });
    doc.save('rapport.pdf');
  };

  if (loading) return <div className="h-screen flex flex-col items-center justify-center bg-white space-y-4"><Loader2 className="animate-spin text-indigo-600" size={40} /><p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Saytu...</p></div>;

  const navItems = [
    { id: 'dashboard', label: 'Accueil', icon: Home, roles: ['surveillant', 'coordinateur'] },
    { id: 'attendance', label: 'Appel', icon: CheckCircle2, roles: ['surveillant'] },
    { id: 'history', label: 'Historique', icon: ClipboardList, roles: ['surveillant', 'coordinateur'] },
    { id: 'mgmt', label: 'Gestion', icon: Settings, roles: ['surveillant', 'coordinateur'] },
  ].filter(item => item.roles.includes(profile?.role));

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col antialiased">
      
      {/* HEADER FIXE */}
      {user && (
        <header className="sticky top-0 z-[80] bg-slate-900 text-white shadow-md">
          <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-indigo-400" size={24} />
              <span className="font-bold tracking-tight uppercase">Saytu</span>
            </div>
            <nav className="hidden md:flex gap-6">
              {navItems.map(item => (
                <button key={item.id} onClick={() => setView(item.id)} className={`flex items-center gap-2 text-xs font-bold uppercase transition-colors ${view === item.id ? 'text-indigo-400' : 'text-slate-400 hover:text-white'}`}>
                  <item.icon size={16} /> {item.label}
                </button>
              ))}
            </nav>
            <button onClick={() => supabase.auth.signOut().then(() => window.location.reload())} className="p-1 text-slate-400 hover:text-red-400"><LogOut size={20}/></button>
          </div>
        </header>
      )}

      {/* TOAST */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-2xl text-white font-bold z-[100] animate-in slide-in-from-top-4 ${toast.type === 'success' ? 'bg-slate-900' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      <main className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-8 pb-32">
        
        {view === 'login' && (
          <div className="min-h-[60vh] flex items-center justify-center">
            <form onSubmit={handleLogin} className="w-full max-w-sm bg-white p-10 rounded-[2rem] border border-slate-100 shadow-sm space-y-6">
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-black uppercase tracking-widest">Connexion</h1>
                <p className="text-slate-400 text-xs font-bold uppercase">Saytu Coordination</p>
              </div>
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-indigo-500 font-medium" />
              <input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-indigo-500 font-medium" />
              <button className="w-full bg-slate-900 text-white p-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg active:scale-95 transition-all">Entrer</button>
            </form>
          </div>
        )}

        {view === 'selection' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <h2 className="text-xl font-black uppercase tracking-widest border-l-4 border-indigo-600 pl-4">Liste des Kourels</h2>
            <div className="grid gap-4">
              {kourels.map(k => (
                <div key={k.id} onClick={() => { setSelectedKourel(k); loadKourelData(k.id); setView('dashboard'); }} className="p-6 bg-white border border-slate-200 rounded-[2rem] flex justify-between items-center cursor-pointer hover:border-indigo-500 transition-all shadow-sm group">
                  <div>
                    <p className="font-black text-slate-900 group-hover:text-indigo-600 uppercase">{k.name}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">{k.location}</p>
                  </div>
                  <div className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-2xl font-black text-lg">{kourelStats[k.id]?.rate}%</div>
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
                  {[{ label: 'Sessions', value: stats.totalSessions, color: 'text-slate-900' }, { label: 'Assiduité', value: `${stats.globalRate}%`, color: 'text-emerald-600' }, { label: 'Membres', value: members.length, color: 'text-indigo-600' }].map((s, i) => (
                    <div key={i} className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm text-center">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-1">{s.label}</p>
                      <p className={`text-4xl font-black ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
                {profile?.role === 'surveillant' && (
                  <button onClick={() => setView('attendance')} className="w-full bg-slate-900 text-white p-10 rounded-[2.5rem] shadow-xl flex flex-col items-center justify-center gap-2 group active:scale-[0.98] transition-all">
                    <span className="text-2xl font-black uppercase tracking-tighter">Faire l'appel</span>
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-widest opacity-80">{format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}</span>
                  </button>
                )}
                {profile?.role === 'coordinateur' && (
                  <div className="bg-indigo-600 p-10 rounded-[2.5rem] text-white flex flex-col items-center text-center space-y-4 shadow-xl">
                    <TrendingUp size={40} className="text-indigo-200" />
                    <h3 className="text-xl font-black uppercase tracking-tight">Supervision Master</h3>
                    <button onClick={() => setView('history')} className="bg-white text-indigo-600 px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest">Voir l'historique</button>
                  </div>
                )}
              </>
            )}

            {view === 'attendance' && (
              <div className="space-y-6 pb-20">
                <div className="bg-white border border-slate-200 p-8 rounded-[2rem] flex flex-col items-center gap-4 shadow-sm">
                  <p className="text-xs font-black text-indigo-600 uppercase tracking-[0.3em]">{format(attendanceDate, 'EEEE d MMMM yyyy', { locale: fr })}</p>
                  <div className="flex items-center gap-8">
                    <button onClick={() => setAttendanceDate(new Date(attendanceDate.setDate(attendanceDate.getDate()-1)))} className="p-3 bg-slate-50 rounded-2xl"><ChevronLeft size={24}/></button>
                    <div className="relative"><Calendar className="text-slate-300" size={32}/><input type="date" value={format(attendanceDate, 'yyyy-MM-dd')} onChange={e => setAttendanceDate(parseISO(e.target.value))} className="absolute inset-0 opacity-0 cursor-pointer" /></div>
                    <button onClick={() => setAttendanceDate(new Date(attendanceDate.setDate(attendanceDate.getDate()+1)))} className="p-3 bg-slate-50 rounded-2xl"><ChevronRight size={24}/></button>
                  </div>
                </div>
                <div className="relative"><Search className="absolute left-4 top-4 text-slate-300" size={20} /><input type="text" placeholder="Rechercher..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-4 pl-12 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-indigo-500 font-medium shadow-sm" /></div>
                <div className="space-y-3">
                  {members.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase())).map(m => (
                    <div key={m.id} className="bg-white p-5 rounded-[1.5rem] border border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm">
                      <p className="font-bold text-slate-800 text-center sm:text-left uppercase text-sm">{m.name}</p>
                      <div className="flex gap-1.5 w-full sm:w-auto">
                        {['Absent', 'Excusé', 'Présent'].map((v) => (
                          <button key={v} onClick={() => setAttendance({...attendance, [m.id]: v})} className={`flex-1 sm:flex-none px-4 py-3 rounded-xl font-black text-[9px] uppercase transition-all ${
                            attendance[m.id] === v ? (v === 'Absent' ? 'bg-red-600 text-white' : v === 'Excusé' ? 'bg-amber-600 text-white' : 'bg-indigo-600 text-white') : 'bg-slate-50 text-slate-300'
                          }`}>{v === 'Excusé' ? 'NGANT' : v}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="fixed bottom-24 left-0 right-0 px-4 md:px-0 md:static flex justify-center z-[70]"><button onClick={saveAttendance} disabled={saving} className="w-full max-w-sm py-5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl">{saving ? 'VALIDATION...' : 'VALIDER L\'APPEL'}</button></div>
              </div>
            )}

            {view === 'history' && (
              <div className="space-y-6">
                <div className="bg-white border border-slate-200 p-8 rounded-[2rem] space-y-6 shadow-sm">
                  <div className="flex justify-between items-center"><h2 className="text-xl font-black uppercase tracking-tight">Filtres</h2><button onClick={generateMonthlyPDF} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest"><FileDown size={14}/></button></div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none" />
                    <input type="text" placeholder="Membre..." value={histSearch} onChange={e => setHistSearch(e.target.value)} className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none" />
                    <select value={histStatus} onChange={e => setHistStatus(e.target.value)} className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none">
                      <option value="Tous">Tous les statuts</option><option value="Présent">Présents</option><option value="Absent">Absents</option><option value="Excusé">NGANT</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-4">
                  {[...new Set(history.map(h => h.date))].filter(date => date.startsWith(selectedMonth)).sort((a,b) => new Date(b)-new Date(a)).map(date => {
                    const filtered = history.filter(h => h.date === date && (histSearch === '' || h.members?.name.toLowerCase().includes(histSearch.toLowerCase())) && (histStatus === 'Tous' || h.status === histStatus));
                    if (filtered.length === 0) return null;
                    return (
                      <div key={date} className="bg-white border border-slate-100 p-8 rounded-[2rem] shadow-sm space-y-4">
                        <div className="flex justify-between items-center border-b pb-3"><p className="font-black text-xs uppercase text-slate-400 tracking-widest">{format(parseISO(date), 'EEEE d MMMM yyyy', { locale: fr })}</p>{profile?.role === 'coordinateur' && <button onClick={() => deleteSession(date)} className="text-red-300 hover:text-red-600"><Trash2 size={16}/></button>}</div>
                        <div className="flex flex-wrap gap-2">{filtered.map(h => (<div key={h.id} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase border ${h.status === 'Présent' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : h.status === 'Absent' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>{h.members?.name} : {h.status === 'Excusé' ? 'NGANT' : h.status}</div>))}</div>
                      </div>
                    );
                  })}
                  {history.length === 0 && <div className="text-center py-10 opacity-40 font-bold uppercase text-xs">Aucune donnée</div>}
                </div>
              </div>
            )}

            {view === 'mgmt' && (
              <div className="space-y-6">
                <div className="flex bg-white p-1 rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                   <button onClick={() => setMgmtTab('members')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${mgmtTab === 'members' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>Membres</button>
                   <button onClick={() => setMgmtTab('sessions')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${mgmtTab === 'sessions' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>Sessions</button>
                   {profile?.role === 'coordinateur' && <button onClick={() => setMgmtTab('users')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${mgmtTab === 'users' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>Admin</button>}
                </div>

                {mgmtTab === 'members' && (
                  <div className="space-y-4">
                    {profile?.role === 'surveillant' && (
                      <div className="bg-white border border-slate-100 p-8 rounded-[2rem] space-y-4 shadow-sm">
                        <div className="flex justify-between items-center"><p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">{editingMember ? 'Modifier Membre' : 'Nouveau Membre'}</p>{editingMember && <button onClick={() => { setEditingMember(null); setNewMember({name:'', phone:''}); }} className="text-slate-400"><X size={16}/></button>}</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <input type="text" placeholder="Prénom & Nom" value={newMember.name} onChange={e => setNewMember({...newMember, name: e.target.value})} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none" />
                          <input type="tel" placeholder="Téléphone" value={newMember.phone} onChange={e => setNewMember({...newMember, phone: e.target.value})} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none" />
                        </div>
                        <button onClick={handleAddOrUpdateMember} disabled={saving} className="w-full bg-indigo-600 text-white p-5 rounded-2xl font-black uppercase text-[10px] flex items-center justify-center gap-2 tracking-widest">{editingMember ? 'Sauvegarder' : 'Ajouter'}</button>
                      </div>
                    )}
                    <div className="grid gap-3">
                      {allMembers.map(m => (
                        <div key={m.id} className="bg-white p-6 border border-slate-100 rounded-2xl flex justify-between items-center shadow-sm">
                          <div><p className="font-bold text-sm text-slate-800 uppercase">{m.name}</p><p className="text-[10px] text-slate-400 font-bold">{m.phone || 'Pas de numéro'}</p></div>
                          <div className="flex gap-2">
                             {m.phone && <a href={`tel:${m.phone}`} className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl"><Phone size={16}/></a>}
                             {profile?.role === 'surveillant' && (
                               <div className="flex gap-2"><button onClick={() => { setEditingMember(m); setNewMember({name: m.name, phone: m.phone || ''}); window.scrollTo({top:0, behavior:'smooth'}); }} className="p-2.5 bg-slate-50 text-slate-600 rounded-xl border border-slate-100"><Pencil size={16}/></button><button onClick={async () => { if(window.confirm('Changer le statut ?')) { await supabase.from('members').update({active: !m.active}).eq('id', m.id); loadKourelData(selectedKourel.id); }}} className={`p-2.5 rounded-xl border ${m.active ? 'text-amber-600 border-amber-100' : 'text-emerald-600 border-emerald-100'}`}><Users size={16}/></button><button onClick={() => handleDeleteMember(m.id)} className="p-2.5 bg-red-50 text-red-600 rounded-xl border border-red-100"><Trash2 size={16}/></button></div>
                             )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {mgmtTab === 'sessions' && (
                  <div className="grid gap-2">
                    {[...new Set(history.map(h => h.date))].map(date => (
                      <div key={date} className="p-5 bg-white border border-slate-100 rounded-2xl flex justify-between items-center shadow-sm font-bold text-xs">{date}<button onClick={() => deleteSession(date)} className="text-red-500 p-2"><Trash2 size={18}/></button></div>
                    ))}
                  </div>
                )}
                {mgmtTab === 'users' && profile?.role === 'coordinateur' && (
                   <div className="grid gap-3">
                    {allProfiles.map(p => (
                      <div key={p.id} className="p-6 bg-white border border-slate-100 rounded-[2rem] space-y-4 shadow-sm">
                        <p className="font-black text-xs truncate">{p.email}</p>
                        <div className="grid grid-cols-1 gap-2">
                          <select value={p.role} onChange={(e) => handleUpdateProfile(p.id, e.target.value, p.kourel_id)} className="text-[10px] border border-slate-200 p-4 rounded-2xl font-bold bg-slate-50 outline-none"><option value="surveillant">SURVEILLANT</option><option value="coordinateur">COORDINATEUR</option></select>
                          <select value={p.kourel_id || ""} onChange={(e) => handleUpdateProfile(p.id, p.role, e.target.value || null)} className="text-[10px] border border-slate-200 p-4 rounded-2xl font-bold bg-slate-50 outline-none truncate"><option value="">SANS KUREL</option>{kourels.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
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

      {user && view !== 'selection' && (
        <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-xl border-t border-slate-100 h-20 flex justify-around items-center z-[80] px-2 shadow-2xl">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setView(item.id)} className={`flex flex-col items-center gap-1 p-2 min-w-[70px] transition-all ${view === item.id ? 'text-indigo-600' : 'text-slate-300'}`}><item.icon size={22} strokeWidth={2.5} /><span className="text-[9px] font-black uppercase tracking-tighter">{item.label}</span></button>
          ))}
        </nav>
      )}
    </div>
  );
}

export default App;
