import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { 
  Home, CheckCircle2, ClipboardList, Settings, LogOut, 
  Plus, Save, Loader2, ChevronLeft, ChevronRight, Search, 
  Phone, FileDown, Trash2, Users, Calendar, ShieldCheck, UserPlus, TrendingUp
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

  useEffect(() => { checkUser(); }, []);

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
      
      // Evolution : Taux mois dernier vs mois actuel
      const thisMonth = kAtt.filter(a => a.date.startsWith(format(new Date(), 'yyyy-MM'))).length;
      
      sMap[k.id] = { 
        rate: kAtt.length > 0 ? Math.round((pres / kAtt.length) * 100) : 0,
        sessions: [...new Set(kAtt.map(a => a.date))].length,
        active: kAtt.length > 0
      };
    });
    setKourelsStats(sMap);
  };

  const loadKourelData = async (kid) => {
    const { data: mData } = await supabase.from('members').select('*').eq('kourel_id', kid).eq('active', true).order('name');
    const { data: amData } = await supabase.from('members').select('*').eq('kourel_id', kid).order('name');
    setMembers(mData || []);
    setAllMembers(amData || []);
    const initialAtt = {};
    (mData || []).forEach(m => initialAtt[m.id] = 'Présent');
    setAttendance(initialAtt);
    const { data: aData } = await supabase.from('attendance').select('*, members!inner(*)').eq('members.kourel_id', kid);
    if (aData) {
      const dates = [...new Set(aData.map(d => d.date))];
      const pres = aData.filter(d => ['Présent'].includes(d.status)).length;
      setStats({ totalSessions: dates.length, globalRate: aData.length > 0 ? Math.round((pres / aData.length) * 100) : 0 });
      setHistory(aData.sort((a,b) => new Date(b.date) - new Date(a.date)));
    }
  };

  const saveAttendance = async () => {
    if (profile?.role !== 'surveillant') return;
    setSaving(true);
    const dateStr = format(attendanceDate, 'yyyy-MM-dd');
    const records = Object.entries(attendance).map(([mId, status]) => ({ member_id: mId, status, date: dateStr }));
    const { error } = await supabase.from('attendance').insert(records);
    if (!error) { showToast('Appel enregistré !'); loadKourelData(selectedKourel.id); setView('dashboard'); }
    else { showToast('Erreur', 'error'); }
    setSaving(false);
  };

  const handleLogout = () => { supabase.auth.signOut().then(() => window.location.reload()); };

  const generateMonthlyPDF = () => {
    const doc = new jsPDF();
    const start = startOfMonth(parseISO(selectedMonth + "-01"));
    const end = endOfMonth(start);
    
    const monthlyData = history.filter(h => {
      const d = parseISO(h.date);
      return isWithinInterval(d, { start, end });
    });

    doc.setFontSize(16);
    doc.text(`Rapport Mensuel : ${format(start, 'MMMM yyyy', { locale: fr })}`, 14, 20);
    doc.setFontSize(12);
    doc.text(`Kourel : ${selectedKourel.name}`, 14, 28);

    autoTable(doc, { 
      startY: 35, 
      head: [['Nom', 'Statut', 'Date']], 
      body: monthlyData.map(h => [h.members?.name, h.status, h.date]),
      headStyles: { fillColor: [30, 41, 59] } 
    });
    doc.save(`Rapport_${selectedKourel.name}_${selectedMonth}.pdf`);
  };

  const navItems = [
    { id: 'dashboard', label: 'Accueil', icon: Home, roles: ['surveillant', 'coordinateur'] },
    { id: 'attendance', label: 'Appel', icon: CheckCircle2, roles: ['surveillant'] },
    { id: 'history', label: 'Historique', icon: ClipboardList, roles: ['surveillant', 'coordinateur'] },
    { id: 'mgmt', label: 'Gestion', icon: Settings, roles: ['surveillant', 'coordinateur'] },
  ].filter(item => item.roles.includes(profile?.role));

  if (loading) return <div className="h-screen flex items-center justify-center bg-white"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      
      {/* HEADER PC */}
      {user && (
        <header className="hidden md:block sticky top-0 z-50 bg-slate-900 text-white shadow-lg">
          <div className="max-w-4xl mx-auto px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-indigo-400" />
              <span className="font-bold text-xl uppercase tracking-tighter">Saytu Supervision</span>
            </div>
            <nav className="flex gap-8">
              {navItems.map(item => (
                <button key={item.id} onClick={() => setView(item.id)} className={`flex items-center gap-2 text-sm font-bold transition-all ${view === item.id ? 'text-indigo-400' : 'text-slate-400 hover:text-white'}`}>
                  <item.icon size={18} /> {item.label}
                </button>
              ))}
            </nav>
            <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-400"><LogOut size={20}/></button>
          </div>
        </header>
      )}

      {/* HEADER MOBILE */}
      {user && (
        <header className="md:hidden sticky top-0 z-50 bg-slate-900 text-white p-4 flex justify-between items-center shadow-md">
          <span className="font-black text-sm tracking-widest uppercase">Saytu</span>
          {selectedKourel && <span className="text-[10px] bg-indigo-600 px-3 py-1 rounded font-black truncate max-w-[150px] uppercase">{selectedKourel.name}</span>}
          <button onClick={handleLogout}><LogOut size={20}/></button>
        </header>
      )}

      {toast && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-2xl text-white font-bold z-[100] animate-in slide-in-from-top-4 ${toast.type === 'success' ? 'bg-slate-900' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      <main className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-8 pb-32">
        
        {/* LOGIN */}
        {view === 'login' && (
          <div className="min-h-[70vh] flex items-center justify-center">
            <div className="w-full max-w-md bg-white p-10 rounded-3xl shadow-sm border border-slate-100 space-y-8">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto flex items-center justify-center text-white shadow-xl shadow-indigo-100"><ShieldCheck size={32} /></div>
                <h1 className="text-2xl font-black pt-4 uppercase">Saytu Login</h1>
                <p className="text-slate-400 text-sm font-medium">Espace de gestion et supervision</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-4 bg-slate-50 border-2 border-transparent rounded-2xl outline-none focus:border-indigo-500 transition-all font-medium" />
                <input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-4 bg-slate-50 border-2 border-transparent rounded-2xl outline-none focus:border-indigo-500 transition-all font-medium" />
                <button className="w-full bg-slate-900 text-white p-5 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-black active:scale-95 transition-all shadow-lg">Connexion</button>
              </form>
            </div>
          </div>
        )}

        {/* SUPERVISION SELECTION (COORDINATEUR) */}
        {view === 'selection' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-black uppercase tracking-tighter border-l-4 border-indigo-600 pl-4">Supervision Globale</h2>
              <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 text-[10px] font-black uppercase">{kourels.length} Kourels</div>
            </div>
            <div className="grid gap-4">
              {kourels.map(k => (
                <div key={k.id} onClick={() => { setSelectedKourel(k); loadKourelData(k.id); setView('dashboard'); }} className="p-6 bg-white border border-slate-200 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:shadow-xl hover:border-indigo-500 transition-all group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center font-black text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">{k.name.charAt(0)}</div>
                    <div>
                      <p className="font-black text-slate-900 uppercase text-sm">{k.name}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{k.location}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="text-center">
                       <p className="text-xl font-black text-indigo-600">{kourelStats[k.id]?.rate}%</p>
                       <p className="text-[8px] font-black text-slate-400 uppercase">Présence</p>
                    </div>
                    <div className="text-center">
                       <p className="text-xl font-black text-slate-900">{kourelStats[k.id]?.sessions}</p>
                       <p className="text-[8px] font-black text-slate-400 uppercase">Séances</p>
                    </div>
                    <ChevronRight className="text-slate-200 group-hover:text-indigo-600 transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedKourel && (
          <div className="animate-in fade-in duration-500">
            {/* DASHBOARD */}
            {view === 'dashboard' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                   <h2 className="text-xl font-black uppercase tracking-tight">Statistiques</h2>
                   {profile?.role === 'coordinateur' && <button onClick={() => setView('selection')} className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg uppercase">Changer Kourel</button>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label: 'Séances Totales', value: stats.totalSessions, color: 'text-slate-900' },
                    { label: 'Taux Assiduité', value: `${stats.globalRate}%`, color: 'text-emerald-600' },
                    { label: 'Effectif Membres', value: members.length, color: 'text-indigo-600' },
                  ].map((s, i) => (
                    <div key={i} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm text-center space-y-1">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">{s.label}</p>
                      <p className={`text-4xl font-black ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {profile?.role === 'surveillant' && (
                  <button onClick={() => setView('attendance')} className="w-full bg-slate-900 text-white p-8 rounded-[2rem] shadow-xl flex flex-col items-center justify-center gap-2 active:scale-[0.98] transition-all">
                    <span className="text-2xl font-black uppercase tracking-tight">Démarrer l'appel</span>
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-widest opacity-80">Session du jour</span>
                  </button>
                )}

                {profile?.role === 'coordinateur' && (
                  <div className="bg-indigo-600 p-8 rounded-[2rem] text-white space-y-4">
                    <div className="flex items-center gap-3"><TrendingUp size={24}/> <h3 className="font-black uppercase tracking-tight">Rapport de Supervision</h3></div>
                    <p className="text-sm text-indigo-100 font-medium leading-relaxed">En tant que coordinateur, vous pouvez consulter l'historique complet et générer des exports PDF pour ce Kourel.</p>
                    <button onClick={() => setView('history')} className="bg-white text-indigo-600 px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest">Voir l'historique</button>
                  </div>
                )}
              </div>
            )}

            {/* APPEL (SURVEILLANT ONLY) */}
            {view === 'attendance' && profile?.role === 'surveillant' && (
              <div className="space-y-6">
                <div className="bg-white border border-slate-200 p-6 rounded-3xl flex flex-col items-center gap-4 shadow-sm">
                  <p className="text-sm font-black text-slate-800 uppercase">{format(attendanceDate, 'EEEE d MMMM yyyy', { locale: fr })}</p>
                  <div className="flex items-center gap-8">
                    <button onClick={() => { const d = new Date(attendanceDate); d.setDate(d.getDate()-1); setAttendanceDate(d); }} className="p-3 bg-slate-50 rounded-xl"><ChevronLeft size={24}/></button>
                    <Calendar className="text-indigo-500" size={24}/>
                    <button onClick={() => { const d = new Date(attendanceDate); d.setDate(d.getDate()+1); setAttendanceDate(d); }} className="p-3 bg-slate-50 rounded-xl"><ChevronRight size={24}/></button>
                  </div>
                </div>

                <div className="space-y-3">
                  {members.map(m => (
                    <div key={m.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4 transition-all">
                      <p className="font-bold text-slate-800 text-sm">{m.name}</p>
                      <div className="flex gap-1.5 w-full sm:w-auto">
                        {['Absent', 'Excusé', 'Présent'].map((v) => (
                          <button key={v} onClick={() => setAttendance({...attendance, [m.id]: v})} className={`flex-1 sm:flex-none px-4 py-3 rounded-xl font-black text-[9px] uppercase transition-all ${
                            attendance[m.id] === v ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-50 text-slate-300'
                          }`}>{v === 'Excusé' ? 'NGANT' : v}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={saveAttendance} disabled={saving} className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-xs bg-slate-900 text-white p-5 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl z-40">
                  {saving ? 'ENCOURS...' : 'VALIDER L\'APPEL'}
                </button>
              </div>
            )}

            {/* HISTORIQUE & RAPPORTS MENSUELS */}
            {view === 'history' && (
              <div className="space-y-6">
                <div className="bg-white border border-slate-200 p-6 rounded-3xl space-y-4 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Export des données</p>
                  <div className="flex flex-col md:flex-row gap-4 items-center">
                    <div className="w-full">
                      <label className="text-[8px] font-black uppercase text-slate-400 mb-1 block">Mois du rapport</label>
                      <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-indigo-600" />
                    </div>
                    <button onClick={generateMonthlyPDF} className="w-full md:w-auto bg-slate-900 text-white px-8 py-4 rounded-xl flex items-center justify-center gap-2 font-black text-[10px] tracking-widest uppercase mt-4">
                      <FileDown size={18}/> Générer Rapport
                    </button>
                  </div>
                </div>

                <div className="grid gap-3">
                  {[...new Set(history.map(h => h.date))].sort((a,b) => new Date(b)-new Date(a)).map(date => (
                    <div key={date} className="bg-white border border-slate-100 p-5 rounded-2xl flex justify-between items-center shadow-sm">
                      <div>
                        <p className="font-black text-slate-900 text-sm uppercase tracking-wide">{format(parseISO(date), 'EEEE d MMMM', { locale: fr })}</p>
                        <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest">{history.filter(h => h.date === date && h.status === 'Présent').length} présents</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {profile?.role === 'coordinateur' && <button onClick={() => { if(window.confirm('Supprimer ?')) deleteSession(date); }} className="p-2.5 text-red-400 hover:text-red-600"><Trash2 size={18}/></button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'mgmt' && (
              <div className="space-y-6">
                <div className="flex bg-white p-1 rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                   <button onClick={() => setMgmtTab('members')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${mgmtTab === 'members' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>Membres</button>
                   {profile?.role === 'coordinateur' && <button onClick={() => setMgmtTab('users')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${mgmtTab === 'users' ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>Admin</button>}
                </div>

                {mgmtTab === 'members' && (
                  <div className="grid gap-3">
                    {profile?.role === 'surveillant' && (
                      <button onClick={() => { const n = window.prompt("Nom complet ?"); if(n) supabase.from('members').insert([{name:n, kourel_id:selectedKourel.id}]).then(()=>loadKourelData(selectedKourel.id)); }} className="p-8 border-2 border-dashed border-slate-200 rounded-3xl font-black text-slate-400 uppercase text-[10px] tracking-widest hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center justify-center gap-3">+ Ajouter Membre</button>
                    )}
                    {allMembers.map(m => (
                      <div key={m.id} className="bg-white p-5 border border-slate-100 rounded-2xl flex justify-between items-center shadow-sm">
                        <div>
                          <p className="font-bold text-sm text-slate-800">{m.name}</p>
                          {!m.active && <span className="text-[8px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded font-black">INACTIF</span>}
                        </div>
                        {profile?.role === 'surveillant' && (
                          <div className="flex gap-2">
                             <button onClick={async () => { await supabase.from('members').update({active: !m.active}).eq('id', m.id); loadKourelData(selectedKourel.id); }} className={`p-2.5 rounded-xl border ${m.active ? 'text-amber-600 border-amber-100 bg-amber-50' : 'text-emerald-600 border-emerald-100 bg-emerald-50'}`}><Users size={16}/></button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {mgmtTab === 'users' && profile?.role === 'coordinateur' && (
                   <div className="grid gap-3">
                    {allProfiles.map(p => (
                      <div key={p.id} className="p-4 bg-white border border-slate-100 rounded-2xl space-y-4 shadow-sm">
                        <p className="font-black text-xs truncate max-w-[180px]">{p.email}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <select value={p.role} onChange={(e)=>handleUpdateProfile(p.id, e.target.value, p.kourel_id)} className="text-[10px] border border-slate-200 p-3 rounded-xl font-bold bg-slate-50">
                            <option value="surveillant">SURVEILLANT</option>
                            <option value="coordinateur">COORDINATEUR</option>
                          </select>
                          <select value={p.kourel_id || ""} onChange={(e)=>handleUpdateProfile(p.id, p.role, e.target.value || null)} className="text-[10px] border border-slate-200 p-3 rounded-xl font-bold bg-slate-50">
                            <option value="">SANS KUREL</option>
                            {kourels.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                          </select>
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

      {/* NAV MOBILE */}
      {user && view !== 'selection' && (
        <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-xl border-t border-slate-100 h-20 flex justify-around items-center z-[60] px-2 shadow-2xl">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setView(item.id)} className={`flex flex-col items-center gap-1 p-2 min-w-[70px] transition-all ${view === item.id ? 'text-indigo-600' : 'text-slate-300'}`}>
              <item.icon size={22} strokeWidth={2.5} />
              <span className="text-[9px] font-black uppercase tracking-tighter">{item.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

export default App;
