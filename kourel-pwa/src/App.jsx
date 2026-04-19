import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { 
  LayoutGrid, CheckCircle2, ClipboardList, Settings, LogOut, 
  Plus, Save, Loader2, ChevronLeft, ChevronRight, Search, 
  Phone, FileDown, Trash2, Users, Calendar, AlertCircle
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
    if (!error) { showToast('Appel enregistré !'); loadKourelData(selectedKourel.id); setView('dashboard'); }
    else { showToast('Erreur', 'error'); }
    setSaving(false);
  };

  const deleteSession = async (date) => {
    if (!window.confirm('Supprimer cette session ?')) return;
    const mIds = allMembers.map(m => m.id);
    await supabase.from('attendance').delete().eq('date', date).in('member_id', mIds);
    loadKourelData(selectedKourel.id);
  };

  const handleUpdateProfile = async (pId, newRole, newKourelId) => {
    await supabase.from('profiles').update({ role: newRole, kourel_id: newKourelId }).eq('id', pId);
    fetchGlobalStats();
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) await fetchProfile(data.user.id);
    else { showToast('Erreur connexion', 'error'); setLoading(false); }
  };

  const handleLogout = () => { supabase.auth.signOut().then(() => window.location.reload()); };

  const generatePDF = (date) => {
    const doc = new jsPDF();
    const data = date ? history.filter(h => h.date === date) : history;
    doc.text(`Rapport Presence - ${selectedKourel.name}`, 14, 20);
    autoTable(doc, { 
      startY: 25, 
      head: [['Nom', 'Statut', 'Date']], 
      body: data.map(h => [h.members?.name, h.status, h.date]),
      headStyles: { fillColor: [67, 56, 202] }
    });
    doc.save(`Rapport_${selectedKourel.name}.pdf`);
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-gray-50 text-indigo-600 font-bold">Chargement Saytu...</div>;

  return (
    <div className="min-h-screen bg-[#FDFDFF] text-slate-800 font-sans">
      
      {/* TOAST */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-xl text-white font-bold z-[100] animate-in slide-in-from-top-4 ${toast.type === 'success' ? 'bg-indigo-600' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      {user && (
        <nav className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-4 flex justify-between items-center shadow-lg">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 p-1.5 rounded-lg"><CheckCircle2 size={20}/></div>
            <span className="font-bold tracking-tight text-lg">SAYTU KUREL</span>
          </div>
          <div className="flex gap-4">
            {profile?.role === 'coordinateur' && view !== 'selection' && <button onClick={() => setView('selection')} className="p-1 hover:text-indigo-400"><LayoutGrid size={20}/></button>}
            <button onClick={handleLogout} className="p-1 hover:text-red-400"><LogOut size={20}/></button>
          </div>
        </nav>
      )}

      <main className="max-w-3xl mx-auto p-4 md:p-8">
        
        {view === 'login' && (
          <div className="pt-16 max-w-sm mx-auto">
            <div className="bg-white border border-slate-100 p-8 rounded-2xl shadow-sm space-y-6">
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold text-slate-900">Content de vous revoir</h1>
                <p className="text-slate-400 text-sm">Entrez vos accès surveillant</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 ring-indigo-500" />
                <input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 ring-indigo-500" />
                <button className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 text-white p-4 rounded-xl font-bold shadow-indigo-100 shadow-lg active:scale-95 transition-all">SE CONNECTER</button>
              </form>
            </div>
          </div>
        )}

        {view === 'selection' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-slate-800">Tableau Master</h2>
            <div className="grid gap-3">
              {kourels.map(k => (
                <div key={k.id} onClick={() => { setSelectedKourel(k); loadKourelData(k.id); setView('dashboard'); }} className="p-5 bg-white border border-slate-100 rounded-2xl flex justify-between items-center cursor-pointer hover:border-indigo-300 transition-all shadow-sm">
                  <div>
                    <p className="font-bold text-slate-900">{k.name}</p>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{k.location}</p>
                  </div>
                  <div className="bg-indigo-50 text-indigo-700 px-4 py-1.5 rounded-full font-bold text-sm">{kourelStats[k.id]?.rate}%</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedKourel && (
          <>
            {view === 'dashboard' && (
              <div className="space-y-6">
                <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4">Statistiques du groupe</p>
                   <div className="grid grid-cols-3 gap-4">
                      <div className="text-center space-y-1">
                        <p className="text-2xl font-bold">{stats.totalSessions}</p>
                        <p className="text-[9px] font-medium text-slate-400 uppercase">Séances</p>
                      </div>
                      <div className="text-center space-y-1">
                        <p className="text-2xl font-bold text-indigo-600">{stats.globalRate}%</p>
                        <p className="text-[9px] font-medium text-slate-400 uppercase">Présence</p>
                      </div>
                      <div className="text-center space-y-1">
                        <p className="text-2xl font-bold">{members.length}</p>
                        <p className="text-[9px] font-medium text-slate-400 uppercase">Membres</p>
                      </div>
                   </div>
                </div>

                <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 p-8 rounded-[2rem] text-white shadow-xl shadow-indigo-100 relative overflow-hidden group cursor-pointer" onClick={() => setView('attendance')}>
                  <div className="relative z-10 space-y-1">
                    <h3 className="text-2xl font-bold">Faire l'appel</h3>
                    <p className="text-indigo-100 text-sm">C'est l'heure de pointer la présence</p>
                  </div>
                  <Calendar className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 rotate-12 group-hover:rotate-0 transition-transform duration-500" />
                </div>
              </div>
            )}

            {view === 'attendance' && (
              <div className="space-y-6 pb-28">
                {/* DATE SELECTOR - TRES IMPORTANT */}
                <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl text-center space-y-3">
                  <div className="flex items-center justify-center gap-2 text-amber-700">
                    <Calendar size={18} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Date de la séance</span>
                  </div>
                  <div className="flex items-center justify-center gap-6">
                    <button onClick={() => { const d = new Date(attendanceDate); d.setDate(d.getDate()-1); setAttendanceDate(d); }} className="p-3 bg-white rounded-xl shadow-sm hover:bg-amber-100 transition-colors"><ChevronLeft size={24}/></button>
                    <input type="date" value={format(attendanceDate, 'yyyy-MM-dd')} onChange={e => setAttendanceDate(parseISO(e.target.value))} className="bg-transparent font-bold text-xl text-slate-900 outline-none cursor-pointer" />
                    <button onClick={() => { const d = new Date(attendanceDate); d.setDate(d.getDate()+1); setAttendanceDate(d); }} className="p-3 bg-white rounded-xl shadow-sm hover:bg-amber-100 transition-colors"><ChevronRight size={24}/></button>
                  </div>
                </div>

                <div className="relative">
                  <Search size={18} className="absolute left-4 top-4 text-slate-300" />
                  <input type="text" placeholder="Rechercher un membre..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-4 pl-12 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 ring-indigo-500" />
                </div>

                <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden divide-y divide-slate-50">
                  {members.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase())).map(m => (
                    <div key={m.id} className="p-4 flex justify-between items-center gap-4">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 text-sm truncate">{m.name}</p>
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{m.level}</p>
                      </div>
                      <div className="flex gap-1.5">
                        {[
                          { l: 'ABSENT', v: 'Absent', c: 'bg-red-50 text-red-600 border-red-100', ac: 'bg-red-600 text-white border-red-600' },
                          { l: 'NGANT', v: 'Excusé', c: 'bg-amber-50 text-amber-600 border-amber-100', ac: 'bg-amber-600 text-white border-amber-600' },
                          { l: 'PRÉSENT', v: 'Présent', c: 'bg-indigo-50 text-indigo-600 border-indigo-100', ac: 'bg-indigo-600 text-white border-indigo-600' },
                        ].map((btn) => (
                          <button 
                            key={btn.v} 
                            onClick={() => setAttendance({...attendance, [m.id]: btn.v})} 
                            className={`px-3 py-2 rounded-lg font-bold text-[9px] uppercase border transition-all ${
                              attendance[m.id] === btn.v ? btn.ac : `bg-white text-slate-300 border-slate-100`
                            }`}
                          >
                            {btn.l}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="fixed bottom-6 left-0 right-0 px-4">
                   <button onClick={saveAttendance} disabled={saving} className="w-full max-w-sm mx-auto bg-slate-900 text-white p-5 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-2xl active:scale-95 transition-all">
                    {saving ? <Loader2 className="animate-spin" size={20}/> : <Save size={20}/>}
                    VALIDER L'APPEL DU {format(attendanceDate, 'dd/MM')}
                  </button>
                </div>
              </div>
            )}

            {view === 'history' && (
              <div className="space-y-6">
                <div className="flex justify-between items-end">
                  <h2 className="text-2xl font-bold text-slate-800">Historique</h2>
                  <button onClick={() => generatePDF()} className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl">TOUT EXPORTER</button>
                </div>
                <div className="grid gap-3">
                  {[...new Set(history.map(h => h.date))].sort((a,b) => new Date(b)-new Date(a)).map(date => (
                    <div key={date} className="bg-white border border-slate-100 p-5 rounded-2xl flex justify-between items-center shadow-sm">
                      <div className="space-y-1">
                        <p className="font-bold text-slate-900">{format(parseISO(date), 'EEEE d MMMM', { locale: fr })}</p>
                        <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest">{history.filter(h => h.date === date && h.status === 'Présent').length} présents</p>
                      </div>
                      <button onClick={() => generatePDF(date)} className="p-3 bg-slate-50 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><FileDown size={20}/></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === 'mgmt' && (
              <div className="space-y-6">
                <div className="bg-white p-1 rounded-xl border border-slate-100 flex shadow-sm">
                  {['members', 'sessions', 'users'].filter(t => profile?.role === 'coordinateur' || t !== 'users').map(tab => (
                    <button key={tab} onClick={() => setMgmtTab(tab)} className={`flex-1 py-3 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${mgmtTab === tab ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>{tab}</button>
                  ))}
                </div>
                {mgmtTab === 'members' && (
                  <div className="grid gap-3">
                    <button onClick={() => { const n = window.prompt("Nom ?"); if(n) supabase.from('members').insert([{name:n, kourel_id:selectedKourel.id}]).then(()=>loadKourelData(selectedKourel.id)); }} className="p-6 border-2 border-dashed border-slate-200 rounded-2xl font-bold text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-all">+ Nouveau Membre</button>
                    {allMembers.map(m => (
                      <div key={m.id} className="bg-white p-4 border border-slate-100 rounded-xl flex justify-between items-center shadow-sm">
                        <span className="font-bold text-sm">{m.name}</span>
                        <div className="flex gap-2">
                          {m.phone && <a href={`tel:${m.phone}`} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Phone size={16}/></a>}
                          <button onClick={async () => { await supabase.from('members').update({active: !m.active}).eq('id', m.id); loadKourelData(selectedKourel.id); }} className={`p-2 rounded-lg border ${m.active ? 'text-amber-600 border-amber-100 bg-amber-50' : 'text-emerald-600 border-emerald-100 bg-emerald-50'}`}><Users size={16}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {mgmtTab === 'sessions' && (
                  <div className="grid gap-2">
                    {[...new Set(history.map(h => h.date))].map(date => (
                      <div key={date} className="p-4 bg-white border border-slate-100 rounded-xl flex justify-between items-center">
                        <span className="font-bold text-xs">{date}</span>
                        <button onClick={() => deleteSession(date)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={18}/></button>
                      </div>
                    ))}
                  </div>
                )}
                {mgmtTab === 'users' && (
                   <div className="grid gap-3">
                    {allProfiles.map(p => (
                      <div key={p.id} className="p-4 bg-white border border-slate-100 rounded-2xl space-y-4 shadow-sm">
                        <div className="flex justify-between items-center">
                          <p className="font-bold text-xs truncate max-w-[180px]">{p.email}</p>
                          <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full uppercase border ${p.role === 'coordinateur' ? 'bg-slate-900 text-white border-slate-900' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>{p.role}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <select value={p.role} onChange={(e)=>handleUpdateProfile(p.id, e.target.value, p.kourel_id)} className="text-[10px] border border-slate-200 p-3 rounded-xl font-bold bg-slate-50 outline-none">
                            <option value="surveillant">SURVEILLANT</option>
                            <option value="coordinateur">COORDINATEUR</option>
                          </select>
                          <select value={p.kourel_id || ""} onChange={(e)=>handleUpdateProfile(p.id, p.role, e.target.value || null)} className="text-[10px] border border-slate-200 p-3 rounded-xl font-bold bg-slate-50 outline-none truncate">
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
          </>
        )}
      </main>

      {/* TAB BAR FIXE MOBILE */}
      {user && view !== 'selection' && (
        <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white/80 backdrop-blur-xl border-t border-slate-100 h-20 flex justify-around items-center z-50 px-4">
          {[
            { id: 'dashboard', icon: LayoutGrid },
            { id: 'attendance', icon: CheckCircle2 },
            { id: 'history', icon: ClipboardList },
            { id: 'mgmt', icon: Settings },
          ].map(item => (
            <button key={item.id} onClick={() => setView(item.id)} className={`p-3 rounded-2xl transition-all ${view === item.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-300 hover:text-slate-400'}`}>
              <item.icon size={24} strokeWidth={2.5} />
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

export default App;
