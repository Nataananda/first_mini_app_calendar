import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { Plus, ChevronLeft, ChevronRight, X, Trash2, Lock, Copy } from 'lucide-react';

// --- CONFIG ---
const PIN_CODE = '1234';

// --- UI TOKENS (Typography + Touch targets + Spacing) ---
// Targets:
// - Headings: 18sp+  -> text-lg+
// - Body: 16sp       -> text-base
// - Helper: 14sp     -> text-sm
// - Chips: px-3 py-1.5, text-[13px]
// - Touch: min-h 48-52px for buttons/inputs
// - Cards: p-4, internal gaps gap-3/gap-4
const UI = {
  text: {
    h1: 'text-4xl md:text-5xl font-semibold tracking-tight',
    h2: 'text-xl md:text-2xl font-semibold',
    title: 'text-lg md:text-xl font-semibold leading-snug', // 18sp+
    body: 'text-base leading-snug font-normal', // 16sp
    helper: 'text-sm leading-snug font-normal', // 14sp
    subtle: 'text-white/70',
    strong: 'text-white',
  },
  chip: {
    base:
      'inline-flex items-center rounded-full border px-3 py-1.5 text-[13px] font-medium leading-none min-h-9',
  },
  button: {
    // 48-52px touch target
    pill: 'px-5 py-3 text-base font-semibold rounded-full border transition-colors min-h-[52px]',
    icon: 'h-12 w-12 rounded-full flex items-center justify-center',
  },
  input: {
    base:
      'w-full bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/40 min-h-[52px] px-4',
  },
  card: {
    base: 'rounded-2xl bg-white/6 backdrop-blur-xl border shadow-xl shadow-black/30',
    pad: 'p-4', // 16px
    gap: 'gap-4',
  },
  spacing: {
    cardGap: 'space-y-4',
  },
};

type WhoId = 'child' | 'parentA' | 'parentB';
type EventStatus = 'pending' | 'confirmed' | 'declined';

type CalendarEvent = {
  id: string;
  title: string;
  who: WhoId;
  notes: string;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
  status?: EventStatus;
  requested_by?: string | null;
  needs_approval_from?: string | null;
};

const WHO_OPTIONS: Array<{ id: WhoId; label: string; color: string }> = [
  {
    id: 'child',
    label: 'Davide',
    color: 'bg-blue-500/20 text-blue-300 border-blue-400/30',
  },
  {
    id: 'parentA',
    label: 'Pietro',
    color: 'bg-green-500/20 text-green-300 border-green-400/30',
  },
  {
    id: 'parentB',
    label: 'Elena',
    color: 'bg-purple-500/20 text-purple-300 border-purple-400/30',
  },
];

const DAYS_IT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const MONTHS_IT = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
];

const STATUS_META: Record<EventStatus, { label: string; pill: string; dot: string }> = {
  pending: {
    label: 'In attesa',
    pill: 'bg-yellow-500/15 text-yellow-200 border-yellow-400/30',
    dot: 'bg-yellow-400',
  },
  confirmed: {
    label: 'Confermato',
    pill: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30',
    dot: 'bg-emerald-400',
  },
  declined: {
    label: 'Rifiutato',
    pill: 'bg-rose-500/15 text-rose-200 border-rose-400/30',
    dot: 'bg-rose-400',
  },
};

const getStatus = (e: Partial<CalendarEvent> | null | undefined): EventStatus =>
  ((e?.status as EventStatus) ?? 'confirmed');

// ✅ UI helper: кому подтверждать (pending)
const whoLabel = (id: WhoId | null | undefined) => WHO_OPTIONS.find((o) => o.id === id)?.label ?? '';

const approvalHint = (e: CalendarEvent) => {
  if (getStatus(e) !== 'pending') return null;
  const target = e.needs_approval_from as WhoId | null | undefined;
  const name = whoLabel(target);
  return name ? `Richiede approvazione da ${name}` : 'Richiede approvazione';
};

function StatusBadge({ status }: { status: EventStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`${UI.chip.base} gap-2 ${m.pill}`}>
      <span className={`w-2.5 h-2.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

const formatDateIT = (date: Date) =>
  new Intl.DateTimeFormat('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(date);

const formatTimeIT = (dateStr?: string) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

function svDate(date: Date) {
  return date.toLocaleDateString('sv-SE');
}

function isPinValidFromStorage() {
  const raw = localStorage.getItem('pin_expiry');
  if (!raw) return false;
  const expiry = Number(raw);
  if (!Number.isFinite(expiry)) return false;
  return Date.now() < expiry;
}

export default function FamilyCalendarLite() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [view, setView] = useState<'month' | 'agenda' | 'pending'>('month');
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDayDrawer, setShowDayDrawer] = useState(false);
  const [formMode, setFormMode] = useState<null | 'open'>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [filterWho, setFilterWho] = useState<'all' | WhoId>('all');

  // ✅ ВАЖНО: эти константы должны быть ВЫШЕ formData, потому что используются в initial state.
  type ParentId = 'parentA' | 'parentB';

  // ✅ ВРЕМЕННЫЙ дефолт: кто сейчас работает в Mini App.
  // Потом заменим на Telegram user id или твою систему PIN/ролей.
  const CURRENT_PARENT: ParentId = 'parentA';

  const OTHER_PARENT: Record<ParentId, ParentId> = {
    parentA: 'parentB',
    parentB: 'parentA',
  };

  const [formData, setFormData] = useState<{
    title: string;
    who: WhoId;
    start_date: string;
    start_time: string;
    end_time: string;
    is_all_day: boolean;
    notes: string;
    status: EventStatus;

    requested_by: ParentId | null;
    needs_approval_from: ParentId | null;
  }>({
    title: '',
    who: 'child',
    start_date: '',
    start_time: '12:00',
    end_time: '13:00',
    is_all_day: false,
    notes: '',
    status: 'confirmed',

    requested_by: CURRENT_PARENT,
    needs_approval_from: null,
  });

  useEffect(() => {
    try {
      if (isPinValidFromStorage()) setIsAuthenticated(true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('events').select('*').order('start_at', { ascending: true });
      if (error) {
        console.error(error);
        return;
      }
      setEvents((data ?? []) as CalendarEvent[]);
    })();
  }, []);

  const handlePinSubmit = () => {
    if (pinInput === PIN_CODE) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30);
      localStorage.setItem('pin_expiry', expiryDate.getTime().toString());
      setIsAuthenticated(true);
    } else {
      alert('PIN errato (prova 1234)');
      setPinInput('');
    }
  };

  const handleMonthChange = (dir: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + dir);
    setCurrentDate(newDate);
  };

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let firstDayOfWeek = new Date(year, month, 1).getDay();
    if (firstDayOfWeek === 0) firstDayOfWeek = 7;

    const days: Array<Date | null> = [];
    for (let i = 1; i < firstDayOfWeek; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    while (days.length < 42) days.push(null);
    return days;
  }, [currentDate]);

  const eventsForDate = (date: Date | null, mode: 'month' | 'drawer' = 'month') => {
    if (!date) return [];
    const dateStr = svDate(date);
    return events
      .filter((e) => (e.start_at || '').startsWith(dateStr))
      .filter((e) => getStatus(e) !== 'declined')
      .filter((e) => (mode === 'month' ? getStatus(e) === 'confirmed' : true));
  };

  const filteredEventsList = useMemo(() => {
    let sorted = [...events]
      .filter((e) => getStatus(e) !== 'declined')
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    if (view === 'agenda') sorted = sorted.filter((e) => getStatus(e) === 'confirmed');
    if (view === 'pending') sorted = sorted.filter((e) => getStatus(e) === 'pending');
    if (filterWho !== 'all') sorted = sorted.filter((e) => e.who === filterWho);

    return sorted;
  }, [events, view, filterWho]);

  // ✅ Day Drawer: pending sopra, poi confirmed (ordinato per orario)
  const drawerEvents = useMemo(() => {
    return eventsForDate(selectedDate, 'drawer')
      .slice()
      .sort((a, b) => {
        const pa = getStatus(a) === 'pending' ? 0 : 1;
        const pb = getStatus(b) === 'pending' ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
      });
  }, [events, selectedDate]);

  const handleSaveEvent = async () => {
    if (!formData.title.trim()) return alert('Inserisci un titolo');

    let startIso: string;
    let endIso: string;

    if (!formData.start_date) return alert('Seleziona una data');

    if (formData.is_all_day) {
      startIso = `${formData.start_date}T00:00:00.000Z`;
      endIso = `${formData.start_date}T23:59:59.000Z`;
    } else {
      if (formData.end_time <= formData.start_time) {
        return alert("La fine deve essere dopo l'inizio");
      }
      startIso = `${formData.start_date}T${formData.start_time}:00`;
      endIso = `${formData.start_date}T${formData.end_time}:00`;
    }

    const newEvent: CalendarEvent = {
      id: editingEventId || crypto.randomUUID(),
      title: formData.title,
      who: formData.who,
      notes: formData.notes,
      start_at: startIso,
      end_at: endIso,
      is_all_day: formData.is_all_day,
      status: formData.status,

      requested_by: formData.requested_by ?? CURRENT_PARENT,
      needs_approval_from:
        formData.status === 'pending'
          ? (formData.needs_approval_from ?? OTHER_PARENT[CURRENT_PARENT])
          : null,
    };

    const { error } = editingEventId
      ? await supabase
          .from('events')
          .update({
            title: newEvent.title,
            who: newEvent.who,
            notes: newEvent.notes,
            start_at: newEvent.start_at,
            end_at: newEvent.end_at,
            is_all_day: newEvent.is_all_day,
            status: newEvent.status,

            requested_by: newEvent.requested_by,
            needs_approval_from: newEvent.needs_approval_from,
          })
          .eq('id', editingEventId)
      : await supabase.from('events').insert([newEvent]);

    if (error) {
      console.error('Supabase error:', error);
      alert('Non è stato possibile salvare nel database');
      return;
    }

    setEvents((prev) =>
      editingEventId ? prev.map((e) => (e.id === editingEventId ? newEvent : e)) : [...prev, newEvent]
    );

    setFormMode(null);
    setEditingEventId(null);
    setShowDayDrawer(false);
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm('Eliminare?')) return;

    const { error } = await supabase.from('events').delete().eq('id', id);

    if (error) {
      console.error('Supabase delete error:', error);
      alert('Non è stato possibile eliminare');
      return;
    }

    setEvents((prev) => prev.filter((e) => e.id !== id));
    setFormMode(null);
    setEditingEventId(null);
    setShowDayDrawer(false);
  };

  const handleDuplicateEvent = async () => {
    if (!editingEventId) return;

    const original = events.find((e) => e.id === editingEventId);
    if (!original) return;

    const newEvent: CalendarEvent = {
      ...original,
      id: crypto.randomUUID(),
      title: `${original.title} (Copia)`,
    };

    const { error } = await supabase.from('events').insert([newEvent]);

    if (error) {
      console.error('Supabase duplicate error:', error);
      alert('Non è stato possibile duplicare');
      return;
    }

    setEvents((prev) => [...prev, newEvent]);
    setFormMode(null);
    setEditingEventId(null);
    alert('Duplicato!');
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('id', id);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = async (e: React.DragEvent, targetDate: Date) => {
    const id = e.dataTransfer.getData('id');
    const ev = events.find((x) => x.id === id);
    if (!ev) return;

    const targetDateStr = svDate(targetDate);
    const timePartStart = (ev.start_at.split('T')[1] ?? '').trim();
    const timePartEnd = (ev.end_at.split('T')[1] ?? '').trim();

    if (!timePartStart || !timePartEnd) return;

    const newStart = `${targetDateStr}T${timePartStart}`;
    const newEnd = `${targetDateStr}T${timePartEnd}`;

    const { error } = await supabase.from('events').update({ start_at: newStart, end_at: newEnd }).eq('id', id);

    if (error) {
      console.error('Supabase drag error:', error);
      alert("Impossibile spostare l'evento");
      return;
    }

    setEvents((prev) => prev.map((x) => (x.id === id ? { ...x, start_at: newStart, end_at: newEnd } : x)));
  };

  const openForm = (event: CalendarEvent | null = null, date: Date = new Date()) => {
    if (event) {
      setEditingEventId(event.id);
      setFormData({
        title: event.title,
        who: event.who,
        notes: event.notes,
        start_date: event.start_at.split('T')[0],
        start_time: event.start_at.split('T')[1]?.slice(0, 5) || '12:00',
        end_time: event.end_at.split('T')[1]?.slice(0, 5) || '13:00',
        is_all_day: event.is_all_day,
        status: getStatus(event),

        requested_by: (event.requested_by as ParentId) ?? CURRENT_PARENT,
        needs_approval_from: (event.needs_approval_from as ParentId) ?? null,
      });
    } else {
      setEditingEventId(null);
      setFormData({
        title: '',
        who: 'child',
        notes: '',
        start_date: svDate(date),
        start_time: '12:00',
        end_time: '13:00',
        is_all_day: false,
        status: 'confirmed',

        requested_by: CURRENT_PARENT,
        needs_approval_from: null,
      });
    }
    setFormMode('open');
  };

  // ---------- AUTH SCREEN ----------
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#070A12] p-6 text-white">
        <div className={`${UI.card.base} p-8 w-full max-w-sm text-center border-white/10`}>
          <Lock className="w-12 h-12 text-cyan-400 mx-auto mb-4" />
          <p className={`${UI.text.helper} ${UI.text.subtle} mb-6`}>Inserisci PIN (1234)</p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            className={`${UI.input.base} text-center text-3xl border-2 border-white/20 mb-6`}
          />
          <button
            onClick={handlePinSubmit}
            className="w-full min-h-[52px] bg-gradient-to-br from-cyan-400 to-fuchsia-500 text-white rounded-xl font-bold shadow-lg shadow-fuchsia-500/20 hover:scale-105 active:scale-95 transition"
          >
            Entra
          </button>
        </div>
      </div>
    );
  }

  // ---------- FORM SCREEN ----------
  if (formMode === 'open') {
    return (
      <div className="h-screen flex flex-col bg-[#070A12] text-white">
        <div className="bg-white/10 backdrop-blur-xl px-4 py-3 flex justify-between border-b border-white/10 sticky top-0">
          <button onClick={() => setFormMode(null)} className="text-cyan-300 font-semibold min-h-[48px] px-2">
            Annulla
          </button>
          <span className="font-semibold text-white text-lg">{editingEventId ? 'Modifica' : 'Nuovo'}</span>
          <button onClick={handleSaveEvent} className="text-fuchsia-300 font-semibold min-h-[48px] px-2">
            Salva
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <input
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Titolo"
            className={`w-full ${UI.text.title} border-b border-white/20 bg-transparent text-white placeholder:text-white/40 min-h-[52px] px-2`}
          />

          <div className="flex gap-3 overflow-x-auto">
            {WHO_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setFormData({ ...formData, who: opt.id })}
                className={`min-h-[52px] px-5 py-3 text-base font-semibold rounded-full border transition-colors whitespace-nowrap ${
                  formData.who === opt.id ? opt.color : 'bg-white/5 border-white/20 text-white/70 hover:bg-white/10'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="rounded-2xl bg-white/6 backdrop-blur-xl border border-white/10 p-4 space-y-4">
            <div className="flex justify-between items-center">
              <span className={`${UI.text.body} text-white/80`}>Tutto il giorno</span>
              <input
                type="checkbox"
                checked={formData.is_all_day}
                onChange={(e) => setFormData({ ...formData, is_all_day: e.target.checked })}
                className="accent-cyan-400 w-5 h-5"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className={`${UI.text.helper} text-white/80`}>Richiede approvazione</span>
              <button
                type="button"
                onClick={() =>
                  setFormData((prev) => {
                    const wantsApproval = prev.status !== 'pending';
                    return {
                      ...prev,
                      status: wantsApproval ? 'pending' : 'confirmed',
                      requested_by: CURRENT_PARENT,
                      needs_approval_from: wantsApproval ? OTHER_PARENT[CURRENT_PARENT] : null,
                    };
                  })
                }
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                  formData.status === 'pending' ? 'bg-amber-500' : 'bg-white/20'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                    formData.status === 'pending' ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <input
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              className={`${UI.input.base}`}
            />

            {!formData.is_all_day && (
              <div className="flex gap-3">
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  className={`${UI.input.base}`}
                />
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  className={`${UI.input.base}`}
                />
              </div>
            )}
          </div>

          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Note..."
            className="w-full p-4 rounded-2xl bg-white/6 backdrop-blur-xl border border-white/10 text-white placeholder:text-white/40"
            rows={4}
          />

          {editingEventId && (
            <div className="grid grid-cols-2 gap-4 mt-4">
              <button
                onClick={handleDuplicateEvent}
                className="flex items-center justify-center gap-2 bg-white/10 text-white min-h-[52px] rounded-xl font-semibold hover:bg-white/20 transition"
              >
                <Copy size={18} /> Copia
              </button>
              <button
                onClick={() => handleDeleteEvent(editingEventId)}
                className="flex items-center justify-center gap-2 bg-red-500/20 text-red-300 min-h-[52px] rounded-xl font-semibold hover:bg-red-500/30 transition"
              >
                <Trash2 size={18} /> Elimina
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- MAIN SCREEN ----------
  return (
    <div className="min-h-screen bg-[#070A12] text-white overflow-x-hidden font-sans">
      {/* Neon blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute top-40 -right-24 h-96 w-96 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />
      </div>

      <div className="relative h-screen flex flex-col">
        {/* Header */}
        <div className="pt-6 px-4 pb-4 space-y-4 bg-gradient-to-b from-[#070A12]/80 to-transparent backdrop-blur-xl z-10 border-b border-white/5">
          <div className="flex justify-between items-center">
            <div>
              <h1
                className={`${UI.text.h1} bg-gradient-to-r from-cyan-300 via-white to-fuchsia-300 bg-clip-text text-transparent drop-shadow-sm`}
              >
                Calendario
              </h1>
            </div>
            <button
              onClick={() => openForm()}
              className={`${UI.button.icon} bg-gradient-to-br from-cyan-400 to-fuchsia-500 shadow-lg shadow-fuchsia-500/20 ring-1 ring-white/10 hover:scale-105 active:scale-95 transition`}
            >
              <Plus size={20} />
            </button>
          </div>

          {/* Tabs - 52px touch target */}
          <div className="flex bg-white/5 backdrop-blur-md p-1.5 rounded-2xl border border-white/10">
            <button
              onClick={() => setView('month')}
              className={`flex-1 py-3 text-xl md:text-2xl font-semibold rounded-xl transition-all min-h-[52px] whitespace-nowrap ${
                view === 'month'
                  ? 'bg-gradient-to-br from-cyan-400/25 to-fuchsia-500/25 text-white shadow-lg ring-1 ring-white/10'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              Mese
            </button>
            <button
              onClick={() => setView('agenda')}
              className={`flex-1 py-3 text-xl md:text-2xl font-semibold rounded-xl transition-all min-h-[52px] whitespace-nowrap ${
                view === 'agenda'
                  ? 'bg-gradient-to-br from-cyan-400/25 to-fuchsia-500/25 text-white shadow-lg ring-1 ring-white/10'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              Lista
            </button>
            <button
              onClick={() => setView('pending')}
              className={`flex-1 py-3 text-xl md:text-2xl font-semibold rounded-xl transition-all min-h-[52px] whitespace-nowrap ${
                view === 'pending'
                  ? 'bg-gradient-to-br from-cyan-400/25 to-fuchsia-500/25 text-white shadow-lg ring-1 ring-white/10'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              In attesa
            </button>
          </div>
        </div>

        {/* MONTH */}
        {view === 'month' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 mx-4 mt-4 min-h-[56px]">
              <button
                onClick={() => handleMonthChange(-1)}
                className="h-12 w-12 flex items-center justify-center hover:bg-white/10 rounded-full transition"
              >
                <ChevronLeft />
              </button>
              <span className="text-xl md:text-2xl font-semibold capitalize">
                {MONTHS_IT[currentDate.getMonth()]} {currentDate.getFullYear()}
              </span>
              <button
                onClick={() => handleMonthChange(1)}
                className="h-12 w-12 flex items-center justify-center hover:bg-white/10 rounded-full transition"
              >
                <ChevronRight />
              </button>
            </div>

            <div className="grid grid-cols-7 text-center text-base md:text-lg font-medium text-white/55 py-3 px-4">
              {DAYS_IT.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>

            <div className="flex-1 grid grid-cols-7 grid-rows-6 gap-2 px-4 pb-4">
              {calendarDays.map((day, i) => {
                if (!day) return <div key={i} className="rounded-lg bg-white/5" />;

                const evs = eventsForDate(day, 'month'); // confirmed only

                // ✅ pending count (for tiny yellow dot)
                const dateStr = svDate(day);
                const pendingCount = events.filter(
                  (e) => (e.start_at || '').startsWith(dateStr) && getStatus(e) === 'pending'
                ).length;

                const isToday = day.toDateString() === new Date().toDateString();
                const isSun = day.getDay() === 0;

                return (
                  <div
                    key={i}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, day)}
                    onClick={() => {
                      setSelectedDate(day);
                      setShowDayDrawer(true);
                    }}
                    className={`border border-white/10 p-3 min-h-[64px] relative transition-colors hover:bg-white/5 active:bg-white/10 rounded-xl cursor-pointer ${
                      isToday ? 'bg-gradient-to-br from-cyan-500/10 to-fuchsia-500/10' : ''
                    }`}
                  >
                    <span
                      className={`text-base md:text-xl w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full ${
                        isToday
                          ? 'bg-gradient-to-br from-cyan-400 to-fuchsia-500 text-white font-bold'
                          : isSun
                          ? 'text-rose-400'
                          : 'text-white/85'
                      }`}
                    >
                      {day.getDate()}
                    </span>

                    {/* ✅ Tiny pending dot (does NOT add stripes) */}
                    {pendingCount > 0 && (
                      <span
                        className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-yellow-400"
                        title={`${pendingCount} in attesa`}
                      />
                    )}

                    <div className="flex flex-col gap-1 mt-2">
                      {evs.slice(0, 3).map((e) => {
                        const whoColor = WHO_OPTIONS.find((o) => o.id === e.who)?.color.split(' ')[0];
                        return (
                          <div
                            key={e.id}
                            draggable
                            onDragStart={(ev) => handleDragStart(ev, e.id)}
                            className={`h-1.5 rounded-full ${whoColor || 'bg-white/20'}`}
                          />
                        );
                      })}
                      {evs.length > 3 && (
                        <span className="text-[13px] text-white/55 pl-0.5 leading-none">+{evs.length - 3}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* AGENDA */}
        {(view === 'agenda' || view === 'pending') && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 flex gap-3 overflow-x-auto">
              <button
                onClick={() => setFilterWho('all')}
                className={`${UI.button.pill} ${
                  filterWho === 'all'
                    ? 'bg-gradient-to-br from-cyan-400/25 to-fuchsia-500/25 text-white border-white/30 ring-1 ring-white/10 shadow-lg'
                    : 'bg-white/5 border-white/20 text-white/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                Tutti
              </button>
              {WHO_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setFilterWho(opt.id)}
                  className={`${UI.button.pill} ${
                    filterWho === opt.id
                      ? `${opt.color} border-current ring-1 ring-white/10 shadow-lg`
                      : 'bg-white/5 border-white/20 text-white/75 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className={`flex-1 overflow-y-auto p-4 ${UI.spacing.cardGap}`}>
              {filteredEventsList.length === 0 ? (
                <div className="text-center mt-10">
                  <p className={`${UI.text.body} ${UI.text.subtle}`}>
                    {view === 'pending' ? 'Nessuna richiesta in attesa' : 'Nessun evento'}
                  </p>
                  {view === 'pending' && (
                    <p className={`${UI.text.helper} text-white/45 mt-2`}>Le richieste appariranno qui</p>
                  )}
                </div>
              ) : (
                filteredEventsList.map((ev) => {
                  const who = WHO_OPTIONS.find((o) => o.id === ev.who);
                  const status = getStatus(ev);
                  const isPending = status === 'pending';

                  return (
                    <div
                      key={ev.id}
                      onClick={() => openForm(ev)}
                      className={`${UI.card.base} ${UI.card.pad} flex ${UI.card.gap} active:scale-[0.99] transition-transform cursor-pointer ${
                        isPending
                          ? 'bg-yellow-500/10 border-yellow-400/40'
                          : view === 'pending'
                          ? 'border-yellow-400/30'
                          : 'border-white/10'
                      }`}
                    >
                      <div className={`w-1 rounded-full self-stretch ${who?.color.split(' ')[0] || 'bg-white/20'}`} />
                      <div className="flex-1">
                        <div className={`${UI.text.title} ${UI.text.strong} flex items-center gap-2`}>
                          {isPending && <span className="text-yellow-300">⏳</span>}
                          {ev.title}
                        </div>
                        <div className={`${UI.text.body} ${UI.text.subtle} mt-1`}>
                          {formatDateIT(new Date(ev.start_at))} •{' '}
                          {ev.is_all_day
                            ? 'Tutto il giorno'
                            : `${formatTimeIT(ev.start_at)} - ${formatTimeIT(ev.end_at)}`}
                        </div>

                        {/* ✅ hint for pending */}
                        {approvalHint(ev) && (
                          <div className="text-xs text-yellow-200 mt-1">{approvalHint(ev)}</div>
                        )}

                        <div className="flex flex-wrap gap-3 mt-3">
                          <span
                            className={`${UI.chip.base} ${who?.color || 'bg-white/5 border-white/20 text-white/75'}`}
                          >
                            {who?.label || ev.who}
                          </span>
                          <StatusBadge status={status} />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* DAY DRAWER */}
        {showDayDrawer && view === 'month' && (
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-end z-50"
            onClick={() => setShowDayDrawer(false)}
          >
            <div
              className="rounded-t-3xl bg-white/10 backdrop-blur-2xl border-t border-white/20 w-full p-4 h-1/2 flex flex-col shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className={`${UI.text.h2} capitalize text-white`}>{formatDateIT(selectedDate)}</h2>
                <button
                  onClick={() => setShowDayDrawer(false)}
                  className="h-12 w-12 bg-white/10 hover:bg-white/20 rounded-full transition flex items-center justify-center"
                >
                  <X size={20} className="text-white" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3">
                {drawerEvents.length === 0 ? (
                  <p className={`${UI.text.body} text-white/60 text-center py-6`}>Nessun evento</p>
                ) : (
                  drawerEvents.map((e) => {
                    const who = WHO_OPTIONS.find((o) => o.id === e.who);
                    const status = getStatus(e);
                    const isPending = status === 'pending';

                    return (
                      <div
                        key={e.id}
                        onClick={() => openForm(e)}
                        className={`p-4 rounded-2xl border-l-4 text-left cursor-pointer hover:bg-white/15 transition ${
                          isPending ? 'bg-yellow-500/10' : 'bg-white/10'
                        }`}
                        style={{
                          borderLeftColor: who?.color.includes('blue')
                            ? '#3b82f6'
                            : who?.color.includes('green')
                            ? '#10b981'
                            : '#a855f7',
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                        <div className={`${UI.text.title} text-white flex items-center gap-2`}>
                          {isPending && <span className="text-yellow-300">⏳</span>}
                          {e.title}
                        </div>
                        <StatusBadge status={status} />
                      </div>
                        <div className={`${UI.text.body} text-white/70 mt-2`}>
                          {e.is_all_day ? 'Tutto il giorno' : `${formatTimeIT(e.start_at)} - ${formatTimeIT(e.end_at)}`}
                        </div>

                        {/* ✅ hint for pending */}
                        {approvalHint(e) && (
                          <div className="text-xs text-yellow-200 mt-1">{approvalHint(e)}</div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <button
                onClick={() => {
                  setShowDayDrawer(false);
                  openForm(null, selectedDate);
                }}
                className="mt-4 w-full min-h-[52px] bg-gradient-to-br from-cyan-400 to-fuchsia-500 text-white rounded-xl font-bold flex justify-center items-center gap-2 shadow-lg shadow-fuchsia-500/20 hover:scale-105 active:scale-95 transition"
              >
                <Plus size={18} /> Aggiungi
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


