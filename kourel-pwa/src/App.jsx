import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, CheckCircle2, History, UserCheck, UserX, Clock, 
  ChevronRight, Save, Loader2, Calendar, Users, Plus, X, 
  FileDown, Phone, AlertTriangle, Building2, MapPin, GraduationCap, 
  ArrowLeft, LogOut, Lock, Mail, MessageSquare, CalendarDays,
  Settings, Pencil, Trash2, Eye, EyeOff, BarChart3, MessageCircle, ChevronLeft, Search
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState('loading'); 
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
  const [kourelStats, setKourelsStats] = useState({}); // Stats globales pour coordo
  const [toast, setToast] = useState(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showImportCSV, setShowImportCSV] = useState(false);


  const handleCSVImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSaving(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      const lines = text.split('\n').filter(l => l.trim());
      const newMembers = lines.slice(1).map(line => {
        const [name, phone, faculty, level] = line.split(',').map(s => s.trim());
        return { name, phone, faculty, level, kourel_id: selectedKourel.id, active: true };
      }).filter(m => m.name);

      if (newMembers.length > 0) {
        const { error } = await supabase.from('members').insert(newMembers);
        if (error) showToast(error.message, 'error');
        else {
          showToast(`${newMembers.length} membres importés`);
          await loadKourelData(selectedKourel.id);
          setShowImportCSV(false);
        }
      }
      setSaving(false);
    };
    reader.readAsText(file);
  };

  const [showAddKourel, setShowAddKourel] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [newMember, setNewMember] = useState({ name: '', phone: '', faculty: '', level: '' });
  const [newKourel, setNewKourel] = useState({ name: '', location: '' });
  const [alerts, setAlerts] = useState([]);
  const [mgmtTab, setMgmtTab] = useState('members');
  const [historyFilters, setHistoryFilters] = useState({ name: '', status: '', date: '' });
  const [historyTab, setHistoryTab] = useState('all'); // all, risk, perfect
  const [attendanceSearch, setAttendanceSearch] = useState('');
  const [selectedMemberDossier, setSelectedMemberDossier] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => { 
    checkUser(); 
    const handleStatusChange = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (online) syncOfflineData();
    };
    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);
    return () => {
      window.removeEventListener('online', handleStatusChange);
      window.removeEventListener('offline', handleStatusChange);
    };
  }, []);

  const syncOfflineData = async () => {
    const pending = JSON.parse(localStorage.getItem('pending_attendance') || '[]');
    if (pending.length === 0) return;

    showToast(`Synchronisation de ${pending.length} appel(s)...`, 'info');
    let successCount = 0;
    
    for (const record of pending) {
      const { error } = await supabase.from('attendance').insert(record.data);
      if (!error) successCount++;
    }

    if (successCount > 0) {
      localStorage.removeItem('pending_attendance');
      showToast(`${successCount} appel(s) synchronisé(s) !`);
      if (selectedKourel) loadKourelData(selectedKourel.id);
    }
  };

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

  // Récupère les stats de tous les kourels pour le coordinateur
  const [allProfiles, setAllProfiles] = useState([]);

  const fetchGlobalStats = async () => {
    const { data: kList } = await supabase.from('kourels').select('*').order('name');
    setKourels(kList || []);
    
    // Charger tous les profils pour la gestion admin
    const { data: pList } = await supabase.from('profiles').select('*');
    setAllProfiles(pList || []);
    
    // Calculer stats rapides... (rest of function)
    const { data: allAtt } = await supabase.from('attendance').select('status, members(kourel_id)');
    const sMap = {};
    (kList || []).forEach(k => {
      const kAtt = allAtt?.filter(a => a.members?.kourel_id === k.id) || [];
      const pres = kAtt.filter(a => ['Présent', 'Retard'].includes(a.status)).length;
      sMap[k.id] = {
        rate: kAtt.length > 0 ? Math.round((pres / kAtt.length) * 100) : 0,
        count: kAtt.length
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
      const pres = aData.filter(d => ['Présent', 'Retard'].includes(d.status)).length;
      setStats({ totalSessions: dates.length, globalRate: aData.length > 0 ? Math.round((pres / aData.length) * 100) : 0 });
      const absCount = {};
      aData.forEach(h => { if (h.status === 'Absent') absCount[h.member_id] = (absCount[h.member_id] || 0) + 1; });
      setAlerts(Object.entries(absCount).filter(([_, c]) => c >= 3).map(([id, count]) => ({ id, count })));
      setHistory(aData.sort((a,b) => new Date(b.date) - new Date(a.date)));
    }
  };

  const saveAttendance = async () => {
    setSaving(true);
    const dateStr = format(attendanceDate, 'yyyy-MM-dd');
    const records = Object.entries(attendance).map(([mId, status]) => ({ 
      member_id: mId, 
      status, 
      date: dateStr, 
      notes: attendanceNotes[mId] || null 
    }));

    if (!isOnline) {
      const pending = JSON.parse(localStorage.getItem('pending_attendance') || '[]');
      pending.push({ date: dateStr, data: records });
      localStorage.setItem('pending_attendance', JSON.stringify(pending));
      showToast('Appel sauvegardé localement (Hors-ligne)');
      await loadKourelData(selectedKourel.id);
      setView('dashboard');
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('attendance').insert(records);
    if (!error) { 
      showToast('Appel synchronisé avec succès'); 
      await loadKourelData(selectedKourel.id); 
      setView('dashboard'); 
    } else {
      showToast(error.message, 'error');
    }
    setSaving(false);
  };

  const deleteSession = async (date) => {
    if (!window.confirm(`Supprimer tout l'appel du ${date} ?`)) return;
    setSaving(true);
    try {
      const mIds = allMembers.map(m => m.id);
      if (mIds.length === 0) throw new Error("Aucun membre trouvé pour ce Kourel");
      
      const { error } = await supabase.from('attendance').delete().eq('date', date).in('member_id', mIds);
      if (error) throw error;
      
      showToast('Session supprimée');
      await loadKourelData(selectedKourel.id);
      if (profile?.role !== 'surveillant') await fetchGlobalStats();
    } catch (e) {
      showToast(e.message, 'error');
    }
    setSaving(false);
  };

  const handleAddOrEditMember = async () => {
    if (!newMember.name.trim()) return;
    setSaving(true);
    const mSync = { name: newMember.name, phone: newMember.phone, faculty: newMember.faculty, level: newMember.level, kourel_id: selectedKourel.id };
    try {
      if (editingMember) { await supabase.from('members').update(mSync).eq('id', editingMember.id); showToast('Mis à jour'); }
      else { await supabase.from('members').insert([mSync]); showToast('Ajouté'); }
      await loadKourelData(selectedKourel.id);
      setShowAddMember(false); setEditingMember(null); setNewMember({ name: '', phone: '', faculty: '', level: '' });
    } catch (e) { showToast(e.message, 'error'); }
    setSaving(false);
  };

  const handleUpdateProfile = async (pId, newRole, newKourelId) => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ role: newRole, kourel_id: newKourelId }).eq('id', pId);
    if (!error) {
      showToast('Profil mis à jour');
      await fetchGlobalStats();
    } else {
      showToast(error.message, 'error');
    }
    setSaving(false);
  };

  const handleCreateKourel = async () => {
    if (!newKourel.name.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('kourels').insert([newKourel]);
      if (error) throw error;
      showToast('Kourel créé');
      await fetchGlobalStats();
      setShowAddKourel(false);
      setNewKourel({ name: '', location: '' });
    } catch (e) { showToast(e.message, 'error'); }
    setSaving(false);
  };

  const toggleMemberStatus = async (m) => {
    await supabase.from('members').update({ active: !m.active }).eq('id', m.id);
    await loadKourelData(selectedKourel.id);
    showToast(m.active ? 'Inactif' : 'Actif');
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const filteredHistory = history.filter(h => 
      (h.members?.name.toLowerCase().includes(historyFilters.name.toLowerCase())) &&
      (historyFilters.status === '' || h.status === historyFilters.status) &&
      (h.date.includes(historyFilters.date))
    );

    // Titre
    doc.setFontSize(22);
    doc.setTextColor(44, 62, 80);
    doc.text(`Rapport de Presence: ${selectedKourel.name}`, 14, 22);
    
    // Sous-titre
    doc.setFontSize(10);
    doc.setTextColor(127, 140, 141);
    doc.text(`Généré le ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: fr })}`, 14, 30);
    
    // Tableau
    const tableData = filteredHistory.map(h => [
      h.members?.name,
      h.status,
      format(parseISO(h.date), 'dd/MM/yyyy'),
      h.notes || ''
    ]);

    doc.autoTable({
      startY: 40,
      head: [['Membre', 'Statut', 'Date', 'Note']],
      body: tableData,
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      styles: { fontSize: 9, cellPadding: 4 }
    });

    doc.save(`Rapport_${selectedKourel.name}_${format(new Date(), 'yyyyMMdd')}.pdf`);
    showToast('Rapport PDF téléchargé');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await fetchProfile(data.user.id);
    } catch (e) { 
      showToast(e.message, 'error'); 
      setLoading(false); 
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSelectedKourel(null);
    setView('login');
    setLoading(false);
  };

  const sessions = [...new Set(history.map(h => h.date))].sort((a,b) => new Date(b) - new Date(a));

  const getWhatsAppLink = (m) => {
    if (!m.phone) return '#';
    const mAbsences = history.filter(h => h.member_id === m.id && h.status === 'Absent').length;
    
    const message = mAbsences > 0 
      ? `Assalamou aleykoum ${m.name}, nous avons constaté ${mAbsences} absence${mAbsences > 1 ? 's' : ''} à votre actif pour le ${selectedKourel.name}. Tout va bien ? Pourriez-vous nous en donner la raison ? Jerejef.`
      : `Assalamou aleykoum ${m.name}, nous faisons le point sur les séances de ${selectedKourel.name}. À bientôt incha'Allah.`;
    
    return `https://wa.me/${m.phone.replace(/\s+/g, '')}?text=${encodeURIComponent(message)}`;
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-white"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

  return (
    <div className="w-full min-h-screen bg-[#F8F9FC] flex font-sans antialiased text-[#1D1D1F]">
      
      {/* SIDEBAR DESKTOP */}
      {user && view !== 'login' && view !== 'selection' && (
        <aside className="hidden md:flex w-72 bg-white border-r border-gray-100 flex-col sticky top-0 h-screen p-8 z-50">
          <div className="mb-12">
            <h1 className="text-2xl font-black tracking-tight text-blue-600">Saytu Kurel</h1>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Tableau de Bord</p>
          </div>
          
          <nav className="flex-1 space-y-2">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['coordinateur', 'surveillant'] },
              { id: 'attendance', label: 'Appel', icon: CheckCircle2, roles: ['coordinateur', 'surveillant'] },
              { id: 'history', label: 'Historique', icon: History, roles: ['coordinateur', 'surveillant'] },
              { id: 'mgmt', label: 'Gestion', icon: Settings, roles: ['coordinateur', 'surveillant'] },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl font-bold text-sm transition-all ${
                  view === item.id ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-gray-400 hover:bg-gray-50'
                }`}
              >
                <item.icon size={20} strokeWidth={2.5} />
                {item.label}
              </button>
            ))}
          </nav>

          <button onClick={handleLogout} className="mt-auto flex items-center gap-4 px-6 py-4 rounded-2xl font-bold text-sm text-red-400 hover:bg-red-50 transition-all">
            <LogOut size={20} strokeWidth={2.5} />
            Déconnexion
          </button>
        </aside>
      )}

      {/* MAIN CONTAINER */}
      <div className={`flex-1 flex flex-col min-h-screen relative ${view === 'login' || view === 'selection' ? 'items-center justify-center' : ''}`}>
        
        <div className={`w-full flex flex-col bg-white min-h-screen shadow-2xl relative overflow-hidden transition-all ${
          view === 'login' || view === 'selection' ? 'max-w-md' : 'md:max-w-none md:shadow-none md:bg-transparent'
        }`}>
          
          {toast && (
            <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-lg border border-gray-100 bg-white flex items-center gap-2 animate-in slide-in-from-top-5">
              <div className={`w-2 h-2 rounded-full ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm font-bold">{toast.msg}</span>
            </div>
          )}

          {/* INDICATEUR HORS-LIGNE */}
          {!isOnline && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-orange-500 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg animate-pulse">
              <Clock size={12} /> Mode Hors-Ligne
            </div>
          )}
        <AnimatePresence mode="wait">
          
          {view === 'login' && (
            <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col px-10 pt-32 space-y-12">
              <div className="text-center">
                <div className="w-20 h-20 bg-blue-500 rounded-3xl mx-auto mb-6 flex items-center justify-center text-white shadow-xl shadow-blue-500/20"><Building2 size={32} /></div>
                <h1 className="text-4xl font-extrabold tracking-tight">Saytu Kurel</h1>
                <p className="text-gray-400 font-medium">Fédération Universitaire</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="w-full bg-gray-50 border-none rounded-2xl p-5 outline-none font-medium" />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Passcode" className="w-full bg-gray-50 border-none rounded-2xl p-5 outline-none font-medium" />
                <button type="submit" className="w-full bg-black text-white py-5 rounded-2xl font-bold active:scale-[0.98] transition-all">Se connecter</button>
              </form>
            </motion.div>
          )}

          {view === 'selection' && (
            <motion.div key="selection" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex-1 overflow-y-auto px-6 pt-16 space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-2xl font-black">Saytu Master</h1>
                  <p className="text-blue-500 font-bold text-xs">Coordination Générale 👑</p>
                </div>
                <button onClick={() => setShowAddKourel(true)} className="p-2.5 bg-blue-500 text-white rounded-xl shadow-lg active:scale-95 transition-all">
                  <Plus size={20} />
                </button>
              </div>
              <div className="space-y-4 pb-24">
                {kourels.map(k => (
                  <div key={k.id} onClick={() => { setSelectedKourel(k); loadKourelData(k.id); setView('dashboard'); }} className="bg-white rounded-[24px] p-4 border border-gray-100 shadow-sm space-y-3 active:bg-gray-50 transition-all">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-500 font-bold text-xs">{k.name.charAt(0)}</div>
                        <div><p className="font-bold text-xs">{k.name}</p><p className="text-[9px] text-gray-400 uppercase font-bold tracking-widest">{k.location}</p></div>
                      </div>
                      <span className="text-sm font-black text-blue-600">{kourelStats[k.id]?.rate}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-50 rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${kourelStats[k.id]?.rate}%` }} className="h-full bg-blue-500" transition={{ duration: 1 }} />
                    </div>
                  </div>
                ))}
                
                <button onClick={handleLogout} className="w-full py-4 bg-red-50 text-red-500 rounded-[20px] font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all mt-4">
                  <LogOut size={16}/> Déconnexion
                </button>
              </div>
            </motion.div>
          )}

          {selectedKourel && view !== 'selection' && view !== 'login' && (
            <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col">
              <header className="px-6 pt-12 pb-4 flex justify-between items-end bg-white/80 backdrop-blur-xl md:backdrop-blur-none md:bg-transparent sticky top-0 z-40 border-b border-gray-50 md:border-none">
                <div>
                  {profile?.role === 'coordinateur' && ( <button onClick={() => { setView('selection'); fetchGlobalStats(); }} className="flex items-center gap-1 text-blue-500 text-[9px] font-bold uppercase mb-1"><ArrowLeft size={10}/> Retour Master</button> )}
                  <h1 className="text-lg md:text-2xl font-black tracking-tight">{selectedKourel.name}</h1>
                  <p className="hidden md:block text-gray-400 font-bold text-xs mt-1">{format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}</p>
                </div>
                <button onClick={() => setView('mgmt')} className="md:hidden p-2.5 bg-gray-50 rounded-xl active:bg-gray-100 transition-all text-gray-400"><Settings size={18}/></button>
              </header>

              <main className="flex-1 overflow-y-auto px-6 py-6 no-scrollbar pb-32 md:pb-8">
                {view === 'dashboard' && (
                  <div className="space-y-6 max-w-5xl">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-blue-50 p-4 rounded-[20px]"><p className="text-[9px] font-bold text-blue-400 uppercase mb-1">Séances</p><p className="text-xl md:text-3xl font-black text-blue-600">{stats.totalSessions}</p></div>
                      <div className="bg-green-50 p-4 rounded-[20px]"><p className="text-[9px] font-bold text-green-400 uppercase mb-1">Assiduité</p><p className="text-xl md:text-3xl font-black text-green-600">{stats.globalRate}%</p></div>
                      <div className="hidden lg:block bg-purple-50 p-4 rounded-[20px]"><p className="text-[9px] font-bold text-purple-400 uppercase mb-1">Membres</p><p className="text-xl md:text-3xl font-black text-purple-600">{members.length}</p></div>
                      <div className="hidden lg:block bg-orange-50 p-4 rounded-[20px]"><p className="text-[9px] font-bold text-orange-400 uppercase mb-1">Activité</p><p className="text-xl md:text-3xl font-black text-orange-600">Stable</p></div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      {alerts.length > 0 && (
                        <div className="bg-red-50 p-6 rounded-[28px] border border-red-100 h-fit">
                          <div className="flex items-center gap-2 mb-4 text-red-600 font-bold text-[9px] uppercase tracking-widest"><AlertTriangle size={16}/> Discipline & Alertes</div>
                          <div className="space-y-2">
                            {alerts.slice(0,5).map(a => {
                              const member = members.find(m => m.id === a.id);
                              return (
                                <div key={a.id} className="flex justify-between items-center bg-white p-3 rounded-2xl shadow-sm">
                                  <div><p className="font-bold text-gray-800 text-xs">{member?.name}</p><p className="text-[8px] text-red-400 font-bold uppercase">{a.count} absences</p></div>
                                  <div className="flex gap-2">
                                    {member?.phone && (
                                      <a href={getWhatsAppLink(member)} target="_blank" rel="noreferrer" className="p-2 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600 transition-all"><MessageCircle size={14}/></a>
                                    )}
                                    <a href={`tel:${member?.phone}`} className="p-2 bg-blue-500 text-white rounded-lg shadow-md hover:bg-blue-600 transition-all"><Phone size={14}/></a>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div onClick={() => setView('attendance')} className="bg-black p-8 rounded-[32px] text-white shadow-xl relative overflow-hidden active:scale-[0.98] transition-all cursor-pointer flex flex-col justify-center min-h-[200px]">
                        <h3 className="text-xl md:text-2xl font-black mb-2 tracking-tight">Lancer la séance</h3>
                        <p className="text-gray-500 text-[10px] font-medium mb-6">Pointage du {format(new Date(), 'dd MMMM', { locale: fr })}</p>
                        <div className="inline-flex bg-white text-black px-6 py-2 rounded-full font-black text-[9px] uppercase tracking-widest w-fit">Démarrer</div>
                        <CheckCircle2 className="absolute -right-6 -bottom-6 w-32 h-32 text-white/5" />
                      </div>
                    </div>
                  </div>
                )}

                {view === 'attendance' && (
                  <div className="space-y-6 max-w-5xl pb-40">
                    <div className="sticky top-[60px] md:top-0 z-30 bg-[#F8F9FC]/90 backdrop-blur-xl py-4 space-y-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center shadow-lg"><CheckCircle2 size={18}/></div>
                          <div>
                            <h2 className="text-xl font-black">Appel de Séance</h2>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{format(attendanceDate, 'EEEE d MMMM', { locale: fr })}</p>
                          </div>
                        </div>

                        <div className={`flex items-center p-1.5 rounded-[20px] border-2 transition-all ${format(attendanceDate, 'yyyy-MM-dd') !== format(new Date(), 'yyyy-MM-dd') ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100 shadow-sm'}`}>
                          <button onClick={() => { const d = new Date(attendanceDate); d.setDate(d.getDate() - 1); setAttendanceDate(d); }} className="p-2 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all text-gray-400"><ChevronLeft size={16}/></button>
                          <div className="px-6 text-center min-w-[120px]">
                            <p className="text-[8px] font-black uppercase text-gray-400 mb-0.5">Date</p>
                            <input type="date" value={format(attendanceDate, 'yyyy-MM-dd')} onChange={e => setAttendanceDate(parseISO(e.target.value))} className="bg-transparent border-none text-xs font-black outline-none uppercase text-center cursor-pointer" />
                          </div>
                          <button onClick={() => { const d = new Date(attendanceDate); d.setDate(d.getDate() + 1); setAttendanceDate(d); }} className="p-2 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all text-gray-400"><ChevronRight size={16}/></button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-around">
                          <div className="text-center"><p className="text-[8px] font-black text-green-400 uppercase">P</p><p className="text-sm font-black">{Object.values(attendance).filter(v => v === 'Présent').length}</p></div>
                          <div className="w-px h-6 bg-gray-100" />
                          <div className="text-center"><p className="text-[8px] font-black text-orange-400 uppercase">R</p><p className="text-sm font-black">{Object.values(attendance).filter(v => v === 'Retard').length}</p></div>
                          <div className="w-px h-6 bg-gray-100" />
                          <div className="text-center"><p className="text-[8px] font-black text-red-400 uppercase">A</p><p className="text-sm font-black">{Object.values(attendance).filter(v => v === 'Absent').length}</p></div>
                          <div className="w-px h-6 bg-gray-100" />
                          <div className="text-center"><p className="text-[8px] font-black text-blue-400 uppercase">E</p><p className="text-sm font-black">{Object.values(attendance).filter(v => v === 'Excusé').length}</p></div>
                        </div>
                        <div className="relative">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                          <input type="text" placeholder="Rechercher..." value={attendanceSearch} onChange={e => setAttendanceSearch(e.target.value)} className="w-full bg-white border border-gray-100 rounded-[20px] pl-12 pr-4 py-3 text-xs font-bold outline-none focus:border-blue-500 shadow-sm" />
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-[28px] border border-gray-100 shadow-sm overflow-hidden">
                      <div className="divide-y divide-gray-50">
                        {members
                          .filter(m => m.name.toLowerCase().includes(attendanceSearch.toLowerCase()))
                          .map(m => (
                          <div key={m.id} className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-gray-50/50 transition-all group">
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs transition-all ${
                                attendance[m.id] === 'Présent' ? 'bg-green-500 text-white shadow-md' :
                                attendance[m.id] === 'Absent' ? 'bg-red-500 text-white shadow-md' :
                                attendance[m.id] === 'Retard' ? 'bg-orange-500 text-white shadow-md' :
                                attendance[m.id] === 'Excusé' ? 'bg-blue-500 text-white shadow-md' :
                                'bg-gray-100 text-gray-300'
                              }`}>{m.name.charAt(0)}</div>
                              <div>
                                <p className="font-black text-gray-800 text-sm leading-none mb-1">{m.name}</p>
                                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{m.faculty} • {m.level}</p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <div className="flex bg-gray-100 p-1 rounded-[16px] w-fit">
                                {['Présent', 'Retard', 'Absent', 'Excusé'].map(s => (
                                  <button key={s} onClick={() => setAttendance({...attendance, [m.id]: s})} className={`px-4 py-2 rounded-[12px] text-[9px] font-black uppercase transition-all ${attendance[m.id] === s ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-500'}`}>{s.charAt(0)}</button>
                                ))}
                              </div>
                              <button onClick={() => { const note = window.prompt("Note ?", attendanceNotes[m.id] || ""); setAttendanceNotes({...attendanceNotes, [m.id]: note}); }} className={`p-3 rounded-xl transition-all ${attendanceNotes[m.id] ? 'bg-blue-500 text-white shadow-lg' : 'bg-gray-50 text-gray-300 hover:bg-gray-100'}`}><MessageSquare size={16} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="fixed bottom-32 md:bottom-8 left-0 right-0 px-8 md:px-0 flex justify-center z-50 pointer-events-none">
                      <button onClick={saveAttendance} disabled={saving} className="pointer-events-auto bg-black text-white px-8 py-4 rounded-[24px] font-black text-[10px] uppercase tracking-[0.2em] shadow-xl flex items-center gap-3 active:scale-90 transition-all">
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 
                        Valider {format(attendanceDate, 'dd/MM')}
                      </button>
                    </div>
                  </div>
                )}

                {view === 'history' && (
                  <div className="space-y-6 max-w-4xl pb-40 animate-in fade-in duration-500">
                    
                    {!selectedMemberDossier ? (
                      <>
                        <div className="flex items-center justify-between px-2">
                          <div>
                            <h2 className="text-lg font-black text-gray-800">Feuilles de Présence</h2>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Historique des séances</p>
                          </div>
                          <button onClick={generatePDF} className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-all">
                            <FileDown size={18} />
                          </button>
                        </div>

                        <div className="relative mx-2">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={14} />
                          <input type="text" placeholder="Rechercher un membre ou une date..." value={historyFilters.name} onChange={e => setHistoryFilters({...historyFilters, name: e.target.value})} className="w-full bg-white border border-gray-100 rounded-xl pl-10 pr-4 py-2 text-xs font-bold outline-none focus:border-blue-500 shadow-sm" />
                        </div>

                        <div className="space-y-4">
                          {sessions
                            .filter(date => date.includes(historyFilters.date))
                            .map(date => {
                              const sessionAttendance = history.filter(h => h.date === date);
                              const presents = sessionAttendance.filter(h => h.status === 'Présent' && h.members?.name.toLowerCase().includes(historyFilters.name.toLowerCase()));
                              const absents = sessionAttendance.filter(h => h.status === 'Absent' && h.members?.name.toLowerCase().includes(historyFilters.name.toLowerCase()));
                              const others = sessionAttendance.filter(h => !['Présent', 'Absent'].includes(h.status) && h.members?.name.toLowerCase().includes(historyFilters.name.toLowerCase()));

                              if (presents.length + absents.length + others.length === 0) return null;

                              return (
                                <div key={date} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                                  <div className="bg-gray-50/50 px-4 py-2 border-b border-gray-50 flex justify-between items-center">
                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{format(parseISO(date), 'EEEE d MMMM yyyy', { locale: fr })}</span>
                                    <span className="text-[9px] font-bold text-gray-300">{sessionAttendance.length} membres</span>
                                  </div>
                                  
                                  <div className="p-4 space-y-4">
                                    {presents.length > 0 && (
                                      <div>
                                        <p className="text-[8px] font-black text-green-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                                          <div className="w-1 h-1 rounded-full bg-green-500" /> Présents ({presents.length})
                                        </p>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                          {presents.map(h => (
                                            <div key={h.id} onClick={() => setSelectedMemberDossier(h.members)} className="text-[11px] font-bold text-gray-600 hover:text-blue-500 cursor-pointer transition-all">
                                              {h.members?.name} <span className="text-[8px] text-gray-300 font-normal uppercase">{h.members?.faculty?.slice(0,4)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {absents.length > 0 && (
                                      <div className="pt-2 border-t border-gray-50">
                                        <p className="text-[8px] font-black text-red-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                                          <div className="w-1 h-1 rounded-full bg-red-500" /> Absents ({absents.length})
                                        </p>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                          {absents.map(h => (
                                            <div key={h.id} onClick={() => setSelectedMemberDossier(h.members)} className="text-[11px] font-bold text-red-400 hover:text-red-600 cursor-pointer transition-all">
                                              {h.members?.name} <span className="text-[8px] text-red-200 font-normal uppercase">{h.members?.faculty?.slice(0,4)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {others.length > 0 && (
                                      <div className="pt-2 border-t border-gray-50">
                                        <p className="text-[8px] font-black text-orange-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                                          <div className="w-1 h-1 rounded-full bg-orange-500" /> Autres ({others.length})
                                        </p>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                          {others.map(h => (
                                            <div key={h.id} onClick={() => setSelectedMemberDossier(h.members)} className="text-[11px] font-bold text-orange-400 hover:text-orange-600 cursor-pointer transition-all">
                                              {h.members?.name} <span className="text-[8px] text-orange-200 font-normal uppercase">({h.status.charAt(0)})</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </>
                    ) : (
                      <div className="max-w-3xl mx-auto space-y-8 animate-in slide-in-from-bottom-5 duration-700">
                        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                          <button onClick={() => setSelectedMemberDossier(null)} className="flex items-center gap-2 text-blue-500 font-black text-[9px] uppercase tracking-widest hover:gap-3 transition-all"><ArrowLeft size={14}/> Retour</button>
                          <div className="flex gap-2">
                            <a href={`tel:${selectedMemberDossier.phone}`} className="w-12 h-12 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center hover:bg-blue-500 hover:text-white transition-all shadow-sm"><Phone size={18}/></a>
                            <a href={getWhatsAppLink(selectedMemberDossier)} target="_blank" rel="noreferrer" className="w-12 h-12 bg-green-50 text-green-500 rounded-xl flex items-center justify-center hover:bg-green-500 hover:text-white transition-all shadow-sm"><MessageCircle size={18}/></a>
                          </div>
                        </div>

                        <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-xl space-y-8 relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-500" />
                          
                          <div className="flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
                            <div className="w-24 h-24 bg-gray-50 text-gray-300 rounded-[32px] flex items-center justify-center text-4xl font-black shadow-inner">{selectedMemberDossier.name.charAt(0)}</div>
                            <div className="flex-1">
                              <h3 className="text-2xl font-black text-gray-800 leading-tight mb-2">{selectedMemberDossier.name}</h3>
                              <div className="flex flex-wrap justify-center md:justify-start gap-2">
                                <span className="bg-blue-50 text-blue-500 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest">{selectedMemberDossier.faculty}</span>
                                <span className="bg-gray-50 text-gray-400 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest">{selectedMemberDossier.level}</span>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                              { label: 'Total', value: history.filter(h => h.member_id === selectedMemberDossier.id).length, color: 'text-gray-800' },
                              { label: 'Présences', value: history.filter(h => h.member_id === selectedMemberDossier.id && ['Présent', 'Retard'].includes(h.status)).length, color: 'text-green-500' },
                              { label: 'Absences', value: history.filter(h => h.member_id === selectedMemberDossier.id && h.status === 'Absent').length, color: 'text-red-500' },
                              { label: 'Score', value: `${Math.round((history.filter(h => h.member_id === selectedMemberDossier.id && ['Présent', 'Retard'].includes(h.status)).length / (history.filter(h => h.member_id === selectedMemberDossier.id).length || 1)) * 100)}%`, color: 'text-blue-500' }
                            ].map((stat, i) => (
                              <div key={i} className="bg-gray-50/50 p-4 rounded-[24px] text-center border border-gray-50">
                                <p className="text-[7px] font-black text-gray-400 uppercase mb-1">{stat.label}</p>
                                <p className={`text-xl font-black ${stat.color}`}>{stat.value}</p>
                              </div>
                            ))}
                          </div>

                          <div className="space-y-6">
                            <h4 className="text-base font-black flex items-center gap-2"><Clock size={18} className="text-blue-500"/> Timeline</h4>
                            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100">
                              {history
                                .filter(h => h.member_id === selectedMemberDossier.id)
                                .sort((a,b) => new Date(b.date) - new Date(a.date))
                                .map((h, i) => (
                                  <div key={i} className="relative group">
                                    <div className={`absolute -left-[20px] top-1.5 w-3 h-3 rounded-full border-2 border-white shadow-sm transition-all ${
                                      h.status === 'Présent' ? 'bg-green-500' : h.status === 'Absent' ? 'bg-red-500' : 'bg-orange-500'
                                    }`} />
                                    <div className="bg-gray-50/50 p-4 rounded-[24px] border border-gray-50 hover:bg-white hover:shadow-lg transition-all">
                                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                                        <div>
                                          <p className="font-black text-gray-800 text-sm mb-0.5">{format(parseISO(h.date), 'EEEE d MMMM yyyy', { locale: fr })}</p>
                                          <p className={`text-[8px] font-black uppercase tracking-widest ${
                                            h.status === 'Présent' ? 'text-green-500' : h.status === 'Absent' ? 'text-red-500' : 'text-orange-500'
                                          }`}>{h.status}</p>
                                        </div>
                                        {h.notes && (
                                          <div className="bg-white p-3 rounded-xl border border-gray-100 flex items-start gap-2 md:max-w-xs">
                                            <MessageSquare size={12} className="text-blue-300 shrink-0 mt-0.5" />
                                            <p className="text-[10px] text-gray-500 leading-relaxed italic">{h.notes}</p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {view === 'mgmt' && (
                  <div className="space-y-8 max-w-6xl pb-20">
                    <div className="flex p-1.5 bg-gray-100 rounded-[24px] w-full md:w-[500px] overflow-x-auto no-scrollbar">
                      <button onClick={() => setMgmtTab('members')} className={`flex-1 py-4 px-6 rounded-xl text-[10px] font-black tracking-widest transition-all whitespace-nowrap ${mgmtTab === 'members' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`}>MEMBRES</button>
                      <button onClick={() => setMgmtTab('sessions')} className={`flex-1 py-4 px-6 rounded-xl text-[10px] font-black tracking-widest transition-all whitespace-nowrap ${mgmtTab === 'sessions' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`}>SESSIONS</button>
                      {profile?.role === 'coordinateur' && (
                        <button onClick={() => setMgmtTab('users')} className={`flex-1 py-4 px-6 rounded-xl text-[10px] font-black tracking-widest transition-all whitespace-nowrap ${mgmtTab === 'users' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`}>UTILISATEURS</button>
                      )}
                    </div>
                    {mgmtTab === 'members' ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="flex flex-col gap-4">
                          <button onClick={() => { setEditingMember(null); setNewMember({name:'', phone:'', faculty:'', level:''}); setShowAddMember(true); }} className="h-full min-h-[100px] rounded-[40px] border-4 border-dashed border-gray-100 text-gray-300 font-black text-sm flex flex-col items-center justify-center gap-2 hover:border-blue-100 hover:text-blue-300 transition-all"><Plus size={24}/> AJOUTER UN MEMBRE</button>
                          <label className="h-full min-h-[100px] rounded-[40px] border-4 border-dashed border-gray-100 text-gray-300 font-black text-sm flex flex-col items-center justify-center gap-2 hover:border-green-100 hover:text-green-300 transition-all cursor-pointer">
                            <FileDown size={24}/> 
                            <span>IMPORTER CSV</span>
                            <input type="file" accept=".csv" onChange={handleCSVImport} className="hidden" />
                          </label>
                        </div>
                        {allMembers.map(m => (
                          <div key={m.id} className={`p-8 rounded-[40px] border border-gray-50 shadow-sm flex items-center justify-between transition-all ${m.active ? 'bg-white' : 'bg-gray-50 opacity-50'}`}>
                            <div><p className="font-bold text-gray-800 text-lg">{m.name}</p><p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mt-1">{m.faculty} • {m.level}</p></div>
                            <div className="flex gap-2">
                              <button onClick={() => { setEditingMember(m); setNewMember(m); setShowAddMember(true); }} className="p-3 text-blue-500 bg-blue-50 rounded-2xl hover:bg-blue-100 transition-all"><Pencil size={18}/></button>
                              <button onClick={() => toggleMemberStatus(m)} className={`p-3 rounded-2xl transition-all ${m.active ? 'text-orange-500 bg-orange-50 hover:bg-orange-100' : 'text-green-500 bg-green-50 hover:bg-green-100'}`}>{m.active ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : mgmtTab === 'sessions' ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {sessions.map(date => (
                          <div key={date} className="bg-white p-8 rounded-[40px] border border-gray-50 shadow-sm flex items-center justify-between hover:border-red-100 transition-all">
                            <div><p className="font-bold text-gray-800 text-lg">{format(parseISO(date), 'dd MMMM yyyy', { locale: fr })}</p><p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest mt-1">Session archivée</p></div>
                            <button onClick={() => deleteSession(date)} className="p-4 text-red-500 bg-red-50 rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-sm"><Trash2 size={20}/></button>
                          </div>
                        ))}
                      </div>
                    ) : mgmtTab === 'users' ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {allProfiles.map(p => (
                          <div key={p.id} className="bg-white p-6 rounded-[32px] border border-gray-50 shadow-sm space-y-4">
                            <div className="flex justify-between items-start">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500 font-black text-xs">{p.email?.charAt(0).toUpperCase()}</div>
                                <div className="overflow-hidden">
                                  <p className="font-black text-gray-800 text-xs truncate max-w-[150px]">{p.email}</p>
                                  <p className={`text-[8px] font-black uppercase tracking-widest ${p.role === 'coordinateur' ? 'text-purple-500' : 'text-blue-500'}`}>{p.role}</p>
                                </div>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                              <select 
                                value={p.role} 
                                onChange={(e) => handleUpdateProfile(p.id, e.target.value, p.kourel_id)}
                                className="bg-gray-50 border-none rounded-xl p-3 text-[9px] font-black uppercase outline-none focus:ring-2 ring-blue-500"
                              >
                                <option value="surveillant">SURVEILLANT</option>
                                <option value="coordinateur">COORDINATEUR</option>
                              </select>
                              <select 
                                value={p.kourel_id || ""} 
                                onChange={(e) => handleUpdateProfile(p.id, p.role, e.target.value || null)}
                                className="bg-gray-50 border-none rounded-xl p-3 text-[9px] font-black uppercase outline-none focus:ring-2 ring-blue-500"
                              >
                                <option value="">SANS KUREL</option>
                                {kourels.map(k => (
                                  <option key={k.id} value={k.id}>{k.name.slice(0, 15)}...</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    
                    <button onClick={handleLogout} className="w-full md:w-64 py-6 bg-red-50 text-red-500 rounded-3xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 active:scale-95 transition-all mt-12 border border-red-100">
                      <LogOut size={18}/> Déconnexion
                    </button>
                  </div>
                )}
              </main>

              <nav className="md:hidden fixed bottom-8 left-10 right-10 h-20 bg-white/95 backdrop-blur-2xl rounded-[35px] shadow-[0_15px_40px_rgba(0,0,0,0.1)] flex justify-around items-center z-50 border border-gray-100">
                <button onClick={() => setView('dashboard')} className={`p-3 rounded-2xl transition-all ${view === 'dashboard' ? 'text-blue-500 bg-blue-50' : 'text-gray-300'}`}><LayoutDashboard size={22} strokeWidth={2.5}/></button>
                <button onClick={() => setView('attendance')} className={`p-3 rounded-2xl transition-all ${view === 'attendance' ? 'text-blue-500 bg-blue-50' : 'text-gray-300'}`}><CheckCircle2 size={22} strokeWidth={2.5}/></button>
                <button onClick={() => setView('history')} className={`p-3 rounded-2xl transition-all ${view === 'history' ? 'text-blue-500 bg-blue-50' : 'text-gray-300'}`}><History size={22} strokeWidth={2.5}/></button>
                <button onClick={() => setView('mgmt')} className={`p-3 rounded-2xl transition-all ${view === 'mgmt' ? 'text-blue-500 bg-blue-50' : 'text-gray-300'}`}><Settings size={22} strokeWidth={2.5}/></button>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>

        {/* MODAL NEW MEMBER */}
        <AnimatePresence>
          {showAddMember && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-end p-4">
              <motion.div initial={{ y: 500 }} animate={{ y: 0 }} exit={{ y: 500 }} className="bg-white w-full rounded-[45px] p-10 space-y-8 shadow-2xl">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-extrabold tracking-tight">{editingMember ? 'Modifier' : 'Nouveau'} Membre</h3>
                  <button onClick={() => setShowAddMember(false)} className="p-3 bg-gray-50 rounded-full text-gray-400"><X size={20}/></button>
                </div>
                <div className="space-y-4">
                  <input type="text" placeholder="Prénom Nom" value={newMember.name} onChange={e => setNewMember({...newMember, name: e.target.value})} className="w-full bg-gray-50 border-none rounded-2xl p-5 font-bold outline-none" />
                  <input type="tel" placeholder="WhatsApp" value={newMember.phone} onChange={e => setNewMember({...newMember, phone: e.target.value})} className="w-full bg-gray-50 border-none rounded-2xl p-5 font-bold outline-none" />
                  <div className="grid grid-cols-2 gap-4">
                    <input type="text" placeholder="Faculté" value={newMember.faculty} onChange={e => setNewMember({...newMember, faculty: e.target.value})} className="w-full bg-gray-50 border-none rounded-2xl p-5 font-bold outline-none" />
                    <input type="text" placeholder="Niveau" value={newMember.level} onChange={e => setNewMember({...newMember, level: e.target.value})} className="w-full bg-gray-50 border-none rounded-2xl p-5 font-bold outline-none" />
                  </div>
                </div>
                <button onClick={handleAddOrEditMember} disabled={saving} className="w-full bg-black text-white py-5 rounded-[28px] font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all">{saving ? <Loader2 size={18} className="animate-spin mx-auto"/> : 'Enregistrer'}</button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* MODAL NEW KOUREL */}
        <AnimatePresence>
          {showAddKourel && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-end p-4">
              <motion.div initial={{ y: 500 }} animate={{ y: 0 }} exit={{ y: 500 }} className="bg-white w-full rounded-[45px] p-10 space-y-8 shadow-2xl">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-extrabold tracking-tight">Nouveau Kourel</h3>
                  <button onClick={() => setShowAddKourel(false)} className="p-3 bg-gray-50 rounded-full text-gray-400"><X size={20}/></button>
                </div>
                <div className="space-y-4">
                  <input type="text" placeholder="Nom du Kourel" value={newKourel.name} onChange={e => setNewKourel({...newKourel, name: e.target.value})} className="w-full bg-gray-50 border-none rounded-2xl p-5 font-bold outline-none" />
                  <input type="text" placeholder="Localisation" value={newKourel.location} onChange={e => setNewKourel({...newKourel, location: e.target.value})} className="w-full bg-gray-50 border-none rounded-2xl p-5 font-bold outline-none" />
                </div>
                <button onClick={handleCreateKourel} disabled={saving} className="w-full bg-black text-white py-5 rounded-[28px] font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all">{saving ? <Loader2 size={18} className="animate-spin mx-auto"/> : 'Créer le Kourel'}</button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  </div>
  );
}

export default App;
