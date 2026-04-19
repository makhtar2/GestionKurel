import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { 
  LayoutDashboard, CheckCircle2, History, Settings, LogOut, 
  Plus, Save, Loader2, ChevronLeft, ChevronRight, Search, 
  MessageCircle, Phone, FileDown, Trash2, UserPlus, Users
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState('login'); 
  const [selectedKourel, setSelectedKourel] = useState(null);
  const [members, setMembers] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [attendanceNotes, setAttendanceNotes] = useState({});
  const [attendanceDate, setAttendanceDate] = useState(new Date());
  const [stats, setStats] = useState({ totalSessions: 0, globalRate: 0 });
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [kourels, setKourels] = useState([]);
  const [kourelStats, setKourelsStats] = useState({});
  const [allProfiles, setAllProfiles] = useState([]);
  const [toast, setToast] = useState(null);
  const [mgmtTab, setMgmtTab] = useState('members');
  const [attendanceSearch, setAttendanceSearch] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => { checkUser(); }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setUser(session.user);
      await fetchProfile(session.user.id);
    } else {
      setView('login');
      setLoading(false);
    }
  };

  const fetchProfile = async (uid) => {
    const { data, error } = await supabase.from('profiles').select('*, kourels(*)').eq('id', uid).single();
    if (!error) {
      setProfile(data);
      if (data.role === 'surveillant' && data.kourels) {
        setSelectedKourel(data.kourels);
        await loadKourelData(data.kourels.id);
        setView('dashboard');
      } else {
        await fetchGlobalStats();
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
      const pres = kAtt.filter(a => ['Présent', 'Retard'].includes(a.status)).length;
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
      const pres = aData.filter(d => ['Présent', 'Retard'].includes(d.status)).length;
      setStats({ totalSessions: dates.length, globalRate: aData.length > 0 ? Math.round((pres / aData.length) * 100) : 0 });
      setHistory(aData.sort((a,b) => new Date(b.date) - new Date(a.date)));
    }
  };

  const saveAttendance = async () => {
    setSaving(true);
    const dateStr = format(attendanceDate, 'yyyy-MM-dd');
    const records = Object.entries(attendance).map(([mId, status]) => ({ 
      member_id: mId, status, date: dateStr, notes: attendanceNotes[mId] || null 
    }));
    const { error } = await supabase.from('attendance').insert(records);
    if (!error) { showToast('Appel enregistré !'); await loadKourelData(selectedKourel.id); setView('dashboard'); }
    else { showToast(error.message, 'error'); }
    setSaving(false);
  };

  const deleteSession = async (date) => {
    if (!window.confirm(`Supprimer la séance du ${date} ?`)) return;
    setSaving(true);
    const mIds = allMembers.map(m => m.id);
    await supabase.from('attendance').delete().eq('date', date).in('member_id', mIds);
    await loadKourelData(selectedKourel.id);
    setSaving(false);
  };

  const handleUpdateProfile = async (pId, newRole, newKourelId) => {
    setSaving(true);
    await supabase.from('profiles').update({ role: newRole, kourel_id: newKourelId }).eq('id', pId);
    await fetchGlobalStats();
    setSaving(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) await fetchProfile(data.user.id);
    else { showToast('Erreur de connexion', 'error'); setLoading(false); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    doc.text(`Rapport ${selectedKourel.name}`, 14, 20);
    const tableData = history.map(h => [h.members?.name, h.status, h.date, h.notes || '']);
    doc.autoTable({ startY: 30, head: [['Membre', 'Statut', 'Date', 'Note']], body: tableData });
    doc.save(`Rapport_${selectedKourel.name}.pdf`);
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans pb-20 md:pb-0 md:pl-64">
      
      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-lg text-white font-bold text-sm ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* SIDEBAR (Desktop) */}
      {user && view !== 'login' && view !== 'selection' && (
        <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 flex-col p-6">
          <h1 className="text-xl font-bold text-blue-600 mb-8">Saytu Kurel</h1>
          <nav className="flex-1 space-y-2">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
              { id: 'attendance', label: 'Faire l\'appel', icon: CheckCircle2 },
              { id: 'history', label: 'Historique', icon: History },
              { id: 'mgmt', label: 'Gestion', icon: Settings },
            ].map(item => (
              <button key={item.id} onClick={() => setView(item.id)} className={`w-full flex items-center gap-3 p-3 rounded-lg font-medium transition ${view === item.id ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}>
                <item.icon size={20} /> {item.label}
              </button>
            ))}
          </nav>
          <button onClick={handleLogout} className="flex items-center gap-3 p-3 text-red-500 font-medium hover:bg-red-50 rounded-lg">
            <LogOut size={20} /> Déconnexion
          </button>
        </aside>
      )}

      {/* LOGIN VIEW */}
      {view === 'login' && (
        <div className="min-h-screen flex items-center justify-center px-4">
          <form onSubmit={handleLogin} className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-xl space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold">Saytu Kurel</h1>
              <p className="text-gray-500">Connectez-vous pour continuer</p>
            </div>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500" />
            <input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500" />
            <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition">Se connecter</button>
          </form>
        </div>
      )}

      {/* SELECTION VIEW (Coordinateur) */}
      {view === 'selection' && (
        <div className="max-w-2xl mx-auto p-6 space-y-6">
          <h2 className="text-2xl font-bold">Sélectionnez un Kourel</h2>
          <div className="grid gap-4">
            {kourels.map(k => (
              <div key={k.id} onClick={() => { setSelectedKourel(k); loadKourelData(k.id); setView('dashboard'); }} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center cursor-pointer hover:border-blue-500 transition">
                <div>
                  <p className="font-bold">{k.name}</p>
                  <p className="text-xs text-gray-400 uppercase">{k.location}</p>
                </div>
                <div className="text-blue-600 font-bold">{kourelStats[k.id]?.rate}%</div>
              </div>
            ))}
          </div>
          <button onClick={handleLogout} className="w-full p-4 text-red-500 font-bold border border-red-200 rounded-xl mt-4">Déconnexion</button>
        </div>
      )}

      {/* APP VIEWS */}
      {selectedKourel && view !== 'login' && view !== 'selection' && (
        <div className="p-4 md:p-10 max-w-6xl mx-auto space-y-8">
          
          <header className="flex justify-between items-center">
            <div>
              <p className="text-blue-600 font-bold text-xs uppercase tracking-widest">{selectedKourel.location}</p>
              <h1 className="text-2xl font-bold">{selectedKourel.name}</h1>
            </div>
            {profile?.role === 'coordinateur' && (
              <button onClick={() => { setView('selection'); fetchGlobalStats(); }} className="p-2 text-gray-400 hover:text-blue-600"><ChevronLeft size={24} /></button>
            )}
          </header>

          {view === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <p className="text-gray-400 text-xs font-bold uppercase">Séances</p>
                  <p className="text-3xl font-bold">{stats.totalSessions}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <p className="text-gray-400 text-xs font-bold uppercase">Assiduité</p>
                  <p className="text-3xl font-bold text-green-600">{stats.globalRate}%</p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <p className="text-gray-400 text-xs font-bold uppercase">Membres</p>
                  <p className="text-3xl font-bold text-blue-600">{members.length}</p>
                </div>
              </div>

              <div className="bg-blue-600 p-8 rounded-3xl text-white shadow-lg cursor-pointer hover:bg-blue-700 transition" onClick={() => setView('attendance')}>
                <h3 className="text-xl font-bold">Lancer l'appel aujourd'hui</h3>
                <p className="opacity-80 text-sm">Séance du {format(new Date(), 'dd MMMM yyyy', { locale: fr })}</p>
              </div>
            </div>
          )}

          {view === 'attendance' && (
            <div className="space-y-6 pb-20">
              <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-4">
                  <button onClick={() => { const d = new Date(attendanceDate); d.setDate(d.getDate() - 1); setAttendanceDate(d); }} className="p-2 bg-gray-100 rounded-lg"><ChevronLeft size={20}/></button>
                  <input type="date" value={format(attendanceDate, 'yyyy-MM-dd')} onChange={e => setAttendanceDate(parseISO(e.target.value))} className="font-bold outline-none" />
                  <button onClick={() => { const d = new Date(attendanceDate); d.setDate(d.getDate() + 1); setAttendanceDate(d); }} className="p-2 bg-gray-100 rounded-lg"><ChevronRight size={20}/></button>
                </div>
                <div className="relative w-full md:w-64">
                  <Search size={18} className="absolute left-3 top-3 text-gray-300" />
                  <input type="text" placeholder="Rechercher..." value={attendanceSearch} onChange={e => setAttendanceSearch(e.target.value)} className="w-full pl-10 p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm" />
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {members.filter(m => m.name.toLowerCase().includes(attendanceSearch.toLowerCase())).map(m => (
                  <div key={m.id} className="p-4 flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-4 w-full">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center font-bold text-blue-600">{m.name.charAt(0)}</div>
                      <div>
                        <p className="font-bold">{m.name}</p>
                        <p className="text-[10px] text-gray-400 uppercase">{m.faculty} • {m.level}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 bg-gray-50 p-1 rounded-xl w-full sm:w-auto">
                      {['Présent', 'Retard', 'Absent', 'Excusé'].map(s => (
                        <button key={s} onClick={() => setAttendance({...attendance, [m.id]: s})} className={`flex-1 px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition ${attendance[m.id] === s ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}>
                          {s.charAt(0)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={saveAttendance} disabled={saving} className="fixed bottom-24 md:bottom-10 left-1/2 -translate-x-1/2 w-[90%] max-w-sm bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-xl flex items-center justify-center gap-3 active:scale-95 transition">
                {saving ? <Loader2 className="animate-spin" size={20}/> : <Save size={20} />} Enregistrer l'appel
              </button>
            </div>
          )}

          {view === 'history' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Historique</h2>
                <button onClick={generatePDF} className="flex items-center gap-2 p-2 text-blue-600 font-bold bg-blue-50 rounded-lg text-sm"><FileDown size={18}/> PDF</button>
              </div>
              <div className="space-y-4">
                {[...new Set(history.map(h => h.date))].sort((a,b) => new Date(b) - new Date(a)).map(date => (
                  <div key={date} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-3">{format(parseISO(date), 'EEEE d MMMM yyyy', { locale: fr })}</p>
                    <div className="flex flex-wrap gap-2">
                      {history.filter(h => h.date === date).map(h => (
                        <div key={h.id} className={`px-3 py-1.5 rounded-full text-[10px] font-bold border ${h.status === 'Présent' ? 'bg-green-50 text-green-700 border-green-100' : h.status === 'Absent' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
                          {h.members?.name}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === 'mgmt' && (
            <div className="space-y-6">
              <div className="flex bg-gray-100 p-1 rounded-xl">
                <button onClick={() => setMgmtTab('members')} className={`flex-1 py-3 rounded-lg text-xs font-bold transition ${mgmtTab === 'members' ? 'bg-white shadow-sm' : 'text-gray-400'}`}>MEMBRES</button>
                <button onClick={() => setMgmtTab('sessions')} className={`flex-1 py-3 rounded-lg text-xs font-bold transition ${mgmtTab === 'sessions' ? 'bg-white shadow-sm' : 'text-gray-400'}`}>SESSIONS</button>
                {profile?.role === 'coordinateur' && <button onClick={() => setMgmtTab('users')} className={`flex-1 py-3 rounded-lg text-xs font-bold transition ${mgmtTab === 'users' ? 'bg-white shadow-sm' : 'text-gray-400'}`}>ADMIN</button>}
              </div>

              {mgmtTab === 'members' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button onClick={() => { const name = window.prompt("Nom du membre ?"); if(name) supabase.from('members').insert([{name, kourel_id: selectedKourel.id}]).then(() => loadKourelData(selectedKourel.id)); }} className="p-6 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 font-bold flex flex-col items-center gap-2 hover:border-blue-500 hover:text-blue-500 transition">
                    <Plus size={24} /> AJOUTER UN MEMBRE
                  </button>
                  {allMembers.map(m => (
                    <div key={m.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
                      <div><p className="font-bold">{m.name}</p><p className="text-[10px] text-gray-400">{m.faculty}</p></div>
                      <div className="flex gap-2">
                        {m.phone && <a href={`tel:${m.phone}`} className="p-2 text-blue-500 bg-blue-50 rounded-lg"><Phone size={16}/></a>}
                        <button onClick={async () => { if(window.confirm('Désactiver ?')) { await supabase.from('members').update({active: !m.active}).eq('id', m.id); loadKourelData(selectedKourel.id); }}} className={`p-2 rounded-lg ${m.active ? 'text-orange-500 bg-orange-50' : 'text-green-500 bg-green-50'}`}><Users size={16}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {mgmtTab === 'sessions' && (
                <div className="space-y-4">
                  {[...new Set(history.map(h => h.date))].map(date => (
                    <div key={date} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
                      <p className="font-bold">{format(parseISO(date), 'dd MMMM yyyy', { locale: fr })}</p>
                      <button onClick={() => deleteSession(date)} className="p-2 text-red-500 bg-red-50 rounded-lg"><Trash2 size={18}/></button>
                    </div>
                  ))}
                </div>
              )}

              {mgmtTab === 'users' && (
                <div className="space-y-4">
                  {allProfiles.map(p => (
                    <div key={p.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-3">
                      <div className="flex justify-between items-center">
                        <p className="font-bold text-xs truncate max-w-[200px]">{p.email}</p>
                        <span className={`text-[8px] font-bold px-2 py-1 rounded-full uppercase ${p.role === 'coordinateur' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>{p.role}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select value={p.role} onChange={(e) => handleUpdateProfile(p.id, e.target.value, p.kourel_id)} className="bg-gray-50 p-2 rounded-lg text-[10px] font-bold outline-none">
                          <option value="surveillant">SURVEILLANT</option>
                          <option value="coordinateur">COORDINATEUR</option>
                        </select>
                        <select value={p.kourel_id || ""} onChange={(e) => handleUpdateProfile(p.id, p.role, e.target.value || null)} className="bg-gray-50 p-2 rounded-lg text-[10px] font-bold outline-none">
                          <option value="">SANS KUREL</option>
                          {kourels.map(k => <option key={k.id} value={k.id}>{k.name.slice(0, 15)}...</option>)}
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

      {/* MOBILE TAB BAR */}
      {user && view !== 'login' && view !== 'selection' && (
        <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-gray-100 h-16 flex items-center justify-around px-2 z-40">
          <button onClick={() => setView('dashboard')} className={`p-2 rounded-xl transition ${view === 'dashboard' ? 'text-blue-600 bg-blue-50' : 'text-gray-400'}`}><LayoutDashboard size={22} /></button>
          <button onClick={() => setView('attendance')} className={`p-2 rounded-xl transition ${view === 'attendance' ? 'text-blue-600 bg-blue-50' : 'text-gray-400'}`}><CheckCircle2 size={22} /></button>
          <button onClick={() => setView('history')} className={`p-2 rounded-xl transition ${view === 'history' ? 'text-blue-600 bg-blue-50' : 'text-gray-400'}`}><History size={22} /></button>
          <button onClick={() => setView('mgmt')} className={`p-2 rounded-xl transition ${view === 'mgmt' ? 'text-blue-600 bg-blue-50' : 'text-gray-400'}`}><Settings size={22} /></button>
        </nav>
      )}
    </div>
  );
}

export default App;
