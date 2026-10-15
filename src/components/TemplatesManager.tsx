import React, { useState } from 'react';
import {
  Copy,
  Check,
  Plus,
  Trash2,
  Edit2,
  RotateCcw,
  Clock,
  Bot,
  List,
  FileText,
  PlaneTakeoff,
  PlaneLanding,
  Calendar as CalendarIcon,
  CheckSquare,
  Compass,
  BookmarkCheck,
  Bookmark,
  Sparkles,
  Sun,
  Briefcase,
  Plane,
  FolderPlus,
  Star,
  Layers,
  ChevronDown,
  X,
} from 'lucide-react';
import { TaskTemplateItem, TaskCategory, DateAnchor, TaskTemplateSet, GoogleTaskList, TemplateCreationMode, CalendarListItem } from '../types';
import { ALL_CALENDARS_ID, findPrimaryCalendar } from '../services/googleCalendarApi';
import { GOOGLE_EVENT_COLORS, GOOGLE_EVENT_COLOR_OPTIONS } from '../utils/googleCalendarColors';
import {
  formatOffsetLabel,
  getCategoryBadge,
  generateTextChecklist,
  generateAssistantPrompt,
  calculateDueDate,
  templatesToEditableText,
  parseEditableTextToTemplates,
  cleanTaskTitle,
} from '../services/templateStorage';

interface TemplatesManagerProps {
  templates: TaskTemplateItem[];
  onSaveTemplates: (updated: TaskTemplateItem[]) => void;
  templateSets: TaskTemplateSet[];
  activeTemplateSetId: string;
  onSelectTemplateSet: (setId: string) => void;
  onCreateTemplateSet: (name: string, description?: string, icon?: string) => void;
  onDuplicateTemplateSet: (setId: string) => void;
  onDeleteTemplateSet: (setId: string) => void;
  onUpdateTemplateSetMeta: (setId: string, name: string, description?: string, icon?: string) => void;
  onSetAsDefaultTemplateSet: (setId: string) => void;
  onSaveAsDefault: (updated: TaskTemplateItem[]) => void;
  onResetTemplates: () => void;
  onResetToFactory?: () => void;
  hasCustomDefault?: boolean;
  taskLists?: GoogleTaskList[];
  calendars?: CalendarListItem[];
  selectedCalendar?: CalendarListItem | null;
  onSelectCalendar?: (calendar: CalendarListItem) => void;
  onAddToCalendar?: (
    calendarId: string,
    departureDate: string,
    returnDate: string,
    templates: TaskTemplateItem[],
    setName: string
  ) => Promise<void> | void;
  isAddingToCalendar?: boolean;
}

type TabMode = 'cards' | 'textEditor';
type FilterStage = 'all' | 'departure' | 'return';

export const TemplatesManager: React.FC<TemplatesManagerProps> = ({
  templates,
  onSaveTemplates,
  templateSets = [],
  activeTemplateSetId,
  onSelectTemplateSet,
  onCreateTemplateSet,
  onDuplicateTemplateSet,
  onDeleteTemplateSet,
  onUpdateTemplateSetMeta,
  onSetAsDefaultTemplateSet,
  onSaveAsDefault,
  onResetTemplates,
  onResetToFactory,
  hasCustomDefault = false,
  taskLists = [],
  calendars = [],
  selectedCalendar,
  onSelectCalendar,
  onAddToCalendar,
  isAddingToCalendar = false,
}) => {
  const [activeTab, setActiveTab] = useState<TabMode>('cards');
  const [stageFilter, setStageFilter] = useState<FilterStage>('all');
  const [copiedType, setCopiedType] = useState<'text' | 'prompt' | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<TaskTemplateItem | null>(null);
  const [defaultSavedNotification, setDefaultSavedNotification] = useState<string | null>(null);

  // "Dodaj do kalendarza" dropdown state
  const [showAddToCalendarPanel, setShowAddToCalendarPanel] = useState(false);
  const [targetCalendarId, setTargetCalendarId] = useState<string>(() => {
    if (selectedCalendar && selectedCalendar.id !== ALL_CALENDARS_ID) {
      return selectedCalendar.id;
    }
    const primaryCal = findPrimaryCalendar(calendars || []);
    return primaryCal ? primaryCal.id : 'primary';
  });
  const [specificDepartureDate, setSpecificDepartureDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [specificReturnDate, setSpecificReturnDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [addCalendarNotice, setAddCalendarNotice] = useState<string | null>(null);
  const [addCalendarError, setAddCalendarError] = useState<string | null>(null);
  const [isSubmittingToCalendar, setIsSubmittingToCalendar] = useState(false);

  const handleDepartureDateChange = (newDeparture: string) => {
    setSpecificDepartureDate(newDeparture);
    if (newDeparture && (!specificReturnDate || specificReturnDate < newDeparture)) {
      const d = new Date(newDeparture);
      d.setDate(d.getDate() + 7);
      setSpecificReturnDate(d.toISOString().split('T')[0]);
    }
  };

  const setDepartureOffsetDays = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    handleDepartureDateChange(d.toISOString().split('T')[0]);
  };

  const setReturnOffsetFromDeparture = (days: number) => {
    const base = specificDepartureDate ? new Date(specificDepartureDate) : new Date();
    base.setDate(base.getDate() + days);
    setSpecificReturnDate(base.toISOString().split('T')[0]);
  };

  const tripDurationDays = React.useMemo(() => {
    if (!specificDepartureDate || !specificReturnDate) return 0;
    const d1 = new Date(specificDepartureDate);
    const d2 = new Date(specificReturnDate);
    const diff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff : 0;
  }, [specificDepartureDate, specificReturnDate]);

  const availableCalendars = React.useMemo(() => {
    const list = (calendars || []).filter((c) => c.id !== ALL_CALENDARS_ID);
    if (list.length === 0) {
      return [{ id: 'primary', summary: 'Główny kalendarz Google', primary: true }];
    }
    const hasPrimary = list.some((c) => c.primary || c.id === 'primary');
    if (!hasPrimary) {
      return [
        { id: 'primary', summary: 'Główny kalendarz Google', primary: true },
        ...list,
      ];
    }
    return list;
  }, [calendars]);

  const [hasUserManuallyChosenCalendar, setHasUserManuallyChosenCalendar] = useState(false);

  const handleCalendarChange = (newCalId: string) => {
    setTargetCalendarId(newCalId);
    setHasUserManuallyChosenCalendar(true);
    const cal = availableCalendars.find((c) => c.id === newCalId);
    if (cal && onSelectCalendar) {
      onSelectCalendar(cal);
    }
  };

  React.useEffect(() => {
    if (!hasUserManuallyChosenCalendar) {
      if (selectedCalendar && selectedCalendar.id !== ALL_CALENDARS_ID) {
        setTargetCalendarId(selectedCalendar.id);
      } else {
        const primaryCal = findPrimaryCalendar(availableCalendars);
        if (primaryCal) {
          setTargetCalendarId(primaryCal.id);
        } else if (availableCalendars.length > 0) {
          const match = availableCalendars.find((c) => c.id === targetCalendarId);
          if (!match) {
            setTargetCalendarId(availableCalendars[0].id);
          }
        }
      }
    } else {
      if (availableCalendars.length > 0 && !availableCalendars.some((c) => c.id === targetCalendarId)) {
        setTargetCalendarId(availableCalendars[0].id);
      }
    }
  }, [selectedCalendar, availableCalendars, targetCalendarId, hasUserManuallyChosenCalendar]);

  // Template set modals
  const [showNewSetModal, setShowNewSetModal] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [newSetDesc, setNewSetDesc] = useState('');
  const [newSetIcon, setNewSetIcon] = useState('compass');

  const [showEditSetModal, setShowEditSetModal] = useState(false);
  const [editSetName, setEditSetName] = useState('');
  const [editSetDesc, setEditSetDesc] = useState('');

  // Date preview for testing calculations
  const [previewStartDate, setPreviewStartDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [previewEndDate, setPreviewEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Text editor state
  const [rawText, setRawText] = useState<string>('');
  const [textSaveNotification, setTextSaveNotification] = useState<string | null>(null);

  // Form states for single-item modal
  const [formTitle, setFormTitle] = useState('');
  const [formAnchor, setFormAnchor] = useState<DateAnchor>('departure');
  const [formOffset, setFormOffset] = useState(-1);
  const [formTime, setFormTime] = useState('18:00');
  const [formCategory, setFormCategory] = useState<TaskCategory>('other');
  const [formNotes, setFormNotes] = useState('');
  const [formCreationMode, setFormCreationMode] = useState<TemplateCreationMode>('event_and_task');
  const [formTargetTaskListId, setFormTargetTaskListId] = useState<string>('');
  const [formTargetCalendarId, setFormTargetCalendarId] = useState<string>('');
  const [formColorId, setFormColorId] = useState<string>('');

  // "Generuj wydarzenia do kalendarza" modal state
  const [showGenerateEventsModal, setShowGenerateEventsModal] = useState(false);
  const [generateDepartureDate, setGenerateDepartureDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [generateReturnDate, setGenerateReturnDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [generateCalendarId, setGenerateCalendarId] = useState<string>(() => {
    if (selectedCalendar && selectedCalendar.id !== ALL_CALENDARS_ID) {
      return selectedCalendar.id;
    }
    const primaryCal = findPrimaryCalendar(calendars || []);
    return primaryCal ? primaryCal.id : 'primary';
  });
  const [isGeneratingEvents, setIsGeneratingEvents] = useState(false);
  const [generateNotice, setGenerateNotice] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const activeSet = templateSets.find((s) => s.id === activeTemplateSetId) || templateSets[0];

  const getSetIcon = (iconName?: string) => {
    switch (iconName) {
      case 'sun':
        return <Sun className="w-4 h-4 text-amber-500" />;
      case 'briefcase':
        return <Briefcase className="w-4 h-4 text-indigo-500" />;
      case 'plane':
        return <Plane className="w-4 h-4 text-sky-500" />;
      case 'compass':
      default:
        return <Compass className="w-4 h-4 text-blue-500" />;
    }
  };

  const copyToClipboard = async (text: string, type: 'text' | 'prompt') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2500);
    } catch (err) {
      console.error('Kopiowanie do schowka nie powiodło się', err);
    }
  };

  const handleSaveCurrentAsDefault = () => {
    if (activeSet) {
      onSetAsDefaultTemplateSet(activeSet.id);
    }
    onSaveAsDefault(templates);
    setDefaultSavedNotification('Zapisano ten zestaw szablonów jako domyślny!');
    setTimeout(() => setDefaultSavedNotification(null), 3000);
  };

  const handleOpenAdd = (defaultAnchor: DateAnchor = 'departure') => {
    setEditingItem(null);
    setFormTitle('');
    setFormAnchor(defaultAnchor);
    setFormOffset(defaultAnchor === 'return' ? 0 : -1);
    setFormTime('18:00');
    setFormCategory('other');
    setFormNotes('');
    setFormCreationMode('event_and_task');
    setFormTargetTaskListId('');
    setFormTargetCalendarId('');
    setFormColorId('');
    setShowAddModal(true);
  };

  const handleOpenEdit = (item: TaskTemplateItem) => {
    setEditingItem(item);
    setFormTitle(cleanTaskTitle(item.title));
    setFormAnchor(item.anchor || 'departure');
    setFormOffset(item.daysOffset);
    setFormTime(item.time || '18:00');
    setFormCategory(item.category || 'other');
    setFormNotes(item.notes || '');
    const initialMode: TemplateCreationMode =
      item.creationMode || (item.createCalendarEvent === false ? 'task_only' : 'event_and_task');
    setFormCreationMode(initialMode);
    setFormTargetTaskListId(item.targetTaskListId || '');
    setFormTargetCalendarId(item.targetCalendarId || '');
    setFormColorId(item.colorId || '');
    setShowAddModal(true);
  };

  const handleToggleItemCalendarEvent = (id: string) => {
    const updated = templates.map((t) => {
      if (t.id === id) {
        const currentMode: TemplateCreationMode =
          t.creationMode || (t.createCalendarEvent === false ? 'task_only' : 'event_and_task');
        let nextMode: TemplateCreationMode = 'event_and_task';
        if (currentMode === 'event_and_task') nextMode = 'task_only';
        else if (currentMode === 'task_only') nextMode = 'event_only';
        else nextMode = 'event_and_task';

        return {
          ...t,
          creationMode: nextMode,
          createCalendarEvent: nextMode !== 'task_only',
          createTask: nextMode !== 'event_only',
        };
      }
      return t;
    });
    onSaveTemplates(updated);
  };

  const handleDuplicateItem = (item: TaskTemplateItem) => {
    const mode = item.creationMode || (item.createCalendarEvent === false ? 'task_only' : 'event_and_task');
    const duplicated: TaskTemplateItem = {
      ...item,
      id: `tpl-dup-${Date.now()}`,
      title: `${cleanTaskTitle(item.title)} (kopia)`,
      creationMode: mode,
      createCalendarEvent: mode !== 'task_only',
      createTask: mode !== 'event_only',
      targetTaskListId: item.targetTaskListId,
      targetTaskListTitle: item.targetTaskListTitle,
      targetCalendarId: item.targetCalendarId,
      colorId: item.colorId,
    };
    onSaveTemplates([...templates, duplicated]);
  };

  const handleDeleteItem = (id: string) => {
    const filtered = templates.filter((t) => t.id !== id);
    onSaveTemplates(filtered);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const normalizedTime = formTime.trim() || undefined;
    const cleanTitle = cleanTaskTitle(formTitle);

    const selectedListObj = taskLists.find((tl) => tl.id === formTargetTaskListId);
    const targetTaskListId = formTargetTaskListId || undefined;
    const targetTaskListTitle = selectedListObj?.title || undefined;
    const targetCalendarId = formTargetCalendarId || undefined;
    const colorId = formColorId || undefined;

    const createCalendarEvent = formCreationMode !== 'task_only';
    const createTask = formCreationMode !== 'event_only';

    if (editingItem) {
      const updated = templates.map((t) =>
        t.id === editingItem.id
          ? {
              ...t,
              title: cleanTitle,
              anchor: formAnchor,
              daysOffset: Number(formOffset),
              time: normalizedTime,
              category: formCategory || 'other',
              notes: formNotes.trim() || undefined,
              creationMode: formCreationMode,
              createCalendarEvent,
              createTask,
              targetTaskListId,
              targetTaskListTitle,
              targetCalendarId,
              colorId,
            }
          : t
      );
      onSaveTemplates(updated);
    } else {
      const newItem: TaskTemplateItem = {
        id: `tpl-${Date.now()}`,
        title: cleanTitle,
        anchor: formAnchor,
        daysOffset: Number(formOffset),
        time: normalizedTime,
        category: formCategory || 'other',
        notes: formNotes.trim() || undefined,
        creationMode: formCreationMode,
        createCalendarEvent,
        createTask,
        targetTaskListId,
        targetTaskListTitle,
        targetCalendarId,
        colorId,
      };
      onSaveTemplates([...templates, newItem]);
    }

    setShowAddModal(false);
  };

  // Switch to text editor tab
  const handleOpenTextEditor = () => {
    setRawText(templatesToEditableText(templates));
    setActiveTab('textEditor');
  };

  // Save parsed text editor
  const handleSaveTextEditor = (saveAsDef: boolean = false) => {
    const parsed = parseEditableTextToTemplates(rawText);
    if (saveAsDef) {
      onSaveAsDefault(parsed);
      setTextSaveNotification(`Zastosowano i zapisano ${parsed.length} zadań jako domyślny szablon!`);
    } else {
      onSaveTemplates(parsed);
      setTextSaveNotification(`Zastosowano ${parsed.length} zadań z tekstu!`);
    }
    setTimeout(() => setTextSaveNotification(null), 3000);
  };

  const handleCreateNewSetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSetName.trim()) return;
    onCreateTemplateSet(newSetName.trim(), newSetDesc.trim(), newSetIcon);
    setNewSetName('');
    setNewSetDesc('');
    setShowNewSetModal(false);
  };

  const handleEditSetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSetName.trim() || !activeSet) return;
    onUpdateTemplateSetMeta(activeSet.id, editSetName.trim(), editSetDesc.trim());
    setShowEditSetModal(false);
  };

  const handleOpenEditSet = () => {
    if (!activeSet) return;
    setEditSetName(activeSet.name);
    setEditSetDesc(activeSet.description || '');
    setShowEditSetModal(true);
  };

  // Counts
  const departureCount = templates.filter((t) => (t.anchor || 'departure') === 'departure').length;
  const returnCount = templates.filter((t) => t.anchor === 'return').length;

  const filteredTemplates = templates.filter((item) => {
    const itemAnchor = item.anchor || 'departure';
    if (stageFilter === 'departure') return itemAnchor === 'departure';
    if (stageFilter === 'return') return itemAnchor === 'return';
    return true;
  });

  // Sort: departure tasks first (by offset, then by time), then return tasks (by offset, then by time)
  const sortedTemplates = [...filteredTemplates].sort((a, b) => {
    const aAnchor = a.anchor || 'departure';
    const bAnchor = b.anchor || 'departure';
    if (aAnchor !== bAnchor) {
      return aAnchor === 'departure' ? -1 : 1;
    }
    if (a.daysOffset !== b.daysOffset) {
      return a.daysOffset - b.daysOffset;
    }
    return (a.time || '00:00').localeCompare(b.time || '00:00');
  });

  const handleConfirmAddToCalendar = async () => {
    if (!onAddToCalendar) return;
    setIsSubmittingToCalendar(true);
    setAddCalendarNotice(null);
    setAddCalendarError(null);
    try {
      await onAddToCalendar(
        targetCalendarId || 'primary',
        specificDepartureDate,
        specificReturnDate,
        templates,
        activeSet?.name || 'Szablon'
      );
      setAddCalendarNotice(
        `Pomyślnie utworzono zadania oraz wydarzenia w kalendarzu na okres od ${specificDepartureDate} do ${specificReturnDate}!`
      );
      setTimeout(() => {
        setAddCalendarNotice(null);
        setShowAddToCalendarPanel(false);
      }, 4000);
    } catch (err: any) {
      console.error('Błąd podczas dodawania szablonu do kalendarza:', err);
      setAddCalendarError(err.message || 'Wystąpił błąd podczas dodawania do kalendarza');
    } finally {
      setIsSubmittingToCalendar(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs overflow-hidden">
      {/* Template Sets Switcher Bar */}
      <div className="p-4 sm:p-5 border-b border-neutral-200 bg-neutral-50/70">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
              Zestawy szablonów zadań ({templateSets.length})
            </span>
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-y-2 self-start sm:self-auto">
            <button
              id="btn-generate-events-to-calendar"
              type="button"
              onClick={() => {
                setGenerateCalendarId(
                  selectedCalendar && selectedCalendar.id !== ALL_CALENDARS_ID
                    ? selectedCalendar.id
                    : (findPrimaryCalendar(calendars || [])?.id || 'primary')
                );
                setGenerateNotice(null);
                setGenerateError(null);
                setShowGenerateEventsModal(true);
              }}
              className="inline-flex items-center space-x-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3.5 py-1.5 rounded-xl shadow-xs transition-all cursor-pointer active:scale-98"
              title="Generuj wydarzenia do kalendarza na podstawie aktywnego szablonu"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Generuj wydarzenia do kalendarza</span>
            </button>

            <button
              type="button"
              onClick={() => setShowNewSetModal(true)}
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Utwórz nowy szablon</span>
            </button>
          </div>
        </div>

        {/* Template Set Tabs */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-thin">
          {templateSets.map((set) => {
            const isActive = set.id === activeTemplateSetId;
            return (
              <button
                key={set.id}
                type="button"
                onClick={() => onSelectTemplateSet(set.id)}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all shrink-0 cursor-pointer border ${
                  isActive
                    ? 'bg-white text-blue-900 border-blue-400 shadow-xs font-bold ring-2 ring-blue-500/20'
                    : 'bg-neutral-100/80 text-neutral-600 hover:text-neutral-900 border-neutral-200 hover:bg-white'
                }`}
              >
                <span>{getSetIcon(set.icon)}</span>
                <span>{set.name}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-200/60 text-neutral-600 font-normal">
                  {set.templates?.length || 0}
                </span>
                {set.isDefault && (
                  <span className="inline-flex items-center text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-full">
                    Domyślny
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Template Context Bar */}
      <div className="p-5 sm:p-6 border-b border-neutral-100 bg-gradient-to-r from-blue-50/60 via-indigo-50/40 to-white">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                {getSetIcon(activeSet?.icon)}
              </span>
              <h3 className="text-base sm:text-lg font-bold text-neutral-900">
                {activeSet?.name || 'Zestaw szablonów'}
              </h3>
              {activeSet?.isDefault ? (
                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <BookmarkCheck className="w-3 h-3 text-emerald-600" />
                  <span>Domyślny zestaw szablonów</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleSaveCurrentAsDefault}
                  className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-neutral-600 hover:text-emerald-700 bg-neutral-100 hover:bg-emerald-50 border border-neutral-250 transition-colors cursor-pointer"
                  title="Ustaw ten szablon jako domyślny przy generowaniu zadań"
                >
                  <Star className="w-3 h-3" />
                  <span>Ustaw jako domyślny</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleOpenEditSet}
                className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                title="Edytuj nazwę i opis szablonu"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => activeSet && onDuplicateTemplateSet(activeSet.id)}
                className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                title="Duplikuj ten szablon"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>

              {templateSets.length > 1 && (
                <button
                  type="button"
                  onClick={() => activeSet && onDeleteTemplateSet(activeSet.id)}
                  className="p-1 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  title="Usuń ten szablon"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
              {activeSet?.description ||
                'Zadania przed terminem i po terminie z przypisanymi godzinami. Wszystkie nazwy zadań są czyste bez przedrostków godzin.'}
            </p>
          </div>

          {/* Quick Actions Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn-save-as-default"
              onClick={handleSaveCurrentAsDefault}
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-250 py-2 px-3.5 rounded-xl transition-all shadow-2xs active:scale-98 cursor-pointer"
              title="Zapisz ten szablon jako domyślny"
            >
              <BookmarkCheck className="w-4 h-4 text-emerald-600" />
              <span>Zapisz jako domyślny</span>
            </button>

            <button
              id="btn-copy-checklist"
              onClick={() =>
                copyToClipboard(
                  generateTextChecklist(templates, activeSet?.name || 'Zadania', previewStartDate, previewEndDate),
                  'text'
                )
              }
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-neutral-800 bg-white hover:bg-neutral-50 border border-neutral-300 py-2 px-3.5 rounded-xl shadow-2xs transition-all active:scale-98"
              title="Kopiuj listę jako tekst z polami do zaznaczenia"
            >
              {copiedType === 'text' ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">Skopiowano checklistę!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-neutral-500" />
                  <span>Kopiuj checklistę</span>
                </>
              )}
            </button>

            <button
              id="btn-copy-prompt"
              onClick={() =>
                copyToClipboard(
                  generateAssistantPrompt(templates, activeSet?.name || 'Zadania', previewStartDate, previewEndDate),
                  'prompt'
                )
              }
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 py-2 px-3.5 rounded-xl transition-all active:scale-98"
              title="Kopiuj gotowy prompt dla Asystenta Google lub Gemini"
            >
              {copiedType === 'prompt' ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">Skopiowano Prompt!</span>
                </>
              ) : (
                <>
                  <Bot className="w-4 h-4 text-purple-600" />
                  <span>Prompt dla Asystenta</span>
                </>
              )}
            </button>

            {/* Dodaj do kalendarza button */}
            <button
              id="btn-templates-add-to-calendar"
              type="button"
              onClick={() => setShowAddToCalendarPanel((prev) => !prev)}
              className={`inline-flex items-center space-x-1.5 text-xs font-semibold py-2 px-3.5 rounded-xl transition-all shadow-2xs cursor-pointer border ${
                showAddToCalendarPanel
                  ? 'bg-blue-600 text-white border-blue-600 shadow-blue-500/25 ring-2 ring-blue-500/30'
                  : 'text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200 active:scale-98'
              }`}
              title="Rozwiń panel i dodaj zadania oraz wydarzenia z tego szablonu bezpośrednio do kalendarza"
            >
              <CalendarIcon className="w-4 h-4" />
              <span>Dodaj do kalendarza</span>
              <ChevronDown
                className={`w-3.5 h-3.5 ml-0.5 transition-transform duration-200 ${
                  showAddToCalendarPanel ? 'rotate-180' : ''
                }`}
              />
            </button>

            <button
              id="btn-add-template-item"
              onClick={() => handleOpenAdd('departure')}
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 py-2 px-3.5 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Dodaj zadanie</span>
            </button>
          </div>
        </div>

        {/* Expandable "Dodaj do kalendarza" Panel */}
        {showAddToCalendarPanel && (
          <div
            id="panel-templates-add-to-calendar"
            className="mt-4 p-4 sm:p-5 rounded-2xl border border-blue-200 bg-blue-50/70 shadow-xs space-y-4 animate-in fade-in duration-200"
          >
            <div className="flex items-center justify-between pb-3 border-b border-blue-200/70">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-blue-600 text-white shadow-xs">
                  <CalendarIcon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-neutral-900">
                    Dodaj szablon „{activeSet?.name || 'Szablon'}” do Kalendarza
                  </h4>
                  <p className="text-xs text-neutral-600">
                    Wybierz kalendarz docelowy oraz wskaż datę początkową i końcową
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddToCalendarPanel(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-blue-100/60 transition-colors cursor-pointer"
                title="Zamknij"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {addCalendarNotice && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{addCalendarNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAddCalendarNotice(null)}
                  className="text-emerald-700 hover:text-emerald-900 text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {addCalendarError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Trash2 className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{addCalendarError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAddCalendarError(null)}
                  className="text-rose-700 hover:text-rose-900 text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* 1. Wybór kalendarza */}
              <div className="bg-white/80 p-3 rounded-xl border border-blue-200/80 shadow-2xs flex flex-col justify-between">
                <div>
                  <label
                    htmlFor="select-templates-target-calendar"
                    className="block text-xs font-bold text-neutral-800 mb-1.5"
                  >
                    1. Wybór kalendarza:
                  </label>
                  <select
                    id="select-templates-target-calendar"
                    value={targetCalendarId}
                    onChange={(e) => handleCalendarChange(e.target.value)}
                    className="w-full text-xs sm:text-sm bg-white border border-neutral-300 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium cursor-pointer shadow-2xs"
                  >
                    {availableCalendars.map((cal) => {
                      const cleanSummary =
                        cal.summary
                          ?.replace(/\s*[([](?:główny|glowny|primary)[)\]]/gi, '')
                          ?.replace(/\s*-\s*(?:główny|glowny|primary)/gi, '')
                          ?.trim() || cal.summary || 'Kalendarz';
                      const label = cal.primary ? `${cleanSummary} (Główny)` : cleanSummary;
                      return (
                        <option key={cal.id} value={cal.id}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <p className="text-[11px] text-neutral-500 mt-2">
                  Kalendarz Google na wydarzenia.
                </p>
              </div>

              {/* 2. Wybór daty początkowej */}
              <div className="bg-white/80 p-3 rounded-xl border border-blue-200/80 shadow-2xs flex flex-col justify-between">
                <div>
                  <label
                    htmlFor="input-templates-departure-date"
                    className="block text-xs font-bold text-neutral-800 mb-1.5"
                  >
                    2. Data początkowa (Start):
                  </label>
                  <div className="relative">
                    <CalendarIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                    <input
                      id="input-templates-departure-date"
                      type="date"
                      value={specificDepartureDate}
                      onChange={(e) => handleDepartureDateChange(e.target.value)}
                      className="w-full text-xs sm:text-sm bg-white border border-neutral-300 rounded-xl pl-9 pr-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer font-medium text-neutral-800 shadow-2xs"
                    />
                  </div>
                  <div className="flex items-center space-x-1 mt-2">
                    <button
                      type="button"
                      onClick={() => setDepartureOffsetDays(0)}
                      className="px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
                      title="Ustaw dzisiejszą datę"
                    >
                      Dziś
                    </button>
                    <button
                      type="button"
                      onClick={() => setDepartureOffsetDays(1)}
                      className="px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
                      title="Ustaw jutro"
                    >
                      Jutro
                    </button>
                    <button
                      type="button"
                      onClick={() => setDepartureOffsetDays(7)}
                      className="px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
                      title="Ustaw za tydzień"
                    >
                      +7 dni
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-neutral-500 mt-2">
                  Dla zadań powiązanych z terminem początkowym.
                </p>
              </div>

              {/* 3. Wybór daty końcowej */}
              <div className="bg-white/80 p-3 rounded-xl border border-blue-200/80 shadow-2xs flex flex-col justify-between">
                <div>
                  <label
                    htmlFor="input-templates-return-date"
                    className="block text-xs font-bold text-neutral-800 mb-1.5"
                  >
                    3. Data końcowa (Koniec):
                  </label>
                  <div className="relative">
                    <CalendarIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                    <input
                      id="input-templates-return-date"
                      type="date"
                      value={specificReturnDate}
                      min={specificDepartureDate || undefined}
                      onChange={(e) => setSpecificReturnDate(e.target.value)}
                      className="w-full text-xs sm:text-sm bg-white border border-neutral-300 rounded-xl pl-9 pr-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer font-medium text-neutral-800 shadow-2xs"
                    />
                  </div>
                  <div className="flex items-center space-x-1 mt-2">
                    <button
                      type="button"
                      onClick={() => setReturnOffsetFromDeparture(3)}
                      className="px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
                      title="+3 dni od daty początkowej"
                    >
                      +3 dni
                    </button>
                    <button
                      type="button"
                      onClick={() => setReturnOffsetFromDeparture(7)}
                      className="px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
                      title="+7 dni od daty początkowej"
                    >
                      +7 dni
                    </button>
                    <button
                      type="button"
                      onClick={() => setReturnOffsetFromDeparture(14)}
                      className="px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
                      title="+14 dni od daty początkowej"
                    >
                      +14 dni
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-neutral-500 mt-2">
                  Dla zadań powiązanych z terminem końcowym.
                </p>
              </div>
            </div>

            {/* Podsumowanie i przycisk zatwierdzenia */}
            <div className="pt-3 border-t border-blue-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-neutral-600">
                Start: <strong className="text-neutral-900">{specificDepartureDate}</strong> &rarr; Koniec:{' '}
                <strong className="text-neutral-900">{specificReturnDate}</strong>{' '}
                <span className="inline-block ml-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold text-[11px]">
                  {tripDurationDays} {tripDurationDays === 1 ? 'dzień' : 'dni'}
                </span>
                <span className="hidden sm:inline text-neutral-500 ml-1.5">
                  &bull; {templates.length} {templates.length === 1 ? 'pozycja' : 'pozycji'} z szablonu „{activeSet?.name}”
                </span>
              </div>

              <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setShowAddToCalendarPanel(false)}
                  className="px-3.5 py-2 text-xs font-medium text-neutral-600 hover:bg-blue-100/60 rounded-xl transition-colors cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  id="btn-confirm-templates-add-to-calendar"
                  disabled={isSubmittingToCalendar || isAddingToCalendar}
                  onClick={handleConfirmAddToCalendar}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 rounded-xl shadow-xs transition-colors cursor-pointer inline-flex items-center space-x-2"
                >
                  {isSubmittingToCalendar || isAddingToCalendar ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                      <span>Dodawanie do kalendarza...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Dodaj do kalendarza</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {defaultSavedNotification && (
          <div className="mt-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center space-x-2 animate-in fade-in">
            <BookmarkCheck className="w-4 h-4 text-emerald-600" />
            <span>{defaultSavedNotification}</span>
          </div>
        )}
      </div>

      {/* Tabs Switcher: Cards vs Text Editor */}
      <div className="px-5 sm:px-6 pt-3 pb-2 border-b border-neutral-100 flex flex-wrap items-center justify-between gap-3 bg-neutral-50/40">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('cards')}
            className={`inline-flex items-center space-x-1.5 text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors ${
              activeTab === 'cards'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Karty zadań ({templates.length})</span>
          </button>

          <button
            onClick={handleOpenTextEditor}
            className={`inline-flex items-center space-x-1.5 text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors ${
              activeTab === 'textEditor'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Edytor tekstu (zbiorczy)</span>
          </button>
        </div>

        {/* Stage Filter Buttons (Cards mode only) */}
        {activeTab === 'cards' && (
          <div className="flex items-center space-x-1 bg-neutral-200/60 p-0.5 rounded-lg text-xs">
            <button
              onClick={() => setStageFilter('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                stageFilter === 'all'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Wszystkie ({templates.length})
            </button>
            <button
              onClick={() => setStageFilter('departure')}
              className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-md font-medium transition-colors ${
                stageFilter === 'departure'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <PlaneTakeoff className="w-3 h-3" />
              <span>Przed terminem ({departureCount})</span>
            </button>
            <button
              onClick={() => setStageFilter('return')}
              className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-md font-medium transition-colors ${
                stageFilter === 'return'
                  ? 'bg-white text-purple-700 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <PlaneLanding className="w-3 h-3" />
              <span>Po terminie ({returnCount})</span>
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: CARDS VIEW */}
      {activeTab === 'cards' && (
        <div className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sortedTemplates.map((item) => {
              const badge = getCategoryBadge(item.category);
              const isReturnAnchor = item.anchor === 'return';
              const cleanTitle = cleanTaskTitle(item.title);
              const formattedDueDate = calculateDueDate(
                previewStartDate,
                previewEndDate,
                item.daysOffset,
                item.anchor,
                item.time
              );

              return (
                <div
                  key={item.id}
                  className="group relative p-4 rounded-xl border border-neutral-200 hover:border-neutral-300 bg-white hover:bg-neutral-50/50 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                        {isReturnAnchor ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                            <PlaneLanding className="w-3 h-3 mr-1 text-purple-600" />
                            Koniec
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            <PlaneTakeoff className="w-3 h-3 mr-1 text-blue-600" />
                            Start
                          </span>
                        )}

                        {/* Color badge if custom color chosen */}
                        {item.colorId && GOOGLE_EVENT_COLORS[item.colorId] && (
                          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 text-neutral-800 border border-neutral-200">
                            <span
                              className="w-2 h-2 rounded-full inline-block shrink-0"
                              style={{ backgroundColor: GOOGLE_EVENT_COLORS[item.colorId].hex }}
                            />
                            <span>{GOOGLE_EVENT_COLORS[item.colorId].name}</span>
                          </span>
                        )}

                        {/* Target Calendar badge if set */}
                        {item.targetCalendarId && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            <CalendarIcon className="w-2.5 h-2.5 mr-1" />
                            <span className="truncate max-w-[120px]">
                              {calendars.find((c) => c.id === item.targetCalendarId)?.summary || 'Kalendarz'}
                            </span>
                          </span>
                        )}

                        {/* Target Task List badge if set */}
                        {(item.targetTaskListTitle || item.targetTaskListId) && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckSquare className="w-2.5 h-2.5 mr-1" />
                            <span className="truncate max-w-[120px]">
                              {item.targetTaskListTitle ||
                                taskLists.find((tl) => tl.id === item.targetTaskListId)?.title ||
                                'Google Tasks'}
                            </span>
                          </span>
                        )}

                        {item.time ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 shadow-2xs">
                            <Clock className="w-3 h-3 mr-1 text-blue-600" />
                            {item.time}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] text-neutral-400 bg-neutral-50 border border-neutral-200">
                            Cały dzień
                          </span>
                        )}

                        {(() => {
                          const itemMode: TemplateCreationMode =
                            item.creationMode ||
                            (item.createCalendarEvent === false ? 'task_only' : 'event_and_task');

                          if (itemMode === 'event_only') {
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleItemCalendarEvent(item.id);
                                }}
                                className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors cursor-pointer bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100"
                                title="Kliknij, aby przełączyć: Wydarzenie i zadanie / Tylko zadanie / Tylko Wydarzenie"
                              >
                                <CalendarIcon className="w-3 h-3 mr-1 text-purple-600" />
                                Tylko Wydarzenie
                              </button>
                            );
                          }
                          if (itemMode === 'task_only') {
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleItemCalendarEvent(item.id);
                                }}
                                className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors cursor-pointer bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-200"
                                title="Kliknij, aby przełączyć: Wydarzenie i zadanie / Tylko zadanie / Tylko Wydarzenie"
                              >
                                <CheckSquare className="w-3 h-3 mr-1 text-neutral-500" />
                                Tylko zadanie
                              </button>
                            );
                          }
                          return (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleItemCalendarEvent(item.id);
                              }}
                              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors cursor-pointer bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                              title="Kliknij, aby przełączyć: Wydarzenie i zadanie / Tylko zadanie / Tylko Wydarzenie"
                            >
                              <CalendarIcon className="w-3 h-3 mr-1 text-emerald-600" />
                              Wydarzenie i zadanie
                            </button>
                          );
                        })()}

                        {item.targetTaskListTitle && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
                            <Layers className="w-3 h-3 mr-1 text-indigo-600" />
                            Lista: {item.targetTaskListTitle}
                          </span>
                        )}
                      </div>

                      <span
                        className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                          isReturnAnchor
                            ? 'text-purple-700 bg-purple-50 border-purple-200'
                            : 'text-blue-700 bg-blue-50 border-blue-200'
                        }`}
                      >
                        {formatOffsetLabel(item.daysOffset, item.anchor, item.time)}
                      </span>
                    </div>

                    <h4 className="text-xs sm:text-sm font-semibold text-neutral-900 leading-snug">
                      {cleanTitle}
                    </h4>

                    {item.notes && (
                      <p className="text-[11px] text-neutral-500 leading-relaxed">
                        {item.notes}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-neutral-100 flex items-center justify-between text-[11px]">
                    <span className="text-neutral-500">
                      Termin podglądu:{' '}
                      <strong className={isReturnAnchor ? 'text-purple-800' : 'text-blue-800'}>
                        {formattedDueDate}
                        {item.time ? `, godz. ${item.time}` : ''}
                      </strong>
                    </span>

                    <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleDuplicateItem(item)}
                        className="p-1 text-neutral-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors cursor-pointer"
                        title="Duplikuj zadanie"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="p-1 text-neutral-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                        title="Edytuj zadanie i godzinę"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                        title="Usuń z szablonu"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Add Buttons */}
          <div className="mt-4 pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => handleOpenAdd('departure')}
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 py-2 px-3.5 rounded-xl transition-colors border border-blue-200/80 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <PlaneTakeoff className="w-3.5 h-3.5" />
              <span>Dodaj zadanie przed terminem</span>
            </button>

            <button
              onClick={() => handleOpenAdd('return')}
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 py-2 px-3.5 rounded-xl transition-colors border border-purple-200/80 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <PlaneLanding className="w-3.5 h-3.5" />
              <span>Dodaj zadanie po terminie</span>
            </button>

            <button
              onClick={handleSaveCurrentAsDefault}
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 py-2 px-3.5 rounded-xl transition-colors border border-emerald-250 cursor-pointer"
            >
              <BookmarkCheck className="w-4 h-4 text-emerald-600" />
              <span>Zapisz ten szablon jako domyślny</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: TEXT EDITOR */}
      {activeTab === 'textEditor' && (
        <div className="p-4 sm:p-6 space-y-4">
          <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-3.5 text-xs text-neutral-700 leading-relaxed space-y-1.5">
            <p className="font-semibold text-neutral-900">
              Edytor tekstu — szybka edycja całej listy zadań szablonu:
            </p>
            <p className="text-neutral-600 text-[11px]">
              Format linii: <code>[-1] [start] [18:00] [przygotowania] Przygotowanie materiałów</code> lub{' '}
              <code>[1] [koniec] [21:00] [podsumowanie] Podsumowanie i raport</code>.
            </p>
          </div>

          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={12}
            className="w-full font-mono text-xs p-3.5 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-neutral-900 text-neutral-100"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => handleSaveTextEditor(false)}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs cursor-pointer"
            >
              Zastosuj do bieżącego szablonu
            </button>

            {textSaveNotification && (
              <span className="text-xs font-semibold text-emerald-700 animate-in fade-in">
                {textSaveNotification}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Single Task Edit/Add Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-xl border border-neutral-200 max-h-[90vh] overflow-y-auto my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="text-base font-bold text-neutral-900">
                {editingItem ? 'Edytuj zadanie w szablonie' : 'Nowe zadanie w szablonie'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-neutral-400 hover:text-neutral-600 text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Treść zadania (bez godzin — godziny ustawia się poniżej)
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="np. Pakowanie lub Wyłączyć termę"
                  className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
              </div>

              {/* Anchor selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-neutral-700">
                  Względem której daty ma być liczony termin?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormAnchor('departure');
                      if (formOffset > 0) setFormOffset(-1);
                    }}
                    className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                      formAnchor === 'departure'
                        ? 'bg-blue-50 text-blue-800 border-blue-500 font-semibold shadow-2xs'
                        : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                    }`}
                  >
                    <PlaneTakeoff className="w-4 h-4 text-blue-600" />
                    <span>Data początkowa (Start)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormAnchor('return');
                    }}
                    className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                      formAnchor === 'return'
                        ? 'bg-purple-50 text-purple-800 border-purple-500 font-semibold shadow-2xs'
                        : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                    }`}
                  >
                    <PlaneLanding className="w-4 h-4 text-purple-600" />
                    <span>Data końcowa (Koniec)</span>
                  </button>
                </div>
              </div>

              {/* Termin wydarzenia with 3 kafelki: -1, w dniu wydarzenia, +1 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-neutral-700">
                    Termin wydarzenia
                  </label>
                  <span
                    className={`text-xs font-bold ${
                      formAnchor === 'return' ? 'text-purple-700' : 'text-blue-700'
                    }`}
                  >
                    {formatOffsetLabel(formOffset, formAnchor, formTime)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormOffset(-1)}
                    className={`py-3 px-2 rounded-xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                      formOffset === -1
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs font-bold ring-2 ring-blue-500/20'
                        : 'bg-white hover:bg-neutral-50 text-neutral-800 border-neutral-250'
                    }`}
                  >
                    <span className="text-base font-extrabold">-1</span>
                    <span
                      className={`text-[10px] mt-0.5 font-medium ${
                        formOffset === -1 ? 'text-blue-100' : 'text-neutral-500'
                      }`}
                    >
                      1 dzień przed
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormOffset(0)}
                    className={`py-3 px-2 rounded-xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                      formOffset === 0
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs font-bold ring-2 ring-blue-500/20'
                        : 'bg-white hover:bg-neutral-50 text-neutral-800 border-neutral-250'
                    }`}
                  >
                    <span className="text-xs sm:text-sm font-extrabold leading-tight">
                      w dniu wydarzenia
                    </span>
                    <span
                      className={`text-[10px] mt-0.5 font-medium ${
                        formOffset === 0 ? 'text-blue-100' : 'text-neutral-500'
                      }`}
                    >
                      [0]
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormOffset(1)}
                    className={`py-3 px-2 rounded-xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                      formOffset === 1
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs font-bold ring-2 ring-blue-500/20'
                        : 'bg-white hover:bg-neutral-50 text-neutral-800 border-neutral-250'
                    }`}
                  >
                    <span className="text-base font-extrabold">+1</span>
                    <span
                      className={`text-[10px] mt-0.5 font-medium ${
                        formOffset === 1 ? 'text-blue-100' : 'text-neutral-500'
                      }`}
                    >
                      1 dzień po
                    </span>
                  </button>
                </div>

                <div className="pt-1 flex items-center space-x-2">
                  <span className="text-[11px] text-neutral-500">Inna liczba dni (opcjonalnie):</span>
                  <input
                    type="number"
                    value={formOffset}
                    onChange={(e) => setFormOffset(Number(e.target.value))}
                    className="w-20 text-xs border border-neutral-300 rounded-lg p-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white text-neutral-800"
                  />
                </div>
              </div>

              {/* Hour selector */}
              <div className="space-y-1.5 bg-blue-50/50 p-3 rounded-xl border border-blue-200/80">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-blue-900 flex items-center space-x-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    <span>Konkretna godzina zadania</span>
                  </label>
                  <span className="text-xs font-bold text-blue-800">
                    {formTime ? `Godzina: ${formTime}` : 'Cały dzień'}
                  </span>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="text-xs sm:text-sm font-mono border border-blue-300 bg-white rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none text-neutral-900"
                  />
                  <button
                    type="button"
                    onClick={() => setFormTime('')}
                    className={`text-xs px-2.5 py-2 rounded-lg border transition-all cursor-pointer ${
                      !formTime
                        ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                        : 'bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50'
                    }`}
                  >
                    Cały dzień
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {['08:00', '10:00', '12:00', '14:00', '18:00', '20:00', '21:00'].map((timePreset) => (
                    <button
                      key={timePreset}
                      type="button"
                      onClick={() => setFormTime(timePreset)}
                      className={`text-[10px] py-1 px-2 rounded-md border transition-all cursor-pointer ${
                        formTime === timePreset
                          ? 'bg-blue-700 text-white border-blue-700 font-bold'
                          : 'bg-white text-blue-900 border-blue-200 hover:bg-blue-100/60'
                      }`}
                    >
                      {timePreset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Docelowa lista Google Tasks */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Docelowa lista Google Tasks
                </label>
                <select
                  value={formTargetTaskListId}
                  onChange={(e) => setFormTargetTaskListId(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white text-neutral-900"
                >
                  <option value="">Domyślna lista (Zadania)</option>
                  {(taskLists || []).map((tl) => (
                    <option key={tl.id} value={tl.id}>
                      {tl.title}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Dostępnych list zadań: {taskLists?.length || 0}. Wybierz listę, do której trafi zadanie.
                </p>
              </div>

              {/* Docelowy Kalendarz Google */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Docelowy Kalendarz Google
                </label>
                <select
                  value={formTargetCalendarId}
                  onChange={(e) => setFormTargetCalendarId(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white text-neutral-900"
                >
                  <option value="">Kalendarz domyślny / główny</option>
                  {(calendars || [])
                    .filter((c) => c.id !== ALL_CALENDARS_ID)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.summary} {c.primary ? '(Główny)' : ''}
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Kalendarz, w którym ma zostać utworzone wydarzenie.
                </p>
              </div>

              {/* Kolor wydarzenia w Kalendarzu Google */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-700">
                    Kolor wydarzenia w Kalendarzu Google
                  </label>
                  {formColorId && GOOGLE_EVENT_COLORS[formColorId] && (
                    <span className="text-xs font-bold text-neutral-800 flex items-center space-x-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ backgroundColor: GOOGLE_EVENT_COLORS[formColorId].hex }}
                      />
                      <span>{GOOGLE_EVENT_COLORS[formColorId].name}</span>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 p-2.5 bg-neutral-50 rounded-xl border border-neutral-200">
                  <button
                    type="button"
                    onClick={() => setFormColorId('')}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-all cursor-pointer ${
                      !formColorId
                        ? 'bg-blue-600 text-white border-blue-600 font-semibold shadow-2xs'
                        : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100'
                    }`}
                    title="Użyj domyślnego koloru kalendarza"
                  >
                    Domyślny kolor kalendarza
                  </button>
                  {GOOGLE_EVENT_COLOR_OPTIONS.map((c) => {
                    const isSelected = formColorId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setFormColorId(c.id || '')}
                        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer border ${
                          isSelected
                            ? 'ring-2 ring-blue-600 ring-offset-2 scale-110 border-neutral-400'
                            : 'hover:scale-105 border-neutral-300/80'
                        }`}
                        style={{ backgroundColor: c.hex }}
                        title={c.name}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 text-white drop-shadow-xs" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Notatka do zadania (opcjonalnie)
                </label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Dodatkowe informacje..."
                  rows={2}
                  className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Choice: Mode of creation */}
              <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-neutral-800">
                    Sposób tworzenia
                  </label>
                  <span className="text-[11px] text-neutral-500">Wybierz typ wpisu</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormCreationMode('event_and_task')}
                    className={`p-2.5 rounded-xl border text-left flex items-start space-x-2 transition-all cursor-pointer ${
                      formCreationMode === 'event_and_task'
                        ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-950 shadow-2xs'
                        : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg mt-0.5 shrink-0 ${formCreationMode === 'event_and_task' ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}>
                      <CalendarIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold flex items-center">
                        <span className="truncate">Wydarzenie i zadanie</span>
                        {formCreationMode === 'event_and_task' && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-emerald-600 inline-block shrink-0" />}
                      </div>
                      <div className="text-[10px] text-neutral-500 mt-0.5 leading-snug">
                        Wpis w Kalendarzu Google + zadanie w Tasks
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormCreationMode('task_only')}
                    className={`p-2.5 rounded-xl border text-left flex items-start space-x-2 transition-all cursor-pointer ${
                      formCreationMode === 'task_only'
                        ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/20 text-blue-950 shadow-2xs'
                        : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg mt-0.5 shrink-0 ${formCreationMode === 'task_only' ? 'bg-blue-100 text-blue-700' : 'bg-neutral-100 text-neutral-500'}`}>
                      <CheckSquare className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold flex items-center">
                        <span className="truncate">Tylko zadanie</span>
                        {formCreationMode === 'task_only' && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-blue-600 inline-block shrink-0" />}
                      </div>
                      <div className="text-[10px] text-neutral-500 mt-0.5 leading-snug">
                        Tylko Google Tasks z terminem (bez kalendarza)
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormCreationMode('event_only')}
                    className={`p-2.5 rounded-xl border text-left flex items-start space-x-2 transition-all cursor-pointer ${
                      formCreationMode === 'event_only'
                        ? 'bg-purple-50 border-purple-500 ring-2 ring-purple-500/20 text-purple-950 shadow-2xs'
                        : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg mt-0.5 shrink-0 ${formCreationMode === 'event_only' ? 'bg-purple-100 text-purple-700' : 'bg-neutral-100 text-neutral-500'}`}>
                      <CalendarIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold flex items-center">
                        <span className="truncate">Tylko Wydarzenie</span>
                        {formCreationMode === 'event_only' && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-purple-600 inline-block shrink-0" />}
                      </div>
                      <div className="text-[10px] text-neutral-500 mt-0.5 leading-snug">
                        Ustawia wydarzenie w kalendarzu bez zadania
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 text-xs font-semibold text-white rounded-lg shadow-xs transition-colors ${
                    formAnchor === 'return' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {editingItem ? 'Zapisz zmiany w zadaniu' : 'Dodaj zadanie do szablonu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create New Template Set Modal */}
      {showNewSetModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setShowNewSetModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border border-neutral-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-neutral-900 mb-2">Utwórz nowy szablon zadań</h3>
            <p className="text-xs text-neutral-500 mb-4">
              Stwórz nowy profil szablonu zadań (np. dla projektów, spotkań, rutyn codziennych lub wydarzeń).
            </p>
            <form onSubmit={handleCreateNewSetSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Nazwa szablonu</label>
                <input
                  type="text"
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                  placeholder="np. Projekt kwartalny / Spotkania"
                  autoFocus
                  required
                  className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Opis (opcjonalnie)</label>
                <input
                  type="text"
                  value={newSetDesc}
                  onChange={(e) => setNewSetDesc(e.target.value)}
                  placeholder="Krótki opis zestawu..."
                  className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Ikona</label>
                <div className="flex gap-2">
                  {[
                    { id: 'compass', label: 'Kompas' },
                    { id: 'sun', label: 'Słońce / Plaża' },
                    { id: 'briefcase', label: 'Biznes' },
                    { id: 'plane', label: 'Samolot' },
                  ].map((ic) => (
                    <button
                      key={ic.id}
                      type="button"
                      onClick={() => setNewSetIcon(ic.id)}
                      className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        newSetIcon === ic.id
                          ? 'bg-blue-50 text-blue-700 border-blue-500 font-bold'
                          : 'bg-neutral-50 text-neutral-600 border-neutral-200'
                      }`}
                    >
                      {getSetIcon(ic.id)}
                      <span>{ic.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowNewSetModal(false)}
                  className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={!newSetName.trim()}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
                >
                  Utwórz szablon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Template Set Meta Modal */}
      {showEditSetModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setShowEditSetModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border border-neutral-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-neutral-900 mb-2">Edytuj nazwę szablonu</h3>
            <form onSubmit={handleEditSetSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Nazwa szablonu</label>
                <input
                  type="text"
                  value={editSetName}
                  onChange={(e) => setEditSetName(e.target.value)}
                  autoFocus
                  required
                  className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Opis</label>
                <input
                  type="text"
                  value={editSetDesc}
                  onChange={(e) => setEditSetDesc(e.target.value)}
                  className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowEditSetModal(false)}
                  className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={!editSetName.trim()}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
                >
                  Zapisz zmiany
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Generuj wydarzenia do kalendarza */}
      {showGenerateEventsModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setShowGenerateEventsModal(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-neutral-200 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3.5 border-b border-neutral-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-neutral-900">
                    Generuj wydarzenia do kalendarza
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Szablon: <span className="font-semibold text-neutral-700">{activeSet?.name || 'Uniwersalny zestaw'}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGenerateEventsModal(false)}
                className="text-neutral-400 hover:text-neutral-700 text-xl font-bold cursor-pointer p-1 rounded-lg"
              >
                &times;
              </button>
            </div>

            {generateNotice && (
              <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{generateNotice}</span>
              </div>
            )}

            {generateError && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-xl flex items-center space-x-2">
                <X className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{generateError}</span>
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!generateDepartureDate) return;
                setIsGeneratingEvents(true);
                setGenerateError(null);
                setGenerateNotice(null);

                try {
                  const hasReturn = (activeSet?.templates || []).some((t) => t.anchor === 'return');
                  const effectiveReturn = hasReturn
                    ? generateReturnDate || generateDepartureDate
                    : generateDepartureDate;

                  if (onAddToCalendar && activeSet) {
                    await onAddToCalendar(
                      generateCalendarId || 'primary',
                      generateDepartureDate,
                      effectiveReturn,
                      activeSet.templates,
                      activeSet.name
                    );
                    setGenerateNotice(
                      `Pomyślnie wygenerowano ${activeSet.templates.length} pozycji do kalendarza!`
                    );
                    setTimeout(() => {
                      setShowGenerateEventsModal(false);
                      setGenerateNotice(null);
                    }, 1800);
                  }
                } catch (err: any) {
                  setGenerateError(err.message || 'Wystąpił błąd podczas generowania wydarzeń.');
                } finally {
                  setIsGeneratingEvents(false);
                }
              }}
              className="space-y-4 pt-4"
            >
              {/* Date selection: conditional single or dual date picker */}
              {(() => {
                const hasReturn = (activeSet?.templates || []).some((t) => t.anchor === 'return');

                if (!hasReturn) {
                  return (
                    <div className="space-y-2 bg-blue-50/60 p-4 rounded-2xl border border-blue-200/70">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-blue-950 flex items-center space-x-1.5">
                          <PlaneTakeoff className="w-4 h-4 text-blue-600" />
                          <span>Data początkowa</span>
                        </label>
                        <span className="text-[11px] text-blue-700 font-medium">Tylko data początkowa</span>
                      </div>
                      <input
                        type="date"
                        value={generateDepartureDate}
                        onChange={(e) => setGenerateDepartureDate(e.target.value)}
                        className="w-full text-sm font-semibold border border-blue-300 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white text-neutral-900"
                        required
                      />
                      <p className="text-[11px] text-blue-800/80 leading-relaxed">
                        Ten zestaw szablonów zawiera zadania liczone wyłącznie względem daty początkowej.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-3 bg-neutral-50/80 p-4 rounded-2xl border border-neutral-200/80">
                    <p className="text-xs text-neutral-600 font-medium">
                      Ten zestaw zawiera pozycje powiązane z datą początkową oraz końcową. Wybierz obie daty:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-neutral-800 mb-1 flex items-center space-x-1.5">
                          <PlaneTakeoff className="w-4 h-4 text-blue-600" />
                          <span>Data początkowa (Start)</span>
                        </label>
                        <input
                          type="date"
                          value={generateDepartureDate}
                          onChange={(e) => {
                            setGenerateDepartureDate(e.target.value);
                            if (e.target.value && (!generateReturnDate || generateReturnDate < e.target.value)) {
                              const d = new Date(e.target.value);
                              d.setDate(d.getDate() + 7);
                              setGenerateReturnDate(d.toISOString().split('T')[0]);
                            }
                          }}
                          className="w-full text-sm font-semibold border border-neutral-300 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white text-neutral-900"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-neutral-800 mb-1 flex items-center space-x-1.5">
                          <PlaneLanding className="w-4 h-4 text-purple-600" />
                          <span>Data końcowa (Koniec)</span>
                        </label>
                        <input
                          type="date"
                          value={generateReturnDate}
                          onChange={(e) => setGenerateReturnDate(e.target.value)}
                          className="w-full text-sm font-semibold border border-neutral-300 rounded-xl p-2.5 focus:ring-2 focus:ring-purple-500 focus:outline-none bg-white text-neutral-900"
                          required
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Target calendar selection */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Kalendarz docelowy
                </label>
                <select
                  value={generateCalendarId}
                  onChange={(e) => setGenerateCalendarId(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-neutral-300 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                >
                  <option value="">Kalendarz domyślny / główny</option>
                  {(calendars || [])
                    .filter((c) => c.id !== ALL_CALENDARS_ID)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.summary} {c.primary ? '(Główny)' : ''}
                      </option>
                    ))}
                </select>
              </div>

              {/* Summary of what will be generated */}
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 text-xs text-neutral-600 space-y-1">
                <div className="font-semibold text-neutral-800 flex items-center justify-between">
                  <span>Liczba pozycji w szablonie:</span>
                  <span className="font-bold text-blue-700">{activeSet?.templates?.length || 0}</span>
                </div>
                <p className="text-[11px] text-neutral-500">
                  Każde zadanie zostanie utworzone z wyliczonym terminem, godziną i wybranym kolorem w Kalendarzu Google.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowGenerateEventsModal(false)}
                  disabled={isGeneratingEvents}
                  className="px-4 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-xl cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={isGeneratingEvents || !generateDepartureDate}
                  className="inline-flex items-center space-x-2 px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isGeneratingEvents ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                      <span>Generowanie...</span>
                    </>
                  ) : (
                    <>
                      <CalendarIcon className="w-3.5 h-3.5" />
                      <span>Generuj wydarzenia</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
