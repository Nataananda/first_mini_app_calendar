import { useState, useEffect } from 'react';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
  Trash2,
  Lock,
  Copy,
} from 'lucide-react';

// --- КОНФИГУРАЦИЯ ---
const PIN_CODE = '1234';
const WHO_OPTIONS: Array<{ id: WhoId; label: string; color: string }> = [
  {
    id: 'child',
    label: 'Ребёнок',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  {
    id: 'parentA',
    label: 'Родитель A',
    color: 'bg-green-100 text-green-800 border-green-200',
  },
  {
    id: 'parentB',
    label: 'Родитель B',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
  },
];

const DAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];
type WhoId = 'child' | 'parentA' | 'parentB';

type CalendarEvent = {
  id: string;
  title: string;
  who: WhoId;
  notes: string;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
};

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
const formatDateRU = (date: Date) =>
  new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(date);
const formatTimeRU = (dateStr?: string) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

// --- ОСНОВНОЙ КОМПОНЕНТ ---
export default function FamilyCalendarLite() {
  // *** АВТО-ИСПРАВЛЕНИЕ СТИЛЕЙ ***

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');

  const [view, setView] = useState('month');
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDayDrawer, setShowDayDrawer] = useState(false);

  const [formMode, setFormMode] = useState<null | 'open'>(null);
  const [formData, setFormData] = useState<{
    title: string;
    who: WhoId;
    start_date: string;
    start_time: string;
    end_time: string;
    is_all_day: boolean;
    notes: string;
  }>({
    title: '',
    who: 'child',
    start_date: '',
    start_time: '12:00',
    end_time: '13:00',
    is_all_day: false,
    notes: '',
  });

  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [filterWho, setFilterWho] = useState('all');

  // Загрузка
  useEffect(() => {
    const expiry = localStorage.getItem('pin_expiry');
    if (expiry && new Date().getTime() < parseInt(expiry))
      setIsAuthenticated(true);
    const savedEvents = localStorage.getItem('my_calendar_events');
    if (savedEvents) setEvents(JSON.parse(savedEvents));
  }, []);

  // Сохранение
  useEffect(() => {
    if (events.length > 0)
      localStorage.setItem('my_calendar_events', JSON.stringify(events));
  }, [events]);

  const handlePinSubmit = () => {
    if (pinInput === PIN_CODE) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30);
      localStorage.setItem('pin_expiry', expiryDate.getTime().toString());
      setIsAuthenticated(true);
    } else {
      alert('Неверный PIN (попробуйте 1234)');
      setPinInput('');
    }
  };

  // Календарь
  const handleMonthChange = (dir: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + dir);
    setCurrentDate(newDate);
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let firstDayOfWeek = new Date(year, month, 1).getDay();
    if (firstDayOfWeek === 0) firstDayOfWeek = 7;

    const days = [];
    for (let i = 1; i < firstDayOfWeek; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  };

  const eventsForDate = (date: Date | null) => {
    if (!date) return [];
    const dateStr = date.toISOString().split('T')[0];
    return events.filter((e) => e.start_at.startsWith(dateStr));
  };

  const getFilteredEvents = () => {
    let sorted = [...events].sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
    if (filterWho !== 'all') sorted = sorted.filter((e) => e.who === filterWho);
    return sorted;
  };

  // События
  const handleSaveEvent = () => {
    if (!formData.title.trim()) return alert('Введите название');

    let startIso, endIso;
    if (formData.is_all_day) {
      startIso = `${formData.start_date}T00:00:00.000Z`;
      endIso = `${formData.start_date}T23:59:59.000Z`;
    } else {
      if (formData.end_time <= formData.start_time)
        return alert('Конец должен быть позже начала');
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
    };

    if (editingEventId) {
      setEvents(events.map((e) => (e.id === editingEventId ? newEvent : e)));
    } else {
      setEvents([...events, newEvent]);
    }

    setFormMode(null);
    setEditingEventId(null);
    setShowDayDrawer(false);
  };

  const handleDeleteEvent = (id: string) => {
    if (confirm('Удалить?')) {
      setEvents(events.filter((e) => e.id !== id));
      setFormMode(null);
      setEditingEventId(null);
      setShowDayDrawer(false);
    }
  };

  const handleDuplicateEvent = () => {
    const original = events.find((e) => e.id === editingEventId);
    if (!original) return;

    const newEvent: CalendarEvent = {
      ...original,
      id: crypto.randomUUID(),
      title: original.title + ' (Копия)',
    };

    setEvents([...events, newEvent]);
    setFormMode(null);
    setEditingEventId(null);
    alert('Скопировано!');
  };

  const handleDragStart = (e: React.DragEvent, id: string) =>
    e.dataTransfer.setData('id', id);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent, targetDate: Date) => {
    const id = e.dataTransfer.getData('id');
    const ev = events.find((e) => e.id === id);
    if (!ev) return;

    const targetDateStr = targetDate.toISOString().split('T')[0];
    const timePartStart = ev.start_at.split('T')[1];
    const timePartEnd = ev.end_at.split('T')[1];
    const newStart = `${targetDateStr}T${timePartStart}`;
    const newEnd = `${targetDateStr}T${timePartEnd}`;

    setEvents(
      events.map((e) =>
        e.id === id ? { ...e, start_at: newStart, end_at: newEnd } : e
      )
    );
  };

  const openForm = (
    event: CalendarEvent | null = null,
    date: Date = new Date()
  ) => {
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
      });
    } else {
      setEditingEventId(null);
      setFormData({
        title: '',
        who: 'child',
        notes: '',
        start_date: date.toISOString().split('T')[0],
        start_time: '12:00',
        end_time: '13:00',
        is_all_day: false,
      });
    }
    setFormMode('open');
  };

  // --- UI ---
  if (!isAuthenticated)
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-6">
        <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-sm text-center">
          <Lock className="w-12 h-12 text-blue-500 mx-auto mb-4" />
          <p className="text-gray-500 mb-6">Введите PIN (1234)</p>
          <input
            type="password"
            maxLength={4}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            className="w-full text-center text-3xl border-2 rounded-xl p-3 mb-6"
          />
          <button
            onClick={handlePinSubmit}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold"
          >
            Войти
          </button>
        </div>
      </div>
    );

  if (formMode === 'open')
    return (
      <div className="h-screen flex flex-col bg-gray-50">
        <div className="bg-white px-4 py-3 flex justify-between border-b sticky top-0">
          <button onClick={() => setFormMode(null)} className="text-blue-600">
            Отмена
          </button>
          <span className="font-bold">{editingEventId ? 'Ред.' : 'Новое'}</span>
          <button onClick={handleSaveEvent} className="text-blue-600 font-bold">
            Сохранить
          </button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto">
          <input
            value={formData.title}
            onChange={(e) =>
              setFormData({ ...formData, title: e.target.value })
            }
            placeholder="Название"
            className="w-full text-lg border-b p-2 bg-transparent"
          />
          <div className="flex gap-2 overflow-x-auto">
            {WHO_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setFormData({ ...formData, who: opt.id })}
                className={`px-3 py-1 rounded-full border ${
                  formData.who === opt.id ? opt.color : 'bg-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="bg-white p-3 rounded-xl border space-y-3">
            <div className="flex justify-between">
              <span>Весь день</span>
              <input
                type="checkbox"
                checked={formData.is_all_day}
                onChange={(e) =>
                  setFormData({ ...formData, is_all_day: e.target.checked })
                }
              />
            </div>
            <input
              type="date"
              value={formData.start_date}
              onChange={(e) =>
                setFormData({ ...formData, start_date: e.target.value })
              }
              className="w-full bg-gray-50 p-2 rounded"
            />
            {!formData.is_all_day && (
              <div className="flex gap-2">
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) =>
                    setFormData({ ...formData, start_time: e.target.value })
                  }
                  className="w-full bg-gray-50 p-2 rounded"
                />
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) =>
                    setFormData({ ...formData, end_time: e.target.value })
                  }
                  className="w-full bg-gray-50 p-2 rounded"
                />
              </div>
            )}
          </div>
          <textarea
            value={formData.notes}
            onChange={(e) =>
              setFormData({ ...formData, notes: e.target.value })
            }
            placeholder="Заметки..."
            className="w-full p-3 border rounded-xl"
            rows={3}
          />
          {editingEventId && (
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button
                onClick={handleDuplicateEvent}
                className="flex items-center justify-center gap-2 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold"
              >
                <Copy size={18} /> Копия
              </button>
              <button
                onClick={() => handleDeleteEvent(editingEventId)}
                className="flex items-center justify-center gap-2 bg-red-50 text-red-500 py-3 rounded-xl font-semibold"
              >
                <Trash2 size={18} /> Удалить
              </button>
            </div>
          )}
        </div>
      </div>
    );

  const calendarDays = getDaysInMonth(currentDate);
  const filteredEventsList = getFilteredEvents();

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden font-sans">
      {/* Шапка с Табами */}
      <div className="pt-4 px-4 bg-white border-b z-10 pb-2 space-y-3">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">Календарь</h1>
          <button
            onClick={() => openForm()}
            className="bg-blue-600 text-white p-2 rounded-full shadow hover:bg-blue-700 transition"
          >
            <Plus size={20} />
          </button>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setView('month')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
              view === 'month'
                ? 'bg-white shadow-sm text-blue-600'
                : 'text-gray-500'
            }`}
          >
            Месяц
          </button>
          <button
            onClick={() => setView('agenda')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
              view === 'agenda'
                ? 'bg-white shadow-sm text-blue-600'
                : 'text-gray-500'
            }`}
          >
            Список
          </button>
        </div>
      </div>

      {/* РЕЖИМ МЕСЯЦА */}
      {view === 'month' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex justify-between items-center px-4 py-2">
            <button
              onClick={() => handleMonthChange(-1)}
              className="p-1 hover:bg-gray-100 rounded-full"
            >
              <ChevronLeft />
            </button>
            <span className="font-semibold capitalize">
              {MONTHS_RU[currentDate.getMonth()]} {currentDate.getFullYear()}
            </span>
            <button
              onClick={() => handleMonthChange(1)}
              className="p-1 hover:bg-gray-100 rounded-full"
            >
              <ChevronRight />
            </button>
          </div>
          <div className="grid grid-cols-7 border-b text-center text-xs text-gray-400 py-2">
            {DAYS_RU.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="flex-1 grid grid-cols-7 grid-rows-6">
            {calendarDays.map((day, i) => {
              if (!day)
                return (
                  <div key={i} className="border-b border-r bg-gray-50/30" />
                );
              const evs = eventsForDate(day);
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
                  className={`border-b border-r p-1 relative transition-colors active:bg-blue-50 ${
                    isToday ? 'bg-blue-50' : isSun ? 'bg-red-50/50' : ''
                  }`}
                >
                  <span
                    className={`text-xs w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday
                        ? 'bg-blue-600 text-white'
                        : isSun
                        ? 'text-red-500'
                        : 'text-gray-700'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  <div className="flex flex-col gap-0.5 mt-1">
                    {evs.slice(0, 3).map((e) => (
                      <div
                        key={e.id}
                        draggable
                        onDragStart={(ev) => handleDragStart(ev, e.id)}
                        className={`h-1.5 rounded-full ${
                          WHO_OPTIONS.find((o) => o.id === e.who)?.color.split(
                            ' '
                          )[0]
                        }`}
                      />
                    ))}
                    {evs.length > 3 && (
                      <span className="text-[9px] text-gray-400 pl-0.5 leading-none">
                        +
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* РЕЖИМ СПИСКА */}
      {view === 'agenda' && (
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
          <div className="px-4 py-2 flex gap-2 overflow-x-auto bg-white border-b">
            <button
              onClick={() => setFilterWho('all')}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                filterWho === 'all'
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white border-gray-200 text-gray-600'
              }`}
            >
              Все
            </button>
            {WHO_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setFilterWho(opt.id)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  filterWho === opt.id
                    ? opt.color + ' border-current'
                    : 'bg-white border-gray-200 text-gray-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {filteredEventsList.length === 0 ? (
              <p className="text-center text-gray-400 mt-10">Событий нет</p>
            ) : (
              filteredEventsList.map((ev) => {
                const who = WHO_OPTIONS.find((o) => o.id === ev.who);
                return (
                  <div
                    key={ev.id}
                    onClick={() => openForm(ev)}
                    className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex gap-3 active:scale-[0.99] transition-transform"
                  >
                    <div
                      className={`w-1 rounded-full self-stretch ${who?.color
                        .split(' ')[0]
                        .replace('bg-', 'bg-')}`}
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-gray-800 text-sm">
                        {ev.title}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {formatDateRU(new Date(ev.start_at))} •{' '}
                        {ev.is_all_day
                          ? 'Весь день'
                          : `${formatTimeRU(ev.start_at)} - ${formatTimeRU(
                              ev.end_at
                            )}`}
                      </div>
                      <span
                        className={`inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded font-medium ${who?.color}`}
                      >
                        {who?.label}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Шторка дня (только для режима Месяц) */}
      {showDayDrawer && view === 'month' && (
        <div
          className="absolute inset-0 bg-black/20 backdrop-blur-sm flex items-end z-50"
          onClick={() => setShowDayDrawer(false)}
        >
          <div
            className="bg-white w-full rounded-t-2xl p-4 h-1/2 flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg capitalize">
                {formatDateRU(selectedDate)}
              </h2>
              <button
                onClick={() => setShowDayDrawer(false)}
                className="p-1 bg-gray-100 rounded-full"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {eventsForDate(selectedDate).length === 0 ? (
                <p className="text-gray-400 text-center text-sm py-4">
                  Нет событий
                </p>
              ) : (
                eventsForDate(selectedDate).map((e) => (
                  <div
                    key={e.id}
                    onClick={() => openForm(e)}
                    className={`p-3 rounded-xl border-l-4 text-left ${WHO_OPTIONS.find(
                      (o) => o.id === e.who
                    )?.color.replace('text-', 'border-l-')}`}
                  >
                    <div className="font-semibold text-sm text-gray-800">
                      {e.title}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {e.is_all_day
                        ? 'Весь день'
                        : `${formatTimeRU(e.start_at)} - ${formatTimeRU(
                            e.end_at
                          )}`}
                    </div>
                  </div>
                ))
              )}
            </div>
            <button
              onClick={() => {
                setShowDayDrawer(false);
                openForm(null, selectedDate);
              }}
              className="mt-4 w-full bg-blue-600 text-white py-3 rounded-xl font-bold flex justify-center items-center gap-2 active:scale-95 transition-transform"
            >
              <Plus size={18} /> Добавить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
