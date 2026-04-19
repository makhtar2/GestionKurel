import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { 
  LayoutGrid, CheckCircle2, ClipboardList, Settings, LogOut, 
  Plus, Save, Loader2, ChevronLeft, ChevronRight, Search, 
  Phone, FileDown, Trash2, Users, X
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
    const records = Object.entries(attendance).map(([mId, status]) => ({ member_id: mId, status, date: dateStr }));
    const { error } = await supabase.from('attendance').insert(records);
    if (!error) { showToast('Enregistré'); loadKourelData(selectedKourel.id); setView('dashboard'); }
    setSaving(false);
  };

  const deleteSession = async (date) => {
    if (!window.confirm('Supprimer ?')) return;
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
    if (!error) fetchProfile(data.user.id);
    else { showToast('Erreur', 'error'); setLoading(false); }
  };

  const handleLogout = () => { supabase.auth.signOut().then(() => window.location.reload()); };

  const generatePDF = (date) => {
    const doc = new jsPDF();
    const data = date ? history.filter(h => h.date === date) : history;
    doc.text(`Rapport - ${selectedKourel.name}`, 14, 20);
    autoTable(doc, { 
      startY: 25, 
      head: [['Nom', 'Statut', 'Date']], 
      body: data.map(h => [h.members?.name, h.status, h.date]),
      headStyles: { fillColor: [79, 70, 229] }
    });
    doc.save('rapport.pdf');
  };

  if (loading) return <div className="h-screen flex items-center justify-center font-bold">Chargement...</div>;

  return (
    <div className="min-h-screen bg-white text-gray-800 font-sans">
      
      {/* TOAST */}
      {toast && (
        <div className={`fixed top-0 left-0 w-full p-4 text-center text-white font-bold z-[100] ${toast.type === 'success' ? 'bg-indigo-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {user && (
        <nav className="bg-gray-900 text-white p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="font-black tracking-tighter text-xl">SAYTU</span>
            {selectedKourel && <span className="text-xs bg-indigo-600 px-2 py-0.5 rounded font-bold uppercase">{selectedKourel.name}</span>}
          </div>
          <div className="flex gap-4">
            {profile?.role === 'coordinateur' && view !== 'selection' && <button onClick={() => setView('selection')}><LayoutGrid size={20}/></button>}
            <button onClick={handleLogout}><LogOut size={20}/></button>
          </div>
        </nav>
      )}

      <main className="max-w-4xl mx-auto p-4 md:p-8">
        
        {view === 'login' && (
          <div className="pt-20 max-w-sm mx-auto space-y-6">
            <h1 className="text-3xl font-black">Connexion</h1>
            <form onSubmit={handleLogin} className="space-y-4">
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 border-2 border-gray-200 rounded outline-none focus:border-indigo-600" />
              <input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 border-2 border-gray-200 rounded outline-none focus:border-indigo-600" />
              <button className="w-full bg-indigo-600 text-white p-4 font-bold uppercase tracking-widest">Entrer</button>
            </form>
          </div>
        )}

        {view === 'selection' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold border-b-4 border-indigo-600 inline-block">Groupes Kourels</h2>
            <div className="grid gap-2">
              {kourels.map(k => (
                <div key={k.id} onClick={() => { setSelectedKourel(k); loadKourelData(k.id); setView('dashboard'); }} className="p-4 border-2 border-gray-100 flex justify-between items-center cursor-pointer hover:bg-gray-50">
                  <span className="font-bold">{k.name}</span>
                  <span className="bg-gray-100 px-3 py-1 font-black text-indigo-600">{kourelStats[k.id]?.rate}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedKourel && (
          <>
            {view === 'dashboard' && (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-2">
                  <div className="border-2 border-gray-100 p-4 text-center">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Sessions</p>
                    <p className="text-2xl font-black">{stats.totalSessions}</p>
                  </div>
                  <div className="border-2 border-gray-100 p-4 text-center">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Présence</p>
                    <p className="text-2xl font-black text-green-600">{stats.globalRate}%</p>
                  </div>
                  <div className="border-2 border-gray-100 p-4 text-center">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Membres</p>
                    <p className="text-2xl font-black text-indigo-600">{members.length}</p>
                  </div>
                </div>
                <button onClick={() => setView('attendance')} className="w-full bg-indigo-600 text-white p-6 font-black text-xl uppercase">Faire l'appel</button>
              </div>
            )}

            {view === 'attendance' && (
              <div className="space-y-4 pb-20">
                <div className="flex gap-2 items-center justify-between border-b-2 border-gray-100 pb-4">
                  <div className="flex items-center gap-2">
                    <button onClick={() => { const d = new Date(attendanceDate); d.setDate(d.getDate()-1); setAttendanceDate(d); }} className="p-2 border"><ChevronLeft size={18}/></button>
                    <input type="date" value={format(attendanceDate, 'yyyy-MM-dd')} onChange={e => setAttendanceDate(parseISO(e.target.value))} className="font-bold text-xs" />
                    <button onClick={() => { const d = new Date(attendanceDate); d.setDate(d.getDate()+1); setAttendanceDate(d); }} className="p-2 border"><ChevronRight size={18}/></button>
                  </div>
                  <input type="text" placeholder="Filtrer..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="p-2 border-2 border-gray-100 text-xs w-32" />
                </div>
                <div className="divide-y">
                  {members.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase())).map(m => (
                    <div key={m.id} className="py-3 flex justify-between items-center gap-2">
                      <span className="font-bold text-sm truncate">{m.name}</span>
                      <div className="flex gap-1">
                        {['A', 'R', 'E', 'P'].map((l, i) => {
                          const s = ['Absent', 'Retard', 'Excusé', 'Présent'][i];
                          const active = attendance[m.id] === s;
                          return (
                            <button key={l} onClick={() => setAttendance({...attendance, [m.id]: s})} className={`w-8 h-8 font-black text-[10px] border ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-300 border-gray-100'}`}>{l}</button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={saveAttendance} className="fixed bottom-20 left-0 w-full bg-indigo-600 text-white p-5 font-black uppercase tracking-widest">Enregistrer la séance</button>
              </div>
            )}

            {view === 'history' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold">Sessions</h2>
                  <button onClick={() => generatePDF()} className="text-[10px] font-bold border-2 border-indigo-600 px-3 py-1">EXPORT GLOBAL</button>
                </div>
                {[...new Set(history.map(h => h.date))].sort((a,b) => new Date(b)-new Date(a)).map(date => (
                  <div key={date} className="p-4 border-2 border-gray-50 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-sm">{format(parseISO(date), 'dd/MM/yyyy')}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">{history.filter(h => h.date === date).length} membres</p>
                    </div>
                    <button onClick={() => generatePDF(date)} className="p-2 text-indigo-600"><FileDown size={20}/></button>
                  </div>
                ))}
              </div>
            )}

            {view === 'mgmt' && (
              <div className="space-y-6">
                <div className="flex border-b-2 border-gray-100">
                  {['members', 'sessions', 'users'].filter(t => profile?.role === 'coordinateur' || t !== 'users').map(tab => (
                    <button key={tab} onClick={() => setMgmtTab(tab)} className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest ${mgmtTab === tab ? 'border-b-4 border-indigo-600 text-indigo-600' : 'text-gray-400'}`}>{tab}</button>
                  ))}
                </div>
                {mgmtTab === 'members' && (
                  <div className="grid gap-2">
                    <button onClick={() => { const n = window.prompt("Nom ?"); if(n) supabase.from('members').insert([{name:n, kourel_id:selectedKourel.id}]).then(()=>loadKourelData(selectedKourel.id)); }} className="p-4 border-2 border-dashed font-bold text-gray-400">+ Ajouter un membre</button>
                    {allMembers.map(m => (
                      <div key={m.id} className="p-3 border flex justify-between items-center">
                        <span className="font-bold text-sm">{m.name}</span>
                        <div className="flex gap-2">
                          {m.phone && <a href={`tel:${m.phone}`} className="p-1 border text-indigo-600"><Phone size={14}/></a>}
                          <button onClick={async () => { await supabase.from('members').update({active: !m.active}).eq('id', m.id); loadKourelData(selectedKourel.id); }} className={`p-1 border ${m.active ? 'text-orange-600' : 'text-green-600'}`}><Users size={14}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {mgmtTab === 'sessions' && (
                  <div className="grid gap-2">
                    {[...new Set(history.map(h => h.date))].map(date => (
                      <div key={date} className="p-3 border flex justify-between items-center">
                        <span className="font-bold text-xs">{date}</span>
                        <button onClick={() => deleteSession(date)} className="text-red-600"><Trash2 size={16}/></button>
                      </div>
                    ))}
                  </div>
                )}
                {mgmtTab === 'users' && (
                  <div className="grid gap-2">
                    {allProfiles.map(p => (
                      <div key={p.id} className="p-3 border space-y-2">
                        <p className="font-bold text-xs">{p.email}</p>
                        <div className="flex gap-2">
                          <select value={p.role} onChange={(e)=>handleUpdateProfile(p.id, e.target.value, p.kourel_id)} className="text-[10px] border p-1 font-bold">
                            <option value="surveillant">SURVEILLANT</option>
                            <option value="coordinateur">COORDINATEUR</option>
                          </select>
                          <select value={p.kourel_id || ""} onChange={(e)=>handleUpdateProfile(p.id, p.role, e.target.value || null)} className="text-[10px] border p-1 font-bold max-w-[150px]">
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

      {user && view !== 'selection' && (
        <nav className="fixed bottom-0 left-0 w-full bg-white border-t-2 border-gray-100 h-16 flex justify-around items-center z-50">
          <button onClick={() => setView('dashboard')} className={view === 'dashboard' ? 'text-indigo-600' : 'text-gray-300'}><LayoutGrid size={24}/></button>
          <button onClick={() => setView('attendance')} className={view === 'attendance' ? 'text-indigo-600' : 'text-gray-300'}><CheckCircle2 size={24}/></button>
          <button onClick={() => setView('history')} className={view === 'history' ? 'text-indigo-600' : 'text-gray-300'}><ClipboardList size={24}/></button>
          <button onClick={() => setView('mgmt')} className={view === 'mgmt' ? 'text-indigo-600' : 'text-gray-300'}><Settings size={24}/></button>
        </nav>
      )}
    </div>
  );
}

export default App;
