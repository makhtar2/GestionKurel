import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { 
  Home, CheckCircle2, ClipboardList, Settings, LogOut, 
  Plus, Save, Loader2, ChevronLeft, ChevronRight, Search, 
  Phone, FileDown, Trash2, Users, Calendar, ShieldCheck, UserPlus, TrendingUp, Filter
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
  
  const [histSearch, setHistSearch] = useState('');
  const [histStatus, setHistStatus] = useState('Tous');

  useEffect(() => { checkUser(); }, []);

  useEffect(() => {
    if (selectedKourel && view === 'attendance') {
      loadExistingAttendance();
    }
  }, [attendanceDate, selectedKourel, view]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) { setUser(session.user); fetchProfile(session.user.id); } 
    else { setView('login'); setLoading(false); }
  };

  const fetchProfile = async (uid) => {
    const { data, error } = await supabase.from('profiles').select('*, kourels(*)').eq('id', uid).single();
    if (!error) {
      setProfile(data);
      if (data.role === 'surveillant' && data.kourels) {
        setSelectedKourel(data.kourels);
        loadKourelData(data.kourels.id);
        setView('dashboard');
      } else {
        fetchGlobalStats();
        setView('selection');
      }
    }
    setLoading(false);
  };

  const fetchGlobalStats = async () => {
    const { data: kList } = await supabase.from('kourels').select('*').order('name');
    setKourels(kList || []);
    const { data: pList } = await supabase.from('profiles').select('*');
    setAllProfiles(pList || []);
    const { data: allAtt } = await supabase.from('attendance').select('status, date, members(kourel_id)');
    const sMap = {};
    (kList || []).forEach(k => {
      const kAtt = allAtt?.filter(a => a.members?.kourel_id === k.id) || [];
      const pres = kAtt.filter(a => ['Présent'].includes(a.status)).length;
      sMap[k.id] = { 
        rate: kAtt.length > 0 ? Math.round((pres / kAtt.length) * 100) : 0,
        sessions: [...new Set(kAtt.map(a => a.date))].length,
      };
    });
    setKourelsStats(sMap);
  };

  const loadKourelData = async (kid) => {
    const { data: mData } = await supabase.from('members').select('*').eq('kourel_id', kid).eq('active', true).order('name');
    const { data: amData } = await supabase.from('members').select('*').eq('kourel_id', kid).order('name');
    setMembers(mData || []);
    setAllMembers(amData || []);
    const { data: aData } = await supabase.from('attendance').select('*, members!inner(*)').eq('members.kourel_id', kid);
    if (aData) {
      const dates = [...new Set(aData.map(d => d.date))];
      const pres = aData.filter(d => ['Présent'].includes(d.status)).length;
      setStats({ totalSessions: dates.length, globalRate: aData.length > 0 ? Math.round((pres / aData.length) * 100) : 0 });
      setHistory(aData.sort((a,b) => new Date(b.date) - new Date(a.date)));
    }
  };

  const loadExistingAttendance = async () => {
    const dateStr = format(attendanceDate, 'yyyy-MM-dd');
    const { data } = await supabase.from('attendance').select('member_id, status').eq('date', dateStr).in('member_id', members.map(m => m.id));
    
    const newAtt = {};
    members.forEach(m => newAtt[m.id] = 'Présent');
    if (data && data.length > 0) {
      data.forEach(row => newAtt[row.member_id] = row.status);
      showToast('Session existante chargée', 'success');
    }
    setAttendance(newAtt);
  };

  const saveAttendance = async () => {
    if (profile?.role !== 'surveillant') return;
    setSaving(true);
    const dateStr = format(attendanceDate, 'yyyy-MM-dd');
    const mIds = members.map(m => m.id);
    await supabase.from('attendance').delete().eq('date', dateStr).in('member_id', mIds);
    const records = Object.entries(attendance).map(([mId, status]) => ({ member_id: mId, status, date: dateStr }));
    const { error } = await supabase.from('attendance').insert(records);
    if (!error) { showToast('Appel validé !'); await loadKourelData(selectedKourel.id); setView('dashboard'); }
    else { showToast('Erreur', 'error'); }
    setSaving(false);
  };

  const handleUpdateProfile = async (pId, newRole, newKourelId) => {
    setSaving(true);
    await supabase.from('profiles').update({ role: newRole, kourel_id: newKourelId }).eq('id', pId);
    await fetchGlobalStats();
    showToast('Profil mis à jour');
    setSaving(false);
  };

  const deleteSession = async (date) => {
    if (!window.confirm('Supprimer cette session ?')) return;
    const mIds = allMembers.map(m => m.id);
    await supabase.from('attendance').delete().eq('date', date).in('member_id', mIds);
    loadKourelData(selectedKourel.id);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) await fetchProfile(data.user.id);
    else { showToast('Erreur connexion', 'error'); setLoading(false); }
  };

  const handleLogout = () => { supabase.auth.signOut().then(() => window.location.reload()); };

  const generateMonthlyPDF = () => {
    const doc = new jsPDF();
    const start = startOfMonth(parseISO(selectedMonth + "-01"));
    const end = endOfMonth(start);
    const monthlyData = history.filter(h => isWithinInterval(parseISO(h.date), { start, end }));
    doc.text(`Rapport Mensuel : ${format(start, 'MMMM yyyy', { locale: fr })}`, 14, 20);
    autoTable(doc, { startY: 30, head: [['Nom', 'Statut', 'Date']], body: monthlyData.map(h => [h.members?.name, h.status, h.date]), headStyles: { fillColor: [30, 41, 59] } });
    doc.save(`Rapport_${selectedKourel.name}_${selectedMonth}.pdf`);
  };

  const navItems = [
    { id: 'dashboard', label: 'Accueil', icon: Home, roles: ['surveillant', 'coordinateur'] },
    { id: 'attendance', label: 'Appel', icon: CheckCircle2, roles: ['surveillant'] },
    { id: 'history', label: 'Historique', icon: ClipboardList, roles: ['surveillant', 'coordinateur'] },
    { id: 'mgmt', label: 'Gestion', icon: Settings, roles: ['surveillant', 'coordinateur'] },
  ].filter(item => item.roles.includes(profile?.role));

  if (loading) return <div className="h-screen flex items-center justify-center bg-white font-bold text-indigo-600">Saytu Kurel...</div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      <header className="sticky top-0 z-50 bg-slate-900 text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-indigo-400" size={24} />
            <span className="font-bold tracking-tight uppercase">Saytu</span>
          </div>
          <nav className="hidden md:flex gap-6">
            {navItems.map(item => (
              <button key={item.id} onClick={() => setView(item.id)} className={`flex items-center gap-2 text-xs font-bold uppercase ${view === item.id ? 'text-indigo-400' : 'text-slate-400'}`}>
                <item.icon size={16} /> {item.label}
              </button>
            ))}
          </nav>
          <button onClick={handleLogout} className="p-1 hover:text-red-400"><LogOut size={20}/></button>
        </div>
      </header>

      {toast && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-2xl text-white font-bold z-[100] ${toast.type === 'success' ? 'bg-slate-900' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      <main className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-8 pb-32">
        {view === 'login' && (
          <div className="min-h-[60vh] flex items-center justify-center">
            <form onSubmit={handleLogin} className="w-full max-w-sm bg-white p-10 rounded-3xl border border-slate-100 shadow-sm space-y-6">
              <h1 className="text-2xl font-black text-center uppercase tracking-widest">Connexion</h1>
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-indigo-500 transition-all" />
              <input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-indigo-500 transition-all" />
              <button className="w-full bg-slate-900 text-white p-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg">Entrer</button>
            </form>
          </div>
        )}

        {view === 'selection' && (
          <div className="space-y-6">
            <h2 className="text-xl font-black uppercase tracking-widest border-l-4 border-indigo-600 pl-4">Liste des Kourels</h2>
            <div className="grid gap-4">
              {kourels.map(k => (
                <div key={k.id} onClick={() => { setSelectedKourel(k); loadKourelData(k.id); setView('dashboard'); }} className="p-6 bg-white border border-slate-200 rounded-3xl flex justify-between items-center cursor-pointer hover:border-indigo-500 transition-all shadow-sm group">
                  <div>
                    <p className="font-black text-slate-900 group-hover:text-indigo-600 transition-colors uppercase">{k.name}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{k.location}</p>
                  </div>
                  <div className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-2xl font-black text-lg">{kourelStats[k.id]?.rate}%</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedKourel && (
          <div className="animate-in fade-in duration-500">
            {view === 'dashboard' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[{ label: 'Sessions', value: stats.totalSessions, color: 'text-slate-900' }, { label: 'Assiduité', value: `${stats.globalRate}%`, color: 'text-emerald-600' }, { label: 'Membres', value: members.length, color: 'text-indigo-600' }].map((s, i) => (
                    <div key={i} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm text-center">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-1">{s.label}</p>
                      <p className={`text-4xl font-black ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
                {profile?.role === 'surveillant' && (
                  <button onClick={() => setView('attendance')} className="w-full bg-slate-900 text-white p-8 rounded-[2rem] shadow-xl flex flex-col items-center justify-center gap-2">
                    <span className="text-2xl font-black uppercase tracking-tighter">Faire l'appel</span>
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-widest opacity-80">{format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}</span>
                  </button>
                )}
                {profile?.role === 'coordinateur' && (
                  <div className="bg-indigo-600 p-8 rounded-[2.5rem] text-white flex flex-col items-center text-center space-y-4 shadow-xl">
                    <TrendingUp size={40} className="text-indigo-200" />
                    <h3 className="text-xl font-black uppercase tracking-tight">Supervision Master</h3>
                    <button onClick={() => setView('history')} className="bg-white text-indigo-600 px-8 py-3 rounded-2xl font-black text-[10px] uppercase">Voir l'historique</button>
                  </div>
                )}
              </div>
            )}

            {view === 'attendance' && profile?.role === 'surveillant' && (
              <div className="space-y-6">
                <div className="bg-white border border-slate-200 p-6 rounded-3xl flex flex-col items-center gap-4">
                  <p className="text-xs font-black text-indigo-600 uppercase tracking-[0.3em] text-center">{format(attendanceDate, 'EEEE d MMMM yyyy', { locale: fr })}</p>
                  <div className="flex items-center gap-10">
                    <button onClick={() => setAttendanceDate(new Date(attendanceDate.setDate(attendanceDate.getDate()-1)))} className="p-3 bg-slate-50 rounded-2xl"><ChevronLeft size={24}/></button>
                    <div className="relative"><Calendar className="text-slate-300" size={32}/><input type="date" value={format(attendanceDate, 'yyyy-MM-dd')} onChange={e => setAttendanceDate(parseISO(e.target.value))} className="absolute inset-0 opacity-0 cursor-pointer" /></div>
                    <button onClick={() => setAttendanceDate(new Date(attendanceDate.setDate(attendanceDate.getDate()+1)))} className="p-3 bg-slate-50 rounded-2xl"><ChevronRight size={24}/></button>
                  </div>
                </div>
                <div className="relative"><Search className="absolute left-4 top-4 text-slate-300" size={20} /><input type="text" placeholder="Rechercher..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-4 pl-12 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 ring-indigo-500" /></div>
                <div className="space-y-3">
                  {members.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase())).map(m => (
                    <div key={m.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4 transition-all">
                      <p className="font-bold text-slate-800">{m.name}</p>
                      <div className="flex gap-1 w-full sm:w-auto">
                        {['Absent', 'Excusé', 'Présent'].map((v) => (
                          <button key={v} onClick={() => setAttendance({...attendance, [m.id]: v})} className={`flex-1 sm:flex-none px-4 py-3 rounded-xl font-black text-[9px] uppercase transition-all ${attendance[m.id] === v ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-300'}`}>{v === 'Excusé' ? 'NGANT' : v}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={saveAttendance} disabled={saving} className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-xs bg-slate-900 text-white p-5 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] z-40">{saving ? 'VALIDATION...' : 'VALIDER L\'APPEL'}</button>
              </div>
            )}

            {view === 'history' && (
              <div className="space-y-6">
                <div className="bg-white border border-slate-200 p-6 rounded-3xl space-y-4 shadow-sm">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-black uppercase tracking-tight">Filtres</h2>
                    <button onClick={generateMonthlyPDF} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase"><FileDown size={14}/> Export</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs" />
                    <input type="text" placeholder="Membre..." value={histSearch} onChange={e => setHistSearch(e.target.value)} className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs" />
                    <select value={histStatus} onChange={e => setHistStatus(e.target.value)} className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs">
                      <option value="Tous">Tous les statuts</option>
                      <option value="Présent">Présents</option>
                      <option value="Absent">Absents</option>
                      <option value="Excusé">NGANT</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-4">
                  {[...new Set(history.map(h => h.date))].filter(date => date.startsWith(selectedMonth)).sort((a,b) => new Date(b)-new Date(a)).map(date => {
                    const filteredInDay = history.filter(h => h.date === date && (histSearch === '' || h.members?.name.toLowerCase().includes(histSearch.toLowerCase())) && (histStatus === 'Tous' || h.status === histStatus));
                    if (filteredInDay.length === 0) return null;
                    return (
                      <div key={date} className="bg-white border border-slate-100 p-6 rounded-3xl space-y-4">
                        <div className="flex justify-between items-center border-b pb-3"><p className="font-black text-xs uppercase text-slate-400">{format(parseISO(date), 'EEEE d MMMM yyyy', { locale: fr })}</p>{profile?.role === 'coordinateur' && <button onClick={() => deleteSession(date)} className="text-red-300 hover:text-red-600"><Trash2 size={16}/></button>}</div>
                        <div className="flex flex-wrap gap-2">{filteredInDay.map(h => (<div key={h.id} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase border ${h.status === 'Présent' ? 'bg-emerald-50 text-emerald-700' : h.status === 'Absent' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{h.members?.name} : {h.status === 'Excusé' ? 'NGANT' : h.status}</div>))}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {view === 'mgmt' && (
              <div className="space-y-6">
                <div className="flex bg-white p-1 rounded-2xl border border-slate-100 shadow-sm">
                   <button onClick={() => setMgmtTab('members')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${mgmtTab === 'members' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400'}`}>Membres</button>
                   <button onClick={() => setMgmtTab('sessions')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${mgmtTab === 'sessions' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400'}`}>Sessions</button>
                   {profile?.role === 'coordinateur' && <button onClick={() => setMgmtTab('users')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${mgmtTab === 'users' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400'}`}>Admin</button>}
                </div>
                {mgmtTab === 'members' && (
                  <div className="grid gap-3">
                    {profile?.role === 'surveillant' && <button onClick={() => { const n = window.prompt("Nom ?"); if(n) supabase.from('members').insert([{name:n, kourel_id:selectedKourel.id}]).then(()=>loadKourelData(selectedKourel.id)); }} className="p-8 border-2 border-dashed border-slate-200 rounded-3xl font-black text-slate-400 uppercase text-[10px] flex items-center justify-center gap-3"><UserPlus size={20} /> Ajouter Membre</button>}
                    {allMembers.map(m => (
                      <div key={m.id} className="bg-white p-5 border border-slate-100 rounded-2xl flex justify-between items-center shadow-sm">
                        <p className="font-bold text-sm text-slate-800">{m.name}</p>
                        {profile?.role === 'surveillant' && <button onClick={async () => { await supabase.from('members').update({active: !m.active}).eq('id', m.id); loadKourelData(selectedKourel.id); }} className={`p-2.5 rounded-xl border ${m.active ? 'text-amber-600 border-amber-100' : 'text-emerald-600 border-emerald-100'}`}><Users size={16}/></button>}
                      </div>
                    ))}
                  </div>
                )}
                {mgmtTab === 'sessions' && (
                  <div className="grid gap-2">
                    {[...new Set(history.map(h => h.date))].map(date => (
                      <div key={date} className="p-4 bg-white border border-slate-100 rounded-xl flex justify-between items-center"><span className="font-bold text-xs">{date}</span><button onClick={() => deleteSession(date)} className="text-red-500"><Trash2 size={18}/></button></div>
                    ))}
                  </div>
                )}
                {mgmtTab === 'users' && profile?.role === 'coordinateur' && (
                   <div className="grid gap-3">
                    {allProfiles.map(p => (
                      <div key={p.id} className="p-4 bg-white border border-slate-100 rounded-2xl space-y-4 shadow-sm">
                        <p className="font-black text-xs truncate max-w-[250px]">{p.email}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <select value={p.role} onChange={(e) => handleUpdateProfile(p.id, e.target.value, p.kourel_id)} className="text-[10px] border border-slate-200 p-3 rounded-xl font-bold bg-slate-50 outline-none"><option value="surveillant">SURVEILLANT</option><option value="coordinateur">COORDINATEUR</option></select>
                          <select value={p.kourel_id || ""} onChange={(e) => handleUpdateProfile(p.id, p.role, e.target.value || null)} className="text-[10px] border border-slate-200 p-3 rounded-xl font-bold bg-slate-50 outline-none truncate"><option value="">SANS KUREL</option>{kourels.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
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
        <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-xl border-t border-slate-100 h-20 flex justify-around items-center z-[60] px-2 shadow-2xl">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setView(item.id)} className={`flex flex-col items-center gap-1 p-2 min-w-[70px] transition-all ${view === item.id ? 'text-indigo-600' : 'text-slate-300'}`}><item.icon size={22} strokeWidth={2.5} /><span className="text-[9px] font-black uppercase tracking-tighter">{item.label}</span></button>
          ))}
        </nav>
      )}
    </div>
  );
}

export default App;
