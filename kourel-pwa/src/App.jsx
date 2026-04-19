import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { 
  Home, CheckCircle2, ClipboardList, Settings, LogOut, 
  Plus, Save, Loader2, ChevronLeft, ChevronRight, Search, 
  Phone, FileDown, Trash2, Users, Calendar, ShieldCheck, UserPlus
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
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
    const { data: allAtt } = await supabase.from('attendance').select('status, members(kourel_id)');
    const sMap = {};
    (kList || []).forEach(k => {
      const kAtt = allAtt?.filter(a => a.members?.kourel_id === k.id) || [];
      const pres = kAtt.filter(a => ['Présent'].includes(a.status)).length;
      sMap[k.id] = { rate: kAtt.length > 0 ? Math.round((pres / kAtt.length) * 100) : 0 };
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
    setSaving(true);
    const dateStr = format(attendanceDate, 'yyyy-MM-dd');
    const records = Object.entries(attendance).map(([mId, status]) => ({ member_id: mId, status, date: dateStr }));
    const { error } = await supabase.from('attendance').insert(records);
    if (!error) { showToast('Enregistré !'); loadKourelData(selectedKourel.id); setView('dashboard'); }
    else { showToast('Erreur', 'error'); }
    setSaving(false);
  };

  const handleLogout = () => { supabase.auth.signOut().then(() => window.location.reload()); };

  const generatePDF = (date) => {
    const doc = new jsPDF();
    const data = date ? history.filter(h => h.date === date) : history;
    doc.text(`Rapport Presence - ${selectedKourel.name}`, 14, 20);
    autoTable(doc, { startY: 25, head: [['Nom', 'Statut', 'Date']], body: data.map(h => [h.members?.name, h.status, h.date]), headStyles: { fillColor: [67, 56, 202] } });
    doc.save(`Rapport_${selectedKourel.name}.pdf`);
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-white"><Loader2 className="animate-spin text-indigo-600" size={32} /></div>;

  const navItems = [
    { id: 'dashboard', label: 'Accueil', icon: Home },
    { id: 'attendance', label: 'Appel', icon: CheckCircle2 },
    { id: 'history', label: 'Historique', icon: ClipboardList },
    { id: 'mgmt', label: 'Gestion', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      
      {/* HEADER PC & TABLETTE */}
      {user && (
        <header className="hidden md:block sticky top-0 z-50 bg-gradient-to-r from-slate-900 to-indigo-900 text-white shadow-lg">
          <div className="max-w-4xl mx-auto px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-indigo-400" />
              <span className="font-bold text-xl tracking-tight uppercase">Saytu Kurel</span>
            </div>
            <nav className="flex gap-8">
              {navItems.map(item => (
                <button key={item.id} onClick={() => setView(item.id)} className={`flex items-center gap-2 text-sm font-bold transition-all ${view === item.id ? 'text-white' : 'text-slate-400 hover:text-indigo-300'}`}>
                  <item.icon size={18} /> {item.label}
                </button>
              ))}
            </nav>
            <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-400 transition-colors"><LogOut size={20}/></button>
          </div>
        </header>
      )}

      {/* HEADER MOBILE */}
      {user && (
        <header className="md:hidden sticky top-0 z-50 bg-gradient-to-r from-slate-900 to-indigo-900 text-white p-4 flex justify-between items-center shadow-md">
          <div className="flex items-center gap-2">
            <div className="bg-white/10 p-1.5 rounded-lg"><ShieldCheck size={18}/></div>
            <span className="font-black text-sm tracking-widest uppercase">Saytu</span>
          </div>
          {selectedKourel && <span className="text-[10px] bg-indigo-600 px-2 py-1 rounded font-black truncate max-w-[150px] uppercase">{selectedKourel.name}</span>}
          <button onClick={handleLogout} className="p-1"><LogOut size={20}/></button>
        </header>
      )}

      {/* TOAST */}
      {toast && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-2xl text-white font-bold z-[100] animate-in slide-in-from-top-4 ${toast.type === 'success' ? 'bg-indigo-600' : 'bg-red-500'}`}>
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
                <h1 className="text-2xl font-black pt-4 uppercase">Connexion</h1>
                <p className="text-slate-400 text-sm font-medium">Espace sécurisé Saytu Kurel</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-4 bg-slate-50 border-2 border-transparent rounded-2xl outline-none focus:border-indigo-500 transition-all font-medium" />
                <input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-4 bg-slate-50 border-2 border-transparent rounded-2xl outline-none focus:border-indigo-500 transition-all font-medium" />
                <button className="w-full bg-slate-900 text-white p-5 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-black active:scale-95 transition-all shadow-lg">Entrer</button>
              </form>
            </div>
          </div>
        )}

        {/* SELECTION KUREL */}
        {view === 'selection' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black uppercase tracking-tighter border-l-4 border-indigo-600 pl-4">Liste des Kourels</h2>
            <div className="grid gap-3">
              {kourels.map(k => (
                <div key={k.id} onClick={() => { setSelectedKourel(k); loadKourelData(k.id); setView('dashboard'); }} className="p-6 bg-white border border-slate-200 rounded-2xl flex justify-between items-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50/30 transition-all shadow-sm group">
                  <div>
                    <p className="font-black text-slate-900 group-hover:text-indigo-600 transition-colors">{k.name}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{k.location}</p>
                  </div>
                  <div className="text-xl font-black text-indigo-600">{kourelStats[k.id]?.rate}%</div>
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
                  {[
                    { label: 'Séances', value: stats.totalSessions, color: 'text-slate-900' },
                    { label: 'Assiduité', value: `${stats.globalRate}%`, color: 'text-emerald-600' },
                    { label: 'Membres', value: members.length, color: 'text-indigo-600' },
                  ].map((s, i) => (
                    <div key={i} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm text-center space-y-1">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">{s.label}</p>
                      <p className={`text-4xl font-black ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>

                <button onClick={() => setView('attendance')} className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 text-white p-8 rounded-[2rem] shadow-xl shadow-indigo-100 flex flex-col items-center justify-center gap-2 group active:scale-[0.98] transition-all">
                  <span className="text-2xl font-black uppercase tracking-tight">Faire l'appel</span>
                  <span className="text-xs text-indigo-100 font-bold uppercase tracking-widest opacity-80">Séance du {format(new Date(), 'dd MMMM yyyy', { locale: fr })}</span>
                </button>
              </div>
            )}

            {view === 'attendance' && (
              <div className="space-y-6">
                {/* DATE SELECTOR */}
                <div className="bg-white border border-slate-200 p-6 rounded-3xl flex flex-col items-center gap-4 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-600">Choisir la date</p>
                  <div className="flex items-center gap-6">
                    <button onClick={() => { const d = new Date(attendanceDate); d.setDate(d.getDate()-1); setAttendanceDate(d); }} className="p-3 bg-slate-50 rounded-xl hover:bg-indigo-100 transition-colors"><ChevronLeft size={24}/></button>
                    <input type="date" value={format(attendanceDate, 'yyyy-MM-dd')} onChange={e => setAttendanceDate(parseISO(e.target.value))} className="bg-transparent font-black text-2xl text-slate-900 outline-none cursor-pointer text-center" />
                    <button onClick={() => { const d = new Date(attendanceDate); d.setDate(d.getDate()+1); setAttendanceDate(d); }} className="p-3 bg-slate-50 rounded-xl hover:bg-indigo-100 transition-colors"><ChevronRight size={24}/></button>
                  </div>
                </div>

                <div className="relative">
                  <Search className="absolute left-4 top-4 text-slate-300" size={20} />
                  <input type="text" placeholder="Trouver un membre..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-4 pl-12 bg-white border border-slate-200 rounded-2xl outline-none focus:border-indigo-500 shadow-sm font-medium" />
                </div>

                <div className="space-y-3">
                  {members.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase())).map(m => (
                    <div key={m.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4 transition-all">
                      <p className="font-bold text-slate-800 text-sm text-center sm:text-left">{m.name}</p>
                      <div className="flex gap-1.5 w-full sm:w-auto">
                        {[
                          { l: 'ABSENT', v: 'Absent', c: 'bg-red-50 text-red-600', ac: 'bg-red-600 text-white' },
                          { l: 'NGANT', v: 'Excusé', c: 'bg-amber-50 text-amber-600', ac: 'bg-amber-600 text-white' },
                          { l: 'PRÉSENT', v: 'Présent', c: 'bg-indigo-50 text-indigo-600', ac: 'bg-indigo-600 text-white' },
                        ].map((btn) => (
                          <button key={btn.v} onClick={() => setAttendance({...attendance, [m.id]: btn.v})} className={`flex-1 sm:flex-none px-4 py-3 rounded-xl font-black text-[9px] uppercase transition-all ${attendance[m.id] === btn.v ? btn.ac + ' shadow-md scale-105' : 'bg-slate-50 text-slate-300'}`}>
                            {btn.l}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="fixed bottom-24 left-0 right-0 px-4 md:px-0 md:static flex justify-center">
                   <button onClick={saveAttendance} disabled={saving} className="w-full max-w-sm py-5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                    {saving ? <Loader2 className="animate-spin" size={20}/> : <Save size={20}/>}
                    VALIDER L'APPEL
                  </button>
                </div>
              </div>
            )}

            {view === 'history' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-black uppercase tracking-tight">Historique</h2>
                  <button onClick={() => generatePDF()} className="p-3 bg-indigo-50 text-indigo-600 rounded-xl flex items-center gap-2 font-black text-[10px] tracking-widest uppercase"><FileDown size={18}/> PDF</button>
                </div>
                <div className="grid gap-3">
                  {[...new Set(history.map(h => h.date))].sort((a,b) => new Date(b)-new Date(a)).map(date => (
                    <div key={date} className="bg-white border border-slate-100 p-5 rounded-2xl flex justify-between items-center shadow-sm">
                      <div>
                        <p className="font-black text-slate-900 text-sm uppercase tracking-wide">{format(parseISO(date), 'dd MMMM yyyy', { locale: fr })}</p>
                        <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest">{history.filter(h => h.date === date && h.status === 'Présent').length} présents</p>
                      </div>
                      <button onClick={() => generatePDF(date)} className="p-3 bg-slate-50 rounded-xl hover:bg-indigo-600 hover:text-white transition-colors"><FileDown size={20}/></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'mgmt' && (
              <div className="space-y-8">
                <div className="flex bg-white p-1 rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  {['members', 'sessions', 'users'].filter(t => profile?.role === 'coordinateur' || t !== 'users').map(tab => (
                    <button key={tab} onClick={() => setMgmtTab(tab)} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${mgmtTab === tab ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>{tab}</button>
                  ))}
                </div>
                {mgmtTab === 'members' && (
                  <div className="grid gap-3">
                    <button onClick={() => { const n = window.prompt("Nom complet ?"); if(n) supabase.from('members').insert([{name:n, kourel_id:selectedKourel.id}]).then(()=>loadKourelData(selectedKourel.id)); }} className="p-8 border-2 border-dashed border-slate-200 rounded-3xl font-black text-slate-400 uppercase text-[10px] tracking-widest hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center justify-center gap-3">
                      <UserPlus size={20} /> Ajouter un membre
                    </button>
                    {allMembers.map(m => (
                      <div key={m.id} className="bg-white p-5 border border-slate-100 rounded-2xl flex justify-between items-center shadow-sm">
                        <span className="font-bold text-sm text-slate-800">{m.name}</span>
                        <div className="flex gap-2">
                          {m.phone && <a href={`tel:${m.phone}`} className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl"><Phone size={18}/></a>}
                          <button onClick={async () => { if(window.confirm('Désactiver ce membre ?')) { await supabase.from('members').update({active: !m.active}).eq('id', m.id); loadKourelData(selectedKourel.id); }}} className={`p-2.5 rounded-xl border ${m.active ? 'text-amber-600 border-amber-100 bg-amber-50' : 'text-emerald-600 border-emerald-100 bg-emerald-50'}`}><Users size={18}/></button>
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

      {/* NAVIGATION MOBILE - TAB BAR EXPLICITE */}
      {user && view !== 'selection' && (
        <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-xl border-t border-slate-100 h-20 flex justify-around items-center z-[60] px-2 shadow-[0_-5px_20px_rgba(0,0,0,0.02)]">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setView(item.id)} className={`flex flex-col items-center gap-1 p-2 min-w-[70px] transition-all ${view === item.id ? 'text-indigo-600' : 'text-slate-300'}`}>
              <item.icon size={22} strokeWidth={view === item.id ? 2.5 : 2} />
              <span className={`text-[9px] font-black uppercase tracking-tighter ${view === item.id ? 'opacity-100' : 'opacity-100'}`}>{item.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

export default App;
