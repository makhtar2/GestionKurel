import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { 
  LayoutGrid, CheckCircle2, ClipboardList, ShieldCheck, LogOut, 
  UserPlus, Save, Loader2, ChevronLeft, ChevronRight, Search, 
  MessageCircle, Phone, FileDown, Trash2, Users, MoreHorizontal, X, Plus
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
      member_id: mId, status, date: dateStr
    }));
    const { error } = await supabase.from('attendance').insert(records);
    if (!error) { showToast('Pointage validé'); await loadKourelData(selectedKourel.id); setView('dashboard'); }
    else { showToast('Erreur lors de l\'enregistrement', 'error'); }
    setSaving(false);
  };

  const handleUpdateProfile = async (pId, newRole, newKourelId) => {
    await supabase.from('profiles').update({ role: newRole, kourel_id: newKourelId }).eq('id', pId);
    await fetchGlobalStats();
    showToast('Compte mis à jour');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) await fetchProfile(data.user.id);
    else { showToast('Identifiants incorrects', 'error'); setLoading(false); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const generatePDF = (date) => {
    const doc = new jsPDF();
    const data = date ? history.filter(h => h.date === date) : history;
    doc.text(`Rapport de Presence - ${selectedKourel.name}`, 14, 20);
    doc.autoTable({ 
      startY: 30, 
      head: [['Nom', 'Statut', 'Date']], 
      body: data.map(h => [h.members?.name, h.status, h.date]) 
    });
    doc.save(`Rapport_${selectedKourel.name}_${date || 'global'}.pdf`);
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-white"><Loader2 className="animate-spin text-indigo-600" size={40} /></div>;

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-[#111827] font-sans selection:bg-indigo-100">
      
      {/* HEADER FIXE (Desktop & Mobile) */}
      {user && (
        <header className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 py-4 md:px-8">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-indigo-200 shadow-lg">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h1 className="text-lg font-bold leading-tight">Saytu Kurel</h1>
                {selectedKourel && <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{selectedKourel.name}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
               {profile?.role === 'coordinateur' && view !== 'selection' && (
                 <button onClick={() => setView('selection')} className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"><LayoutGrid size={20}/></button>
               )}
               <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><LogOut size={20}/></button>
            </div>
          </div>
        </header>
      )}

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl text-white font-bold text-sm animate-in slide-in-from-bottom-5 ${toast.type === 'success' ? 'bg-gray-900' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <main className={`max-w-7xl mx-auto ${user ? 'p-4 md:p-8 pb-32' : ''}`}>
        
        {/* LOGIN */}
        {view === 'login' && (
          <div className="min-h-screen flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md space-y-8 bg-white p-10 rounded-[32px] shadow-sm border border-gray-50">
              <div className="text-center space-y-3">
                <div className="w-20 h-20 bg-indigo-600 rounded-3xl mx-auto flex items-center justify-center text-white shadow-2xl shadow-indigo-200">
                  <ShieldCheck size={40} />
                </div>
                <h1 className="text-3xl font-black tracking-tight">Bienvenue</h1>
                <p className="text-gray-400 font-medium">Connectez-vous à votre compte Saytu</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-4">Email</label>
                  <input type="email" placeholder="nom@exemple.com" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-4 bg-gray-50 border-none rounded-2xl outline-none focus:ring-2 ring-indigo-500 transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-4">Mot de passe</label>
                  <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-4 bg-gray-50 border-none rounded-2xl outline-none focus:ring-2 ring-indigo-500 transition-all" />
                </div>
                <button type="submit" className="w-full py-5 bg-gray-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-black transition-all shadow-lg active:scale-[0.98]">Se connecter</button>
              </form>
            </div>
          </div>
        )}

        {/* SELECTION KUREL */}
        {view === 'selection' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="space-y-2">
              <h2 className="text-3xl font-black tracking-tight">Kourels</h2>
              <p className="text-gray-400 font-medium">Sélectionnez un groupe pour voir les détails</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {kourels.map(k => (
                <div key={k.id} onClick={() => { setSelectedKourel(k); loadKourelData(k.id); setView('dashboard'); }} className="group bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all cursor-pointer relative overflow-hidden">
                  <div className="relative z-10 space-y-4">
                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 font-black group-hover:bg-indigo-600 group-hover:text-white transition-colors">{k.name.charAt(0)}</div>
                    <div>
                      <h3 className="font-bold text-xl group-hover:text-indigo-600 transition-colors">{k.name}</h3>
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mt-1">{k.location}</p>
                    </div>
                    <div className="flex justify-between items-end pt-4">
                      <span className="text-3xl font-black text-indigo-600">{kourelStats[k.id]?.rate}%</span>
                      <span className="text-[10px] font-black uppercase text-gray-300">Taux de présence</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DASHBOARD */}
        {selectedKourel && view === 'dashboard' && (
          <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { label: 'Séances', value: stats.totalSessions, color: 'text-gray-900', bg: 'bg-white' },
                { label: 'Présence', value: `${stats.globalRate}%`, color: 'text-emerald-600', bg: 'bg-white' },
                { label: 'Membres', value: members.length, color: 'text-indigo-600', bg: 'bg-white' },
              ].map((s, i) => (
                <div key={i} className={`${s.bg} p-8 rounded-[32px] border border-gray-100 shadow-sm flex flex-col items-center justify-center space-y-1`}>
                  <p className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">{s.label}</p>
                  <p className={`text-4xl font-black ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-gray-900 p-10 rounded-[40px] text-white shadow-2xl shadow-indigo-100 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden" onClick={() => setView('attendance')}>
              <div className="relative z-10 space-y-2 text-center md:text-left">
                <h3 className="text-2xl font-black tracking-tight">Appel du Jour</h3>
                <p className="text-gray-400 font-medium">Session du {format(new Date(), 'EEEE d MMMM', { locale: fr })}</p>
              </div>
              <button className="relative z-10 bg-white text-black px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all">Démarrer maintenant</button>
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full -mr-20 -mt-20 blur-3xl"></div>
            </div>
          </div>
        )}

        {/* POINTAGE (ATTENDANCE) */}
        {view === 'attendance' && (
          <div className="space-y-6 pb-32 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex items-center bg-white p-2 rounded-2xl border border-gray-100 shadow-sm">
                <button onClick={() => { const d = new Date(attendanceDate); d.setDate(d.getDate()-1); setAttendanceDate(d); }} className="p-3 hover:bg-gray-50 rounded-xl transition-colors"><ChevronLeft size={20}/></button>
                <div className="px-6 text-center">
                  <p className="text-[8px] font-black uppercase text-gray-400">Date de session</p>
                  <input type="date" value={format(attendanceDate, 'yyyy-MM-dd')} onChange={e => setAttendanceDate(parseISO(e.target.value))} className="font-black text-sm bg-transparent outline-none" />
                </div>
                <button onClick={() => { const d = new Date(attendanceDate); d.setDate(d.getDate()+1); setAttendanceDate(d); }} className="p-3 hover:bg-gray-50 rounded-xl transition-colors"><ChevronRight size={20}/></button>
              </div>
              <div className="relative w-full md:w-80">
                <Search className="absolute left-4 top-4 text-gray-300" size={20} />
                <input type="text" placeholder="Trouver un membre..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-4 pl-12 bg-white border border-gray-100 rounded-2xl outline-none focus:ring-2 ring-indigo-500 shadow-sm transition-all" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {members.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase())).map(m => (
                <div key={m.id} className="bg-white p-4 rounded-[24px] border border-gray-50 shadow-sm flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm transition-all ${
                      attendance[m.id] === 'Présent' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-gray-50 text-gray-400'
                    }`}>{m.name.charAt(0)}</div>
                    <div className="truncate">
                      <p className="font-bold text-sm truncate">{m.name}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{m.level}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 bg-gray-50 p-1.5 rounded-2xl">
                    {['A', 'R', 'E', 'P'].map((label, idx) => {
                      const status = ['Absent', 'Retard', 'Excusé', 'Présent'][idx];
                      const colors = ['text-red-500', 'text-orange-500', 'text-blue-500', 'text-indigo-600'];
                      return (
                        <button key={label} onClick={() => setAttendance({...attendance, [m.id]: status})} className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs transition-all ${
                          attendance[m.id] === status ? `bg-white shadow-md ${colors[idx]}` : 'text-gray-300 hover:text-gray-400'
                        }`}>{label}</button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="fixed bottom-24 md:bottom-10 left-0 right-0 px-4 z-50">
              <button onClick={saveAttendance} disabled={saving} className="w-full max-w-md mx-auto py-5 bg-indigo-600 text-white rounded-3xl font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl shadow-indigo-200 flex items-center justify-center gap-3 active:scale-95 transition-all">
                {saving ? <Loader2 className="animate-spin" size={20}/> : <Save size={20}/>}
                Valider la séance
              </button>
            </div>
          </div>
        )}

        {/* HISTORIQUE */}
        {view === 'history' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-3xl font-black tracking-tight">Historique</h2>
                <p className="text-gray-400 font-medium">Toutes les sessions passées</p>
              </div>
              <button onClick={() => generatePDF()} className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center gap-2 font-black text-[10px] tracking-widest uppercase"><FileDown size={20}/> Global</button>
            </div>
            
            <div className="space-y-4">
              {[...new Set(history.map(h => h.date))].sort((a,b) => new Date(b)-new Date(a)).map(date => (
                <div key={date} className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm space-y-6">
                  <div className="flex justify-between items-center pb-4 border-b border-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse"></div>
                      <p className="font-black text-sm uppercase tracking-wider">{format(parseISO(date), 'EEEE d MMMM yyyy', { locale: fr })}</p>
                    </div>
                    <button onClick={() => generatePDF(date)} className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"><FileDown size={20}/></button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {history.filter(h => h.date === date).map(h => (
                      <div key={h.id} className={`px-4 py-2 rounded-xl text-[10px] font-bold border transition-all ${
                        h.status === 'Présent' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                        h.status === 'Absent' ? 'bg-red-50 text-red-700 border-red-100' : 
                        'bg-orange-50 text-orange-700 border-orange-100'
                      }`}>{h.members?.name}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* GESTION (MGMT) */}
        {view === 'mgmt' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm max-w-sm">
              {['members', 'sessions', 'users'].filter(t => profile?.role === 'coordinateur' || t !== 'users').map(tab => (
                <button key={tab} onClick={() => setMgmtTab(tab)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mgmtTab === tab ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-gray-400'}`}>{tab}</button>
              ))}
            </div>

            {mgmtTab === 'members' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={() => { const name = window.prompt("Nom complet ?"); if(name) supabase.from('members').insert([{name, kourel_id: selectedKourel.id}]).then(() => loadKourelData(selectedKourel.id)); }} className="p-10 border-2 border-dashed border-gray-200 rounded-[32px] text-gray-400 font-black text-xs uppercase tracking-widest flex flex-col items-center gap-4 hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50/30 transition-all">
                  <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center"><UserPlus size={24} /></div>
                  Ajouter un membre
                </button>
                {allMembers.map(m => (
                  <div key={m.id} className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex justify-between items-center group">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 truncate">{m.name}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{m.faculty || 'Sans Faculté'}</p>
                    </div>
                    <div className="flex items-center gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                      {m.phone && <a href={`tel:${m.phone}`} className="p-3 text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-600 hover:text-white transition-all"><Phone size={18}/></a>}
                      <button onClick={async () => { if(window.confirm('Changer le statut ?')) { await supabase.from('members').update({active: !m.active}).eq('id', m.id); loadKourelData(selectedKourel.id); }}} className={`p-3 rounded-xl transition-all ${m.active ? 'text-orange-500 bg-orange-50 hover:bg-orange-500 hover:text-white' : 'text-green-500 bg-green-50 hover:bg-green-500 hover:text-white'}`}><Users size={18}/></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {mgmtTab === 'sessions' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[...new Set(history.map(h => h.date))].map(date => (
                  <div key={date} className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex justify-between items-center">
                    <p className="font-bold">{format(parseISO(date), 'd MMMM yyyy', { locale: fr })}</p>
                    <button onClick={() => deleteSession(date)} className="p-3 text-red-500 bg-red-50 rounded-xl hover:bg-red-500 hover:text-white transition-all"><Trash2 size={18}/></button>
                  </div>
                ))}
              </div>
            )}

            {mgmtTab === 'users' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {allProfiles.map(p => (
                  <div key={p.id} className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm space-y-6">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <p className="font-black text-xs truncate max-w-[200px]">{p.email}</p>
                        <span className={`inline-block text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${p.role === 'coordinateur' ? 'bg-gray-900 text-white' : 'bg-indigo-50 text-indigo-600'}`}>{p.role}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <select value={p.role} onChange={(e) => handleUpdateProfile(p.id, e.target.value, p.kourel_id)} className="w-full bg-gray-50 p-4 rounded-2xl text-[10px] font-black uppercase outline-none focus:ring-2 ring-indigo-500 transition-all">
                        <option value="surveillant">SURVEILLANT</option>
                        <option value="coordinateur">COORDINATEUR</option>
                      </select>
                      <select value={p.kourel_id || ""} onChange={(e) => handleUpdateProfile(p.id, p.role, e.target.value || null)} className="w-full bg-gray-50 p-4 rounded-2xl text-[10px] font-black uppercase outline-none focus:ring-2 ring-indigo-500 transition-all">
                        <option value="">SANS KUREL (AUCUN ACCÈS)</option>
                        {kourels.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* NAVIGATION MOBILE (Tab Bar) */}
      {user && view !== 'login' && view !== 'selection' && (
        <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white/90 backdrop-blur-xl border-t border-gray-100 h-20 flex items-center justify-around px-6 z-[60]">
          {[
            { id: 'dashboard', icon: LayoutGrid },
            { id: 'attendance', icon: CheckCircle2 },
            { id: 'history', icon: ClipboardList },
            { id: 'mgmt', icon: Settings },
          ].map(item => (
            <button key={item.id} onClick={() => setView(item.id)} className={`p-3 rounded-2xl transition-all ${view === item.id ? 'text-indigo-600 bg-indigo-50 shadow-sm' : 'text-gray-300'}`}>
              <item.icon size={24} strokeWidth={view === item.id ? 2.5 : 2} />
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

export default App;
