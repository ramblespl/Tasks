import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ListTodo,
  CheckCircle2,
  Circle,
  Calendar,
  Trash2,
  ExternalLink,
  Plus,
  RefreshCw,
  Clock,
  ChevronDown,
  Layers,
  Sparkles,
  Pencil,
  CalendarPlus,
  AlertCircle,
  RotateCw,
  X,
  LayoutDashboard,
  MoreHorizontal,
} from 'lucide-react';
import { GoogleTaskList, GoogleTaskItem, TaskTemplateItem, GoogleCalendarItem } from '../types';
import { TaskOccurrenceItem } from '../utils/recurrenceUtils';
import {
  formatToRfc3339,
  parseDateComponents,
  cleanTaskTitle,
  extractTaskTitleAndTime,
  formatTaskTitleWithTime,
} from '../services/templateStorage';
import { ALL_TASK_LISTS_ID, ALL_TASK_LISTS_ITEM } from '../services/googleTasksApi';
import { ALL_CALENDARS_ID, findPrimaryCalendar } from '../services/googleCalendarApi';
import { ChecklistPopover, ChecklistOption } from './ChecklistPopover';
import { DateRangeFilterBar } from './DateRangeFilterBar';
import {
  DateRangeState,
  getDefaultDateRange,
  getDashboardTasksDefaultDateRange,
  filterGoogleTasks,
  getTodayDateString,
  extractLocalDateStr,
  DATE_PRESET_LABELS,
  calculatePresetDates,
} from '../utils/dateFilterUtils';
import { AndroidTimePickerField } from './AndroidTimePicker';
import { GOOGLE_EVENT_COLORS, GOOGLE_EVENT_COLOR_OPTIONS } from '../utils/googleCalendarColors';

interface TasksListCardProps {
  taskList: GoogleTaskList | null;
  taskLists: GoogleTaskList[];
  onSelectTaskList: (listId: string) => void;
  selectedTaskListIds?: string[];
  onToggleTaskListId?: (listId: string) => void;
  onSelectAllTaskLists?: () => void;
  onClearAllTaskLists?: () => void;
  onCreateTaskList?: (title: string) => Promise<void>;
  tasks: GoogleTaskItem[];
  isLoadingTasks: boolean;
  onRefreshTasks: () => void;
  onToggleTask: (task: GoogleTaskItem) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onAddTaskManually: (title: string, notes?: string, due?: string, targetTaskListId?: string) => Promise<void>;
  onUpdateTask?: (
    taskId: string,
    patch: { title?: string; notes?: string; due?: string },
    targetTaskListId?: string,
    sourceTaskListId?: string
  ) => Promise<void>;
  onAddTaskToCalendar?: (
    task: GoogleTaskItem,
    startTime?: string,
    colorId?: string,
    targetCalendarId?: string,
    isAllDay?: boolean
  ) => Promise<void>;
  templates?: TaskTemplateItem[];
  onClearAllNotes?: () => Promise<void>;
  onRemoveHoursFromTitles?: () => Promise<void>;
  onCleanHoursAndNotes?: () => Promise<void>;
  onSyncTasksToCalendar?: (targetCalendarId?: string, sourceTaskListId?: string) => Promise<void>;
  calendars?: GoogleCalendarItem[];
  includeTimeInTitle?: boolean;
  onToggleIncludeTimeInTitle?: (val: boolean) => void;
  onAddHoursToTasks?: () => Promise<void>;
  tasksPermissionError?: string | null;
  onReauthorizeTasks?: () => void;
  dateRange?: DateRangeState;
  onChangeDateRange?: (newRange: DateRangeState) => void;
  includeNoDateTasks?: boolean;
  onToggleIncludeNoDateTasks?: (val: boolean) => void;
  layoutVariant?: 'card' | 'sidebar';
  onBackToDashboard?: () => void;
  isSidebarOpen?: boolean;
  onCloseSidebar?: () => void;
  onToggleSidebar?: () => void;
  showControls?: boolean;
  onToggleControls?: () => void;
}

export const TasksListCard: React.FC<TasksListCardProps> = ({
  taskList,
  taskLists = [],
  onSelectTaskList,
  selectedTaskListIds = [],
  onToggleTaskListId,
  onSelectAllTaskLists,
  onClearAllTaskLists,
  onCreateTaskList,
  tasks,
  isLoadingTasks,
  onRefreshTasks,
  onToggleTask,
  onDeleteTask,
  onAddTaskManually,
  onUpdateTask,
  onAddTaskToCalendar,
  templates = [],
  onClearAllNotes,
  onRemoveHoursFromTitles,
  onCleanHoursAndNotes,
  onSyncTasksToCalendar,
  calendars = [],
  includeTimeInTitle = false,
  onToggleIncludeTimeInTitle,
  onAddHoursToTasks,
  tasksPermissionError,
  onReauthorizeTasks,
  dateRange: propDateRange,
  onChangeDateRange,
  includeNoDateTasks: propIncludeNoDateTasks,
  onToggleIncludeNoDateTasks: propOnToggleIncludeNoDateTasks,
  layoutVariant = 'card',
  onBackToDashboard,
  isSidebarOpen = false,
  onCloseSidebar,
  onToggleSidebar,
  showControls,
  onToggleControls,
}) => {
  const [internalShowControls, setInternalShowControls] = useState(false);
  const isControlsOpen = showControls !== undefined ? showControls : internalShowControls;
  const toggleControls = onToggleControls || (() => setInternalShowControls((prev) => !prev));
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  // Tasks controls dropdown menu ('...' button to the left of task list name)
  const [showTasksControlsMenu, setShowTasksControlsMenu] = useState(false);
  const tasksControlsDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (tasksControlsDropdownRef.current && !tasksControlsDropdownRef.current.contains(target)) {
        setShowTasksControlsMenu(false);
      }
    };
    if (showTasksControlsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showTasksControlsMenu]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState(getTodayDateString);
  const [newTaskHasTime, setNewTaskHasTime] = useState(false);
  const [newTaskTime, setNewTaskTime] = useState('');
  const [newTaskNotes, setNewTaskNotes] = useState('');
  const [newTaskAlsoCalendar, setNewTaskAlsoCalendar] = useState(false);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTaskTargetListId, setNewTaskTargetListId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync default target list for new task
  useEffect(() => {
    if (taskList && taskList.id !== ALL_TASK_LISTS_ID) {
      setNewTaskTargetListId(taskList.id);
    } else if (taskLists && taskLists.length > 0) {
      const firstValid = taskLists.find((tl) => tl.id !== ALL_TASK_LISTS_ID);
      if (firstValid) {
        setNewTaskTargetListId(firstValid.id);
      }
    }
  }, [taskList, taskLists]);

  const handleOpenNewTaskModal = () => {
    setNewTaskTitle('');
    setNewTaskDue(getTodayDateString());
    setNewTaskHasTime(false);
    setNewTaskTime('');
    setNewTaskNotes('');
    setNewTaskAlsoCalendar(false);
    setNewTaskColorId('');
    const defaultCalId =
      findPrimaryCalendar(calendars)?.id ||
      calendars.find((c) => c.id !== ALL_CALENDARS_ID)?.id ||
      'primary';
    setNewTaskTargetCalendarId(defaultCalId);
    setShowNewTaskModal(true);
  };

  // Keyboard shortcut listener (m / t -> nowe zadanie)
  useEffect(() => {
    const handleTriggerNewTask = () => {
      handleOpenNewTaskModal();
    };
    window.addEventListener('app:open-new-task', handleTriggerNewTask);
    return () => window.removeEventListener('app:open-new-task', handleTriggerNewTask);
  }, [calendars]);
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);
  const [isCleaningNotes, setIsCleaningNotes] = useState(false);
  const [isRemovingHours, setIsRemovingHours] = useState(false);
  const [isAddingHours, setIsAddingHours] = useState(false);
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncSourceListId, setSyncSourceListId] = useState<string>('');
  const [syncTargetCalendarId, setSyncTargetCalendarId] = useState<string>('');
  const [showNewListModal, setShowNewListModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [isCreatingList, setIsCreatingList] = useState(false);

  // Active tasks for the selected source list in "Do Kalendarza"
  const selectedSourceListTasks = useMemo(() => {
    if (!tasks || tasks.length === 0) return [];
    const activeTasks = tasks.filter((t) => t.status !== 'completed');
    if (!syncSourceListId || syncSourceListId === ALL_TASK_LISTS_ID) {
      return activeTasks;
    }
    return activeTasks.filter((t) => t.taskListId === syncSourceListId);
  }, [tasks, syncSourceListId]);

  const handleOpenSyncModal = () => {
    if (!syncSourceListId) {
      const validLists = taskLists.filter((l) => l.id !== ALL_TASK_LISTS_ID);
      const defaultListId = taskList?.id && taskList.id !== ALL_TASK_LISTS_ID ? taskList.id : (validLists[0]?.id || ALL_TASK_LISTS_ID);
      setSyncSourceListId(defaultListId);
    }
    if (!syncTargetCalendarId && calendars && calendars.length > 0) {
      const primaryCal = calendars.find((c) => c.primary && c.id !== '_all_calendars_') || calendars.find((c) => c.id !== '_all_calendars_');
      if (primaryCal) setSyncTargetCalendarId(primaryCal.id);
    }
    setShowSyncModal(true);
  };

  const handleSyncToTargetCalendar = async (targetCalendarId?: string, sourceListId?: string) => {
    if (!onSyncTasksToCalendar) return;
    try {
      setIsSyncingCalendar(true);
      await onSyncTasksToCalendar(targetCalendarId, sourceListId);
      setShowSyncModal(false);
    } finally {
      setIsSyncingCalendar(false);
    }
  };

  // Prepare options for task list checkbox popover
  const checklistTaskOptions: ChecklistOption[] = taskLists
    .filter((l) => l.id !== ALL_TASK_LISTS_ID)
    .map((l) => {
      const cleanTitle = l.title
        ?.replace(/\s*[([](?:wyjazdy|wyjazd)[)\]]/gi, '')
        ?.replace(/\s*-\s*(?:wyjazdy|wyjazd)/gi, '')
        ?.trim() || l.title;

      return {
        id: l.id,
        title: cleanTitle,
        badge: undefined,
        color: '#10b981',
      };
    });

  // Edit Task Modal state
  const [editingTask, setEditingTask] = useState<GoogleTaskItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDue, setEditDue] = useState('');
  const [editHasTime, setEditHasTime] = useState(false);
  const [editTime, setEditTime] = useState('18:00');
  const [editColorId, setEditColorId] = useState<string>('');
  const [editTargetCalendarId, setEditTargetCalendarId] = useState<string>('');
  const [editNotes, setEditNotes] = useState('');
  const [editTaskListId, setEditTaskListId] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [alsoAddToCalendar, setAlsoAddToCalendar] = useState(false);
  const [addingToCalendarTaskId, setAddingToCalendarTaskId] = useState<string | null>(null);

  // New task calendar & color state
  const [newTaskTargetCalendarId, setNewTaskTargetCalendarId] = useState<string>('');
  const [newTaskColorId, setNewTaskColorId] = useState<string>('');

  // Date range filter state
  const [internalDateRange, setInternalDateRange] = useState<DateRangeState>(() => {
    return getDashboardTasksDefaultDateRange();
  });

  const activeDateRange = propDateRange || internalDateRange;

  const [internalIncludeNoDateTasks, setInternalIncludeNoDateTasks] = useState<boolean>(() => {
    const saved = localStorage.getItem('tasks_include_no_date');
    return saved !== null ? saved === 'true' : false;
  });

  const includeNoDateTasks =
    propIncludeNoDateTasks !== undefined ? propIncludeNoDateTasks : internalIncludeNoDateTasks;

  const handleDateRangeChange = (newRange: DateRangeState) => {
    if (onChangeDateRange) {
      onChangeDateRange(newRange);
    } else {
      setInternalDateRange(newRange);
      localStorage.setItem('tasks_card_date_range', JSON.stringify(newRange));
    }
  };

  const handleToggleIncludeNoDate = (val: boolean) => {
    if (propOnToggleIncludeNoDateTasks) {
      propOnToggleIncludeNoDateTasks(val);
    } else {
      setInternalIncludeNoDateTasks(val);
      localStorage.setItem('tasks_include_no_date', String(val));
    }
  };

  // 1. Filter tasks according to selectedTaskListIds
  const tasksMatchingList = useMemo(() => {
    if (
      !selectedTaskListIds ||
      selectedTaskListIds.length === 0 ||
      selectedTaskListIds.includes(ALL_TASK_LISTS_ID)
    ) {
      return tasks;
    }
    return tasks.filter((t) => t.taskListId && selectedTaskListIds.includes(t.taskListId));
  }, [tasks, selectedTaskListIds]);

  // 2. Filter tasks by date range
  const tasksMatchingDate = useMemo(() => {
    return filterGoogleTasks(tasksMatchingList, activeDateRange, includeNoDateTasks);
  }, [tasksMatchingList, activeDateRange, includeNoDateTasks]);

  const noDateCount = useMemo(() => {
    return tasksMatchingList.filter((t) => !t.due).length;
  }, [tasksMatchingList]);

  const completedCount = tasksMatchingDate.filter((t) => t.status === 'completed').length;
  const totalCount = tasksMatchingDate.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const hasNotesInTasks = tasksMatchingDate.some((t) => t.notes && t.notes.trim());

  // Check if any task currently has hour prepended in its title (e.g. "18:00 - ...")
  const hasTasksWithHourInTitle = tasksMatchingDate.some((t) =>
    /^(?:\[\d{1,2}:\d{2}\]|\d{1,2}:\d{2}\s*[-–:]?)/.test(t.title)
  );
  const hasTasksMissingHourInTitle = tasksMatchingDate.some((t) =>
    !/^(?:\[\d{1,2}:\d{2}\]|\d{1,2}:\d{2}\s*[-–:]?)/.test(t.title)
  );

  const filteredTasks = useMemo(() => {
    return tasksMatchingDate.filter((t) => {
      if (filter === 'active') return t.status === 'needsAction';
      if (filter === 'completed') return t.status === 'completed';
      return true;
    });
  }, [tasksMatchingDate, filter]);

  const formatDueDate = (dueString?: string, explicitTime?: string | null) => {
    if (!dueString && !explicitTime) return null;

    if (!dueString) {
      return explicitTime ? { text: `godz. ${explicitTime}`, isPast: false, isToday: false, time: explicitTime } : null;
    }

    const localDateStr = extractLocalDateStr(dueString);
    if (!localDateStr) return null;

    const [year, month, day] = localDateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (isNaN(date.getTime())) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(year, month - 1, day, 0, 0, 0, 0);

    const isPast = dueDate.getTime() < today.getTime();
    const isToday = dueDate.getTime() === today.getTime();

    const formattedDate = date.toLocaleDateString('pl-PL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const fullText = explicitTime ? `${formattedDate}, godz. ${explicitTime}` : formattedDate;

    return {
      text: fullText,
      time: explicitTime || null,
      isPast,
      isToday,
    };
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    try {
      setIsSubmitting(true);
      let rfcDue: string | undefined = undefined;
      const clean = cleanTaskTitle(newTaskTitle.trim());

      let taskHour: string | undefined = undefined;
      if (newTaskHasTime && newTaskTime && /^(\d{1,2}):(\d{2})$/.test(newTaskTime)) {
        taskHour = newTaskTime;
      }

      if (newTaskDue) {
        const { year, month, day } = parseDateComponents(newTaskDue);
        const pad = (n: number) => String(n).padStart(2, '0');
        if (taskHour) {
          let [h, m] = taskHour.split(':').map(Number);
          if (isNaN(h)) h = 18;
          if (isNaN(m)) m = 0;
          const target = new Date(year, month, day, h, m, 0, 0);
          rfcDue = formatToRfc3339(target);
        } else {
          // Date-only in Google Tasks format (T00:00:00.000Z)
          rfcDue = `${year}-${pad(month + 1)}-${pad(day)}T00:00:00.000Z`;
        }
      }

      let finalTitle = clean;
      if (includeTimeInTitle && taskHour) {
        finalTitle = formatTaskTitleWithTime(clean, taskHour);
      }

      // Do NOT auto-inject any hour notes; only save notes if explicitly provided by user
      const finalNotes = newTaskNotes.trim() ? newTaskNotes.trim() : undefined;

      const targetListToUse =
        newTaskTargetListId ||
        (taskList && taskList.id !== ALL_TASK_LISTS_ID ? taskList.id : undefined);

      const created = await onAddTaskManually(finalTitle, finalNotes, rfcDue, targetListToUse);

      if (newTaskAlsoCalendar && onAddTaskToCalendar && newTaskDue) {
        await onAddTaskToCalendar(
          created || {
            id: `temp-${Date.now()}`,
            title: clean,
            due: rfcDue,
            notes: finalNotes,
            status: 'needsAction',
          },
          taskHour,
          newTaskColorId || undefined,
          newTaskTargetCalendarId || undefined,
          !taskHour
        );
      }

      setNewTaskTitle('');
      setNewTaskDue('');
      setNewTaskHasTime(false);
      setNewTaskTime('');
      setNewTaskNotes('');
      setNewTaskAlsoCalendar(false);
      setNewTaskColorId('');
      setShowNewTaskModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (task: TaskOccurrenceItem) => {
    try {
      setTogglingTaskId(task.id);
      const originalTask = task.originalTaskId
        ? tasks.find((t) => t.id === task.originalTaskId) || task
        : task;
      await onToggleTask(originalTask);
    } finally {
      setTogglingTaskId(null);
    }
  };

  const handleClearNotesClick = async () => {
    if (!onClearAllNotes) return;
    try {
      setIsCleaningNotes(true);
      await onClearAllNotes();
    } finally {
      setIsCleaningNotes(false);
    }
  };

  const handleRemoveHoursClick = async () => {
    if (!onRemoveHoursFromTitles) return;
    try {
      setIsRemovingHours(true);
      await onRemoveHoursFromTitles();
    } finally {
      setIsRemovingHours(false);
    }
  };

  const handleAddHoursClick = async () => {
    if (!onAddHoursToTasks) return;
    try {
      setIsAddingHours(true);
      await onAddHoursToTasks();
    } finally {
      setIsAddingHours(false);
    }
  };

  const handleSyncCalendarClick = async () => {
    if (!onSyncTasksToCalendar) return;
    try {
      setIsSyncingCalendar(true);
      await onSyncTasksToCalendar();
    } finally {
      setIsSyncingCalendar(false);
    }
  };

  const handleCreateNewListSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim() || !onCreateTaskList) return;
    try {
      setIsCreatingList(true);
      await onCreateTaskList(newListName.trim());
      setNewListName('');
      setShowNewListModal(false);
    } finally {
      setIsCreatingList(false);
    }
  };

  const calculateEndTimePlusOneHour = (timeStr: string = '18:00'): string => {
    if (!/^(\d{1,2}):(\d{2})$/.test(timeStr)) return '19:00';
    const [h, m] = timeStr.split(':').map(Number);
    const endH = (h + 1) % 24;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(endH)}:${pad(m)}`;
  };

  const handleStartEdit = (task: TaskOccurrenceItem) => {
    const originalTask = task.originalTaskId
      ? tasks.find((t) => t.id === task.originalTaskId) || task
      : task;
    const rawDue = task.due || originalTask.due;
    const { time, cleanTitle } = extractTaskTitleAndTime(
      originalTask.title,
      originalTask.notes,
      templates,
      rawDue
    );

    setEditingTask(originalTask);
    setEditTitle(cleanTitle);

    if (rawDue) {
      const datePart = extractLocalDateStr(rawDue);
      setEditDue(datePart || '');
    } else {
      setEditDue('');
    }

    if (time) {
      setEditHasTime(true);
      setEditTime(time);
    } else {
      setEditHasTime(false);
      setEditTime('18:00');
    }

    const matchedTemplate = templates?.find(
      (t) => cleanTaskTitle(t.title).toLowerCase() === cleanTitle.toLowerCase()
    );
    setEditColorId(matchedTemplate?.colorId || '');
    const defaultCalId =
      findPrimaryCalendar(calendars)?.id ||
      calendars.find((c) => c.id !== ALL_CALENDARS_ID)?.id ||
      'primary';
    setEditTargetCalendarId(defaultCalId);
    setEditNotes(task.notes || '');
    setEditTaskListId(
      task.taskListId ||
      (taskList && taskList.id !== ALL_TASK_LISTS_ID ? taskList.id : (taskLists.find((l) => l.id !== ALL_TASK_LISTS_ID)?.id || ''))
    );
    setAlsoAddToCalendar(false);
  };

  const handleSaveEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !onUpdateTask || !editTitle.trim()) return;

    try {
      setIsSavingEdit(true);
      let rfcDue: string | undefined = undefined;
      const clean = cleanTaskTitle(editTitle.trim());

      let taskHour: string | undefined = undefined;
      if (editHasTime && editTime && /^(\d{1,2}):(\d{2})$/.test(editTime)) {
        taskHour = editTime;
      }

      if (editDue) {
        const { year, month, day } = parseDateComponents(editDue);
        const pad = (n: number) => String(n).padStart(2, '0');
        if (taskHour) {
          let [h, m] = taskHour.split(':').map(Number);
          if (isNaN(h)) h = 18;
          if (isNaN(m)) m = 0;
          const target = new Date(year, month, day, h, m, 0, 0);
          rfcDue = formatToRfc3339(target);
        } else {
          // Date-only in Google Tasks format (T00:00:00.000Z)
          rfcDue = `${year}-${pad(month + 1)}-${pad(day)}T00:00:00.000Z`;
        }
      } else {
        rfcDue = '';
      }

      let titleToSave = clean;
      if (includeTimeInTitle && taskHour) {
        titleToSave = formatTaskTitleWithTime(clean, taskHour);
      }

      let updatedNotes = editNotes
        .replace(/(?:⏰\s*)?Godzina(?:\s*wykonania|\s*rozpoczęcia)?:\s*\d{1,2}:\d{2}\s*/gi, '')
        .trim();

      if (taskHour && !includeTimeInTitle) {
        updatedNotes = updatedNotes
          ? `${updatedNotes}\n⏰ Godzina rozpoczęcia: ${taskHour}`
          : `⏰ Godzina rozpoczęcia: ${taskHour}`;
      }

      await onUpdateTask(
        editingTask.id,
        {
          title: titleToSave,
          due: rfcDue,
          notes: updatedNotes || undefined,
        },
        editTaskListId,
        editingTask.taskListId
      );

      if (alsoAddToCalendar && onAddTaskToCalendar && editDue) {
        await onAddTaskToCalendar(
          { ...editingTask, title: clean, due: rfcDue, notes: updatedNotes },
          taskHour || '18:00',
          editColorId || undefined,
          editTargetCalendarId || undefined
        );
      }

      setEditingTask(null);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleQuickAddToCalendar = async (task: GoogleTaskItem) => {
    if (!onAddTaskToCalendar) return;
    const { time, cleanTitle } = extractTaskTitleAndTime(task.title, task.notes, templates, task.due);
    let resolvedTime = time;
    let matchedColorId: string | undefined = undefined;
    if (templates && templates.length > 0) {
      const matched = templates.find(
        (t) => cleanTaskTitle(t.title).toLowerCase() === cleanTitle.toLowerCase()
      );
      if (matched?.time && !resolvedTime) {
        resolvedTime = matched.time;
      }
      if (matched?.colorId) {
        matchedColorId = matched.colorId;
      }
    }

    try {
      setAddingToCalendarTaskId(task.id);
      await onAddTaskToCalendar(task, resolvedTime || '18:00', matchedColorId);
    } finally {
      setAddingToCalendarTaskId(null);
    }
  };

  const renderTasksItemList = () => (
    <>
      {tasksPermissionError && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200/90 text-amber-900 space-y-2.5">
          <div className="flex items-start space-x-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                Brak uprawnień do Google Tasks (403)
              </h4>
              <p className="text-xs text-amber-800 leading-relaxed">
                {tasksPermissionError}
              </p>
            </div>
          </div>
          {onReauthorizeTasks && (
            <div className="pt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={onReauthorizeTasks}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Zaloguj ponownie i zaznacz Zadania (ekran zgody)</span>
              </button>
            </div>
          )}
        </div>
      )}

      {isLoadingTasks ? (
        <div className="py-12 text-center text-neutral-500 flex flex-col items-center justify-center">
          <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin mb-3" />
          <p className="text-sm font-medium text-neutral-700">Ładowanie zadań z listy {taskList?.title}...</p>
        </div>
      ) : tasks.length > 0 && tasksMatchingDate.length === 0 ? (
        <div className="py-10 text-center px-4 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 space-y-3">
          <Calendar className="w-9 h-9 text-neutral-300 mx-auto" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-neutral-800">
              Brak zadań w wybranym zakresie dat
            </p>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto leading-relaxed">
              W tej liście znajduje się {tasks.length} {tasks.length === 1 ? 'zadanie' : 'zadań'}, lecz żadne nie mieści się w aktywnym filtrze dat ({activeDateRange.preset === 'from_today' ? 'od obecnego dnia' : 'wybrany okres'}).
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              id="btn-tasks-show-all-dates"
              onClick={() => handleDateRangeChange({ preset: 'all', startDate: '', endDate: '' })}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition cursor-pointer"
            >
              <span>Pokaż wszystkie zadania (w tym przeszłe)</span>
            </button>
          </div>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="py-10 text-center px-4 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50">
          <ListTodo className="w-9 h-9 text-neutral-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-neutral-800">
            {filter === 'all'
              ? `Brak zadań w liście "${taskList?.title || 'Wszystkie'}"`
              : filter === 'active'
              ? 'Wszystkie zadania wykonane!'
              : 'Brak ukończonych zadań'}
          </p>
          <p className="text-xs text-neutral-500 max-w-sm mx-auto mt-1 leading-relaxed">
            Wygeneruj zestaw zadań z kalendarza lub dodaj zadanie ręcznie z datą i godziną.
          </p>
          <div className="pt-2.5">
            <button
              type="button"
              onClick={handleOpenNewTaskModal}
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg transition shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Dodaj zadanie</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map((task) => {
            const isCompleted = task.status === 'completed';
            const isToggling = togglingTaskId === task.id;
            const { time: extractedTime, cleanTitle } = extractTaskTitleAndTime(task.title, task.notes, templates, task.due);
            const dueInfo = formatDueDate(task.due, extractedTime);

            return (
              <div
                key={task.id}
                className={`group flex items-start justify-between p-3 rounded-xl border transition-all ${
                  isCompleted
                    ? 'bg-neutral-50/70 border-neutral-200/60 opacity-55 hover:opacity-85'
                    : 'bg-white border-neutral-200 hover:border-neutral-300 shadow-2xs opacity-100'
                }`}
              >
                <div className="flex items-start space-x-3 flex-1 min-w-0">
                  <button
                    id={`chk-task-${task.id}`}
                    onClick={() => handleToggle(task)}
                    disabled={isToggling}
                    className="mt-0.5 shrink-0 text-neutral-400 hover:text-emerald-600 transition-colors focus:outline-none"
                  >
                    {isToggling ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                    ) : isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-100" />
                    ) : (
                      <Circle className="w-4 h-4 text-neutral-300 hover:text-neutral-500" />
                    )}
                  </button>

                  <div className="space-y-1 min-w-0 flex-1">
                    <p
                      className={`text-xs sm:text-sm font-medium leading-snug break-words flex flex-wrap items-center gap-1.5 ${
                        isCompleted ? 'line-through text-neutral-400' : 'text-neutral-900'
                      }`}
                    >
                      {extractedTime && (
                        <span className="inline-flex items-center font-mono font-bold text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                          <Clock className="w-3 h-3 mr-1 text-blue-600" />
                          {extractedTime}
                        </span>
                      )}
                      <span>{cleanTitle}</span>
                    </p>

                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      {dueInfo && (
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded font-medium border ${
                            isCompleted
                              ? 'bg-neutral-100 text-neutral-500 border-neutral-200'
                              : dueInfo.isPast
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : dueInfo.isToday
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-neutral-100 text-neutral-700 border-neutral-200'
                          }`}
                        >
                          <Calendar className="w-3 h-3 mr-1" />
                          <span>Termin: {dueInfo.text}</span>
                          {dueInfo.isPast && !isCompleted && (
                            <span className="ml-1 font-bold text-rose-600">(Zaległe)</span>
                          )}
                          {dueInfo.isToday && !isCompleted && (
                            <span className="ml-1 font-bold text-amber-600">(Dzisiaj!)</span>
                          )}
                        </span>
                      )}

                      {task.taskListTitle && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 text-neutral-600 border border-neutral-200">
                          {task.taskListTitle}
                        </span>
                      )}

                      {task.recurrenceLabel && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                          <RotateCw className="w-2.5 h-2.5 mr-1 text-purple-600" />
                          {task.recurrenceLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-1 shrink-0 ml-2">
                  {onAddTaskToCalendar && (
                    <button
                      id={`btn-add-cal-task-${task.id}`}
                      type="button"
                      onClick={() => handleQuickAddToCalendar(task)}
                      disabled={addingToCalendarTaskId === task.id}
                      className="opacity-100 sm:opacity-0 group-hover:opacity-100 p-1.5 text-neutral-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all cursor-pointer"
                      title="Dodaj termin do Kalendarza Google (czas trwania: 30 min)"
                    >
                      {addingToCalendarTaskId === task.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      ) : (
                        <CalendarPlus className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}

                  {onUpdateTask && (
                    <button
                      id={`btn-edit-task-${task.id}`}
                      type="button"
                      onClick={() => handleStartEdit(task)}
                      className="opacity-100 sm:opacity-0 group-hover:opacity-100 p-1.5 text-neutral-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer"
                      title="Edytuj zadanie (termin, godzina, nazwa)"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    id={`btn-del-task-${task.id}`}
                    type="button"
                    onClick={() => onDeleteTask(task.originalTaskId || task.id)}
                    className="opacity-100 sm:opacity-0 group-hover:opacity-100 p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                    title="Usuń z Google Tasks"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  // Render Tasks Controls dropdown menu ('...' button to the left of task list name)
  const renderTasksControlsMenuContent = () => (
    <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1 text-left select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <ListTodo className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-neutral-900">Sterowanie zadaniami</h3>
            <span className="text-[10px] text-neutral-500 block">Akcje, filtry, listy i narzędzia</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowTasksControlsMenu(false)}
          className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
          title="Zamknij"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 1. Szybkie akcje (Nowe zadanie, Odśwież, Nowa lista, Do Kalendarza) */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
          Akcje zadań
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            id="btn-tasks-menu-new-task"
            onClick={() => {
              setShowTasksControlsMenu(false);
              handleOpenNewTaskModal();
            }}
            className="w-full inline-flex items-center justify-center space-x-1 px-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Nowe zadanie</span>
          </button>

          <button
            type="button"
            id="btn-tasks-menu-refresh"
            onClick={() => onRefreshTasks()}
            disabled={isLoadingTasks}
            className="w-full inline-flex items-center justify-center space-x-1.5 px-2 py-1.5 bg-white hover:bg-neutral-50 active:bg-neutral-100 text-neutral-700 border border-neutral-250 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTasks ? 'animate-spin text-emerald-600' : 'text-neutral-600'}`} />
            <span>{isLoadingTasks ? 'Odświeżanie...' : 'Odśwież'}</span>
          </button>

          {onCreateTaskList && (
            <button
              type="button"
              id="btn-tasks-menu-new-list"
              onClick={() => {
                setShowTasksControlsMenu(false);
                setNewListName('');
                setShowNewListModal(true);
              }}
              className="w-full inline-flex items-center justify-center space-x-1 px-2 py-1.5 bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-250 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-600" />
              <span>+ Nowa lista</span>
            </button>
          )}

          {onSyncTasksToCalendar && (
            <button
              type="button"
              id="btn-tasks-menu-sync"
              onClick={() => {
                setShowTasksControlsMenu(false);
                handleOpenSyncModal();
              }}
              className="w-full inline-flex items-center justify-center space-x-1 px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Do Kalendarza</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Wybór / przełączanie list zadań */}
      {taskLists && taskLists.length > 0 && (
        <div className="space-y-1.5 p-2 bg-neutral-50/70 rounded-xl border border-neutral-200">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-neutral-800 uppercase tracking-wider">
              Listy zadań ({taskLists.length})
            </span>
            {onSelectAllTaskLists && onClearAllTaskLists && (
              <div className="space-x-1.5 text-[10px]">
                <button
                  type="button"
                  onClick={onSelectAllTaskLists}
                  className="text-emerald-600 hover:underline cursor-pointer font-medium"
                >
                  Wszystkie
                </button>
                <span className="text-neutral-300">•</span>
                <button
                  type="button"
                  onClick={onClearAllTaskLists}
                  className="text-neutral-500 hover:underline cursor-pointer"
                >
                  Wyczyść
                </button>
              </div>
            )}
          </div>
          <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
            {taskLists.map((tl) => {
              const isChecked =
                !selectedTaskListIds ||
                selectedTaskListIds.length === 0 ||
                selectedTaskListIds.includes(ALL_TASK_LISTS_ID) ||
                selectedTaskListIds.includes(tl.id);
              const isCurrent = taskList?.id === tl.id;
              return (
                <div
                  key={tl.id}
                  className="flex items-center justify-between py-0.5 px-1 rounded-md hover:bg-neutral-100/80 transition-colors"
                >
                  <label className="flex items-center space-x-2 text-xs text-neutral-700 hover:text-neutral-900 cursor-pointer min-w-0 flex-1 select-none">
                    {onToggleTaskListId && (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggleTaskListId(tl.id)}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer shrink-0"
                      />
                    )}
                    <span className={`truncate text-[11px] ${isCurrent ? 'font-bold text-neutral-900' : ''}`} title={tl.title}>
                      {tl.title}
                    </span>
                  </label>
                  {onSelectTaskList && !isCurrent && (
                    <button
                      type="button"
                      onClick={() => onSelectTaskList(tl)}
                      className="text-[10px] text-emerald-700 hover:underline cursor-pointer px-1 py-0.5 shrink-0"
                    >
                      Wybierz
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Zakres dat i zadania bez terminu */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
            Zakres dat zadań
          </span>
          <span className="text-[10px] font-semibold text-emerald-700">
            {DATE_PRESET_LABELS[activeDateRange.preset] || activeDateRange.preset}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1 text-[11px]">
          {(
            [
              { preset: 'all', label: 'Wszystkie' },
              { preset: 'today', label: 'Dzisiaj' },
              { preset: 'from_today', label: 'Od dzisiaj' },
              { preset: 'next_7_days', label: '7 dni' },
              { preset: 'next_30_days', label: '30 dni' },
              { preset: 'this_month', label: 'Ten miesiąc' },
            ] as const
          ).map((p) => {
            const isSelected = activeDateRange.preset === p.preset;
            return (
              <button
                key={p.preset}
                type="button"
                onClick={() => {
                  const { startDate, endDate } = calculatePresetDates(p.preset);
                  handleDateRangeChange({ preset: p.preset, startDate, endDate });
                }}
                className={`px-2 py-1 rounded-lg border transition cursor-pointer text-center ${
                  isSelected
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold ring-1 ring-emerald-400/20'
                    : 'bg-white hover:bg-neutral-50 text-neutral-700 border-neutral-250'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Checkbox zadania bez terminu */}
        <label className="flex items-center space-x-2 text-xs text-neutral-700 hover:text-neutral-900 cursor-pointer pt-1 select-none">
          <input
            type="checkbox"
            checked={includeNoDateTasks}
            onChange={(e) => handleToggleIncludeNoDate(e.target.checked)}
            className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer shrink-0"
          />
          <span className="text-[11px]">Uwzględnij zadania bez terminu ({noDateCount})</span>
        </label>
      </div>

      {/* 4. Filtr statusu zadań (Wszystkie, Do zrobienia, Ukończone) */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
          Status zadań
        </span>
        <div className="grid grid-cols-3 gap-1 bg-neutral-100 p-1 rounded-xl border border-neutral-200">
          {(
            [
              { id: 'all', label: 'Wszystkie' },
              { id: 'active', label: 'Do zrobienia' },
              { id: 'completed', label: 'Ukończone' },
            ] as const
          ).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setFilter(s.id)}
              className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer text-center ${
                filter === s.id
                  ? 'bg-neutral-800 text-white font-semibold shadow-2xs'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 5. Narzędzia porządkowe i masowe */}
      <div className="space-y-1.5 p-2 bg-neutral-50/70 rounded-xl border border-neutral-200">
        <span className="text-[11px] font-bold text-neutral-800 uppercase tracking-wider block">
          Narzędzia
        </span>
        <div className="space-y-1.5">
          {onToggleIncludeTimeInTitle && (
            <label className="flex items-center space-x-2 text-xs text-neutral-700 hover:text-neutral-900 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!includeTimeInTitle}
                onChange={(e) => onToggleIncludeTimeInTitle(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer shrink-0"
              />
              <span className="text-[11px]">Dołącz godzinę do tytułu</span>
            </label>
          )}

          {onRemoveHoursFromTitles && (
            <button
              type="button"
              onClick={async () => {
                setIsRemovingHours(true);
                try {
                  await onRemoveHoursFromTitles();
                } finally {
                  setIsRemovingHours(false);
                }
              }}
              disabled={isRemovingHours}
              className="w-full text-left px-2 py-1 rounded-md text-[11px] text-neutral-700 hover:bg-neutral-200/60 transition cursor-pointer"
            >
              {isRemovingHours ? 'Usuwanie godzin...' : 'Usuń godziny z tytułów'}
            </button>
          )}

          {onClearAllNotes && (
            <button
              type="button"
              onClick={async () => {
                setIsCleaningNotes(true);
                try {
                  await onClearAllNotes();
                } finally {
                  setIsCleaningNotes(false);
                }
              }}
              disabled={isCleaningNotes}
              className="w-full text-left px-2 py-1 rounded-md text-[11px] text-neutral-700 hover:bg-neutral-200/60 transition cursor-pointer"
            >
              {isCleaningNotes ? 'Czyszczenie notatek...' : 'Wyczyść notatki zadań'}
            </button>
          )}

          {onCleanHoursAndNotes && (
            <button
              type="button"
              onClick={async () => {
                setIsCleaningNotes(true);
                try {
                  await onCleanHoursAndNotes();
                } finally {
                  setIsCleaningNotes(false);
                }
              }}
              disabled={isCleaningNotes}
              className="w-full text-left px-2 py-1 rounded-md text-[11px] text-neutral-700 hover:bg-neutral-200/60 transition cursor-pointer"
            >
              {isCleaningNotes ? 'Czyszczenie...' : 'Wyczyść godziny i notatki'}
            </button>
          )}
        </div>
      </div>

      {/* Footer Links: Google Tasks Link & Sidebar toggle */}
      <div className="pt-2 border-t border-neutral-200 flex items-center justify-between gap-2 text-xs">
        <a
          href="https://tasks.google.com"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center space-x-1 text-emerald-700 hover:text-emerald-900 font-medium hover:underline text-[11px]"
        >
          <span>Google Tasks</span>
          <ExternalLink className="w-3 h-3" />
        </a>

        {(onToggleSidebar || onCloseSidebar) && (
          <button
            type="button"
            onClick={() => {
              setShowTasksControlsMenu(false);
              if (onToggleSidebar) {
                onToggleSidebar();
              } else if (onCloseSidebar) {
                onCloseSidebar();
              }
            }}
            className="text-neutral-500 hover:text-neutral-800 text-[11px] hover:underline cursor-pointer"
          >
            {isSidebarOpen ? 'Ukryj panel boczny' : 'Pokaż panel boczny'}
          </button>
        )}
      </div>
    </div>
  );

  const renderSidebarLayout = () => (
    <div className="bg-white rounded-2xl border border-neutral-200/90 shadow-sm overflow-hidden h-full w-full min-h-0 relative flex flex-col">
      {/* Backdrop overlay na całym ekranie */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 transition-opacity cursor-pointer"
          onClick={onCloseSidebar}
          aria-hidden="true"
        />
      )}

      {/* LEFT SIDEBAR: Menu boczne rozwijane na pełną wysokość całego ekranu (overlay drawer) */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 sm:w-80 bg-white border-r border-neutral-200 shadow-2xl flex flex-col h-full overflow-hidden select-none transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
      >
        {/* Drawer Header (dopasowany do wysokości górnego paska aplikacji) */}
        <div className="h-14 sm:h-16 px-3.5 sm:px-4 border-b border-neutral-200 flex items-center justify-between shrink-0 bg-neutral-50/90">
          <div className="flex items-center space-x-2.5">
            {onCloseSidebar && (
              <button
                type="button"
                onClick={onCloseSidebar}
                className="p-1.5 rounded-full hover:bg-neutral-200/70 text-neutral-600 transition cursor-pointer"
                title="Ukryj menu boczne (...)"
                aria-label="Ukryj menu boczne"
              >
                <MoreHorizontal className="w-5 h-5 stroke-[2.5]" />
              </button>
            )}
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-2xs">
              <ListTodo className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-neutral-900 uppercase tracking-wider block">
                Menu zadań
              </span>
              <span className="text-[10px] text-neutral-500 block -mt-0.5">
                Google Workspace
              </span>
            </div>
          </div>
          {onCloseSidebar && (
            <button
              type="button"
              onClick={onCloseSidebar}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 transition cursor-pointer"
              title="Zamknij menu"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Scrollable controls */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-3.5 space-y-3.5 bg-neutral-50/40">
        {/* 1. Przycisk "+ Nowe zadanie" */}
        <button
          id="btn-open-add-task-modal-sidebar"
          type="button"
          onClick={handleOpenNewTaskModal}
          className="w-full inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs hover:shadow-md transition-all cursor-pointer"
          title="Dodaj nowe zadanie z datą i godziną"
        >
          <span className="w-4 h-4 text-white font-bold flex items-center justify-center text-lg leading-none">
            +
          </span>
          <span>Nowe zadanie</span>
        </button>

        {/* 2. Przycisk "Nowa lista" & "Do Kalendarza" */}
        <div className="flex items-center space-x-1.5">
          {onCreateTaskList && (
            <button
              type="button"
              onClick={() => setShowNewListModal(true)}
              className="flex-1 inline-flex items-center justify-center space-x-1 text-xs font-medium text-neutral-700 hover:text-neutral-900 bg-white hover:bg-neutral-100 border border-neutral-250 py-1.5 px-2 rounded-lg transition-colors cursor-pointer shadow-2xs"
              title="Utwórz nową listę zadań Google"
            >
              <Plus className="w-3.5 h-3.5 text-neutral-500" />
              <span>Nowa lista</span>
            </button>
          )}

          {onSyncTasksToCalendar && (taskLists.length > 0 || tasks.length > 0) && (
            <button
              id="btn-sync-to-calendar-sidebar"
              type="button"
              onClick={handleOpenSyncModal}
              disabled={isSyncingCalendar}
              className="flex-1 inline-flex items-center justify-center space-x-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 py-1.5 px-2 rounded-lg transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
              title="Wybierz listę zadań oraz kalendarz docelowy, aby dodać zadania"
            >
              {isSyncingCalendar ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>Do Kalendarza</span>
            </button>
          )}
        </div>

        {/* 3. Listy zadań (Pionowy wybór z checkboxami) */}
        {taskLists && taskLists.length > 0 && onToggleTaskListId && (
          <div className="bg-white p-2.5 rounded-xl border border-neutral-200/90 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider">
                Listy zadań ({taskLists.length})
              </span>
              {onSelectAllTaskLists && onClearAllTaskLists && (
                <div className="space-x-1.5 text-[10px]">
                  <button
                    type="button"
                    onClick={onSelectAllTaskLists}
                    className="text-emerald-600 hover:underline cursor-pointer"
                  >
                    Wszystkie
                  </button>
                  <span className="text-neutral-300">•</span>
                  <button
                    type="button"
                    onClick={onClearAllTaskLists}
                    className="text-neutral-500 hover:underline cursor-pointer"
                  >
                    Wyczyść
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {taskLists.map((tl) => {
                const isChecked =
                  !selectedTaskListIds ||
                  selectedTaskListIds.length === 0 ||
                  selectedTaskListIds.includes(ALL_TASK_LISTS_ID) ||
                  selectedTaskListIds.includes(tl.id);
                return (
                  <label
                    key={tl.id}
                    className="flex items-center space-x-2 text-xs text-neutral-700 hover:text-neutral-900 cursor-pointer py-0.5 select-none"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleTaskListId(tl.id)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer shrink-0"
                    />
                    <span className="truncate text-[11px]" title={tl.title}>
                      {tl.title}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Filtr statusu zadań (Wszystkie, Do zrobienia, Ukończone) */}
        <div className="bg-white p-2.5 rounded-xl border border-neutral-200/90 shadow-2xs space-y-1.5">
          <span className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider block">
            Status zadań
          </span>
          <div className="flex flex-col space-y-1">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                filter === 'all'
                  ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <span>Wszystkie</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${filter === 'all' ? 'bg-emerald-700 text-emerald-100' : 'bg-neutral-100 text-neutral-600'}`}>
                {totalCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFilter('active')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                filter === 'active'
                  ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <span>Do zrobienia</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${filter === 'active' ? 'bg-emerald-700 text-emerald-100' : 'bg-neutral-100 text-neutral-600'}`}>
                {totalCount - completedCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFilter('completed')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                filter === 'completed'
                  ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <span>Ukończone</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${filter === 'completed' ? 'bg-emerald-700 text-emerald-100' : 'bg-neutral-100 text-neutral-600'}`}>
                {completedCount}
              </span>
            </button>
          </div>
        </div>

        {/* 5. Pionowy Zakres Dat */}
        <div className="bg-white p-2.5 rounded-xl border border-neutral-200/90 shadow-2xs space-y-1.5">
          <DateRangeFilterBar
            range={activeDateRange}
            onChangeRange={handleDateRangeChange}
            totalCount={tasks.length}
            filteredCount={tasksMatchingDate.length}
            accentColor="emerald"
            orientation="vertical"
            includeNoDateTasks={includeNoDateTasks}
            onToggleIncludeNoDateTasks={handleToggleIncludeNoDate}
            noDateCount={noDateCount}
            idPrefix="tasks-sidebar-date-filter"
          />
        </div>

        {/* 6. Narzędzia i czyszczenie */}
        <div className="bg-white p-2.5 rounded-xl border border-neutral-200/90 shadow-2xs space-y-1.5">
          <span className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider block">
            Narzędzia
          </span>
          <div className="space-y-1">
            <button
              id="btn-refresh-tasks-sidebar"
              type="button"
              onClick={onRefreshTasks}
              disabled={isLoadingTasks}
              className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-700 hover:bg-neutral-100 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-neutral-500 ${isLoadingTasks ? 'animate-spin text-emerald-600' : ''}`} />
              <span>Odśwież zadania</span>
            </button>

            <a
              href="https://tasks.google.com"
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-700 hover:bg-blue-50 transition"
            >
              <span className="flex items-center space-x-2">
                <ListTodo className="w-3.5 h-3.5 text-blue-600" />
                <span>Otwórz Google Tasks</span>
              </span>
              <ExternalLink className="w-3 h-3 text-blue-500" />
            </a>

            {onRemoveHoursFromTitles && (
              <button
                type="button"
                onClick={handleRemoveHoursClick}
                disabled={isRemovingHours}
                className="w-full text-left px-2.5 py-1 rounded text-[11px] text-neutral-600 hover:bg-neutral-100 transition cursor-pointer"
                title="Usuwa prefixy godzinowe (np. '18:00 - ') z nazw istniejących zadań"
              >
                {isRemovingHours ? 'Usuwanie...' : 'Usuń godziny z tytułów'}
              </button>
            )}

            {onClearAllNotes && (
              <button
                type="button"
                onClick={handleClearNotesClick}
                disabled={isCleaningNotes}
                className="w-full text-left px-2.5 py-1 rounded text-[11px] text-neutral-600 hover:bg-neutral-100 transition cursor-pointer"
                title="Czyści pole notatek we wszystkich zadaniach"
              >
                {isCleaningNotes ? 'Czyszczenie...' : 'Wyczyść notatki zadań'}
              </button>
            )}
          </div>
        </div>
        </div>
      </aside>

      {/* RIGHT MAIN AREA: Pole wyświetlania zadań */}
      <div className="flex-1 w-full min-w-0 h-full flex flex-col bg-white overflow-hidden">
        {/* Top Mini Header Bar */}
        <div className="px-3 sm:px-4 py-2 sm:py-2.5 border-b border-neutral-200 bg-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0">
            {/* Przycisk '...' z rozwijaną listą opcji sterowania Zadaniami po lewej stronie od nazwy listy zadań (kółko z '...' wewnątrz) */}
            <div className="relative shrink-0 flex items-center" ref={tasksControlsDropdownRef}>
              <button
                type="button"
                id="btn-sidebar-tasks-controls"
                onClick={() => setShowTasksControlsMenu((prev) => !prev)}
                className={`p-1.5 rounded-full transition-all cursor-pointer border shadow-2xs flex items-center justify-center ${
                  showTasksControlsMenu
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700 ring-2 ring-emerald-500/20 shadow-xs'
                    : 'bg-white hover:bg-neutral-100 border-neutral-250 text-neutral-600 hover:text-neutral-900'
                }`}
                title={showTasksControlsMenu ? 'Ukryj opcje sterowania zadaniami (...)' : 'Pokaż opcje sterowania zadaniami (...)'}
                aria-label="Opcje sterowania zadaniami"
              >
                <MoreHorizontal className="w-4 h-4 stroke-[2.5]" />
              </button>

              {showTasksControlsMenu && (
                <div className="absolute left-0 top-full mt-1.5 z-50 w-72 sm:w-80 max-w-[88vw] bg-white rounded-2xl border border-neutral-200 shadow-xl p-3 sm:p-3.5">
                  {renderTasksControlsMenuContent()}
                </div>
              )}
            </div>

            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-neutral-900 tracking-tight truncate">
                {taskList?.title || 'Wszystkie listy zadań'}
              </h2>
            </div>
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              Google Tasks
            </span>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <div className="text-[11px] text-neutral-600 hidden sm:flex items-center gap-1.5">
              <span className="font-semibold text-neutral-800">{completedCount} z {totalCount} wykonanych</span>
              <span className="text-neutral-400">&bull;</span>
              <span>{progressPercent}%</span>
            </div>
          </div>
        </div>

        {/* Progress bar in header */}
        <div className="w-full bg-neutral-200/80 h-1 overflow-hidden shrink-0">
          <div
            className="bg-emerald-500 h-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Tasks List View */}
        <div className="p-3 sm:p-5 flex-1 min-h-0 overflow-y-auto space-y-2">
          {renderTasksItemList()}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {layoutVariant === 'sidebar' ? (
        renderSidebarLayout()
      ) : (
        <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs flex flex-col h-full w-full min-w-0">
      {/* Header */}
      <div className="p-3.5 sm:p-5 border-b border-neutral-100 bg-neutral-50/50 rounded-t-2xl">
        <div className="flex flex-col gap-2.5">
          {/* Top row: List selector & Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 min-h-[36px]">
            <div className="flex items-center space-x-2.5 sm:space-x-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <ListTodo className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-neutral-900">
                  Lista zadań
                </h2>
                <button
                  type="button"
                  id="btn-toggle-tasks-controls"
                  onClick={toggleControls}
                  className={`p-1.5 rounded-full transition-all cursor-pointer border shadow-2xs flex items-center justify-center ${
                    isControlsOpen
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700 ring-2 ring-emerald-500/20 shadow-xs'
                      : 'bg-white hover:bg-neutral-100 border-neutral-250 text-neutral-600 hover:text-neutral-900'
                  }`}
                  title={isControlsOpen ? 'Ukryj opcje sterowania zadaniami (...)' : 'Pokaż opcje sterowania zadaniami (...)'}
                  aria-label="Opcje sterowania zadaniami"
                >
                  <MoreHorizontal className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Header Right Action Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                id="btn-refresh-tasks-primary"
                type="button"
                onClick={onRefreshTasks}
                disabled={isLoadingTasks}
                className="inline-flex items-center space-x-1 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-200 py-1.5 px-2.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                title="Odśwież zadania z Google Tasks"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingTasks ? 'animate-spin' : ''}`} />
                <span className="hidden md:inline">Odśwież</span>
              </button>

              <a
                href="https://tasks.google.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 py-1.5 px-2 rounded-lg transition-colors"
              >
                <span className="hidden sm:inline">Google Tasks</span>
                <span className="sm:hidden">Google</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Collapsible Row: Add task, Add list, Badge & Do Kalendarza */}
          {isControlsOpen && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 min-h-[32px] pt-1 border-t border-neutral-200/60">
                <div className="flex flex-wrap items-center gap-2">
                  {onToggleTaskListId && onSelectAllTaskLists && onClearAllTaskLists && (
                    <ChecklistPopover
                      label="Listy"
                      triggerId="btn-tasklist-checkbox-filter"
                      items={checklistTaskOptions}
                      selectedIds={selectedTaskListIds}
                      allId={ALL_TASK_LISTS_ID}
                      onToggleId={onToggleTaskListId}
                      onSelectAll={onSelectAllTaskLists}
                      onClearAll={onClearAllTaskLists}
                      align="left"
                    />
                  )}

                  <button
                    id="btn-open-add-task-modal"
                    type="button"
                    onClick={handleOpenNewTaskModal}
                    className="inline-flex items-center space-x-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                    title="Dodaj nowe zadanie z datą i godziną"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nowe zadanie</span>
                  </button>

                  {onCreateTaskList && (
                    <button
                      type="button"
                      onClick={() => setShowNewListModal(true)}
                      className="inline-flex items-center space-x-1 text-xs font-medium text-neutral-700 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 px-2 py-1.5 rounded-lg transition-colors cursor-pointer"
                      title="Utwórz nową listę zadań Google"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Nowa lista</span>
                    </button>
                  )}

                  <span className="inline-flex items-center px-2 py-1 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Google Tasks
                  </span>

                  {onSyncTasksToCalendar && (taskLists.length > 0 || tasks.length > 0) && (
                    <button
                      id="btn-sync-to-calendar"
                      type="button"
                      onClick={handleOpenSyncModal}
                      disabled={isSyncingCalendar}
                      className="inline-flex items-center space-x-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                      title="Wybierz listę zadań oraz kalendarz docelowy, aby dodać zadania"
                    >
                      {isSyncingCalendar ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>Do Kalendarza</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Date Range Filter Bar (Zakres dat) inside collapsible '...' */}
              <DateRangeFilterBar
                range={activeDateRange}
                onChangeRange={handleDateRangeChange}
                totalCount={tasks.length}
                filteredCount={tasksMatchingDate.length}
                accentColor="emerald"
                includeNoDateTasks={includeNoDateTasks}
                onToggleIncludeNoDateTasks={handleToggleIncludeNoDate}
                noDateCount={noDateCount}
                idPrefix="tasks-date-filter"
              />

              {/* Progress & Filters inside collapsible '...' */}
              <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-neutral-50/60 rounded-xl border border-neutral-200/80 mt-1">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600 min-h-[28px]">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-neutral-800">
                      {completedCount} z {totalCount} wykonanych
                    </span>
                    <span className="text-neutral-400">&bull;</span>
                    <span>{progressPercent}%</span>
                  </div>

                  <div className="flex items-center space-x-1 bg-neutral-200/60 p-0.5 rounded-lg text-[11px] shrink-0">
                    <button
                      type="button"
                      onClick={() => setFilter('all')}
                      className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                        filter === 'all' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      Wszystkie ({totalCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilter('active')}
                      className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                        filter === 'active' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      Do zrobienia ({totalCount - completedCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilter('completed')}
                      className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                        filter === 'completed' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      Ukończone ({completedCount})
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-neutral-200/80 h-1.5 rounded-full overflow-hidden mt-1.5">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tasks List */}
      <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-2">
        {renderTasksItemList()}
      </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-2xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => setEditingTask(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-neutral-100 pb-3 mb-3 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Edycja zadania</h3>
                  <p className="text-[11px] text-neutral-500">
                    Dostosuj nazwę, termin oraz czas trwania zadania w kalendarzu
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="text-neutral-400 hover:text-neutral-600 p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditSubmit} className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-1">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Lista zadań (przypisanie)
                </label>
                <select
                  value={editTaskListId}
                  onChange={(e) => setEditTaskListId(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white text-neutral-900 font-medium"
                >
                  {taskLists
                    .filter((tl) => tl.id !== ALL_TASK_LISTS_ID)
                    .map((tl) => (
                      <option key={tl.id} value={tl.id}>
                        {tl.title}
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Wybierz listę, do której ma być przypisane to zadanie. Zmiana listy automatycznie przeniesie zadanie.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Nazwa zadania
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="np. Pakowanie, Wyrzucić śmieci..."
                  required
                  className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white text-neutral-900"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-neutral-700">
                    Termin wykonania (data)
                  </label>
                  {editDue && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditDue('');
                        setAlsoAddToCalendar(false);
                      }}
                      className="text-[10px] text-neutral-400 hover:text-rose-600 transition cursor-pointer"
                      title="Usuń termin wykonania zadania"
                    >
                      Usuń termin
                    </button>
                  )}
                </div>
                <input
                  type="date"
                  value={editDue}
                  onChange={(e) => setEditDue(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white text-neutral-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  disabled={isSavingEdit}
                  className="px-4 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit || !editTitle.trim()}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isSavingEdit ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Zapisywanie...</span>
                    </>
                  ) : (
                    <span>Zapisz zmiany</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create New Task List Modal */}
      {showNewListModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-2xs z-50 flex items-center justify-center p-4"
          onClick={() => setShowNewListModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in-95 duration-150 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-neutral-900 mb-2">Utwórz nową listę zadań Google</h3>
            <p className="text-xs text-neutral-500 mb-4">
              Wpisz nazwę nowej listy zadań w Google Tasks (np. &bdquo;Projekt 2026&rdquo;, &bdquo;Zadania codzienne&rdquo;, &bdquo;Spotkania&rdquo;).
            </p>
            <form onSubmit={handleCreateNewListSubmit} className="space-y-4">
              <input
                type="text"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="Nazwa listy..."
                autoFocus
                className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewListModal(false)}
                  className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={isCreatingList || !newListName.trim()}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {isCreatingList ? 'Tworzenie...' : 'Utwórz listę'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create New Task Modal */}
      {showNewTaskModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-2xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => setShowNewTaskModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in-95 duration-150 my-auto max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-100 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <ListTodo className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-neutral-900">Nowe zadanie w Google Tasks</h3>
                  <p className="text-xs text-neutral-500">
                    Lista: {taskList?.title || 'Wszystkie'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNewTaskModal(false)}
                className="text-neutral-400 hover:text-neutral-600 p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-1">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Lista zadań (docelowa)
                </label>
                <select
                  value={newTaskTargetListId}
                  onChange={(e) => setNewTaskTargetListId(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white text-neutral-900 font-medium"
                >
                  {taskLists
                    .filter((tl) => tl.id !== ALL_TASK_LISTS_ID)
                    .map((tl) => (
                      <option key={tl.id} value={tl.id}>
                        {tl.title}
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Wybierz listę Google Tasks, do której ma trafić to zadanie.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Nazwa zadania
                </label>
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="np. Pakowanie, Sprawdzenie paszportu..."
                  required
                  autoFocus
                  className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white text-neutral-900"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-neutral-700">
                    Termin wykonania (data)
                  </label>
                  {newTaskDue && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewTaskDue('');
                        setNewTaskAlsoCalendar(false);
                      }}
                      className="text-[10px] text-neutral-400 hover:text-rose-600 transition cursor-pointer"
                      title="Usuń termin wykonania zadania"
                    >
                      Usuń termin
                    </button>
                  )}
                </div>
                <input
                  type="date"
                  value={newTaskDue}
                  onChange={(e) => setNewTaskDue(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white text-neutral-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowNewTaskModal(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newTaskTitle.trim()}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Dodawanie...</span>
                    </>
                  ) : (
                    <span>Dodaj zadanie</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal dialog: Do Kalendarza (Sync tasks to calendar) */}
      {showSyncModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-2xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          onClick={() => setShowSyncModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in-95 duration-150 my-auto text-left flex flex-col max-h-[calc(100dvh-2rem)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-neutral-900">
                    Dodaj zadania do kalendarza
                  </h4>
                  <p className="text-[11px] text-neutral-500">
                    Wskaż listę zadań i docelowy Kalendarz Google
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 py-3.5">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Lista zadań (źródło zadań) *
                </label>
                <select
                  id="select-sync-source-task-list-modal"
                  value={syncSourceListId}
                  onChange={(e) => setSyncSourceListId(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium cursor-pointer"
                >
                  <option value={ALL_TASK_LISTS_ID}>
                    Wszystkie listy zadań ({tasks.filter((t) => t.status !== 'completed').length} aktywnych)
                  </option>
                  {taskLists
                    .filter((l) => l.id !== ALL_TASK_LISTS_ID)
                    .map((l) => {
                      const count = tasks.filter((t) => t.taskListId === l.id && t.status !== 'completed').length;
                      return (
                        <option key={l.id} value={l.id}>
                          {l.title} ({count} {count === 1 ? 'zadanie' : count > 1 && count < 5 ? 'zadania' : 'zadań'})
                        </option>
                      );
                    })}
                </select>
                <p className="text-[10px] text-neutral-500 mt-1">
                  Znaleziono {selectedSourceListTasks.length} {selectedSourceListTasks.length === 1 ? 'zadanie' : 'zadań'} do synchronizacji.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Docelowy Kalendarz Google *
                </label>
                <select
                  id="select-sync-target-calendar-modal"
                  value={syncTargetCalendarId}
                  onChange={(e) => setSyncTargetCalendarId(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium cursor-pointer"
                >
                  {calendars && calendars.length > 0 ? (
                    calendars
                      .filter((c) => c.id !== '_all_calendars_')
                      .map((cal) => (
                        <option key={cal.id} value={cal.id}>
                          {cal.summary
                            ?.replace(/\s*[([](?:główny|glowny|primary)[)\]]/gi, '')
                            ?.replace(/\s*-\s*(?:główny|glowny|primary)/gi, '')
                            ?.trim() || cal.summary}
                          {cal.primary ? ' (Główny)' : ''}
                        </option>
                      ))
                  ) : (
                    <option value="">Domyślny kalendarz</option>
                  )}
                </select>
                <p className="text-[10px] text-neutral-500 mt-1">
                  Wybierz kalendarz, do którego zostaną utworzone wydarzenia z terminami.
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-blue-50/80 border border-blue-200/80 flex items-center justify-between text-xs">
                <span className="text-neutral-700 font-medium">Aktywne zadania do utworzenia:</span>
                <strong className="text-blue-700 font-bold text-sm">
                  {selectedSourceListTasks.length}
                </strong>
              </div>

              {selectedSourceListTasks.length === 0 && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  Wybrana lista nie zawiera obecnie aktywnych (niewykonanych) zadań.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-neutral-100 shrink-0">
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                disabled={isSyncingCalendar}
                className="px-3.5 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
              >
                Anuluj
              </button>
              <button
                id="btn-confirm-sync-tasks-to-calendar"
                type="button"
                onClick={() => handleSyncToTargetCalendar(syncTargetCalendarId, syncSourceListId)}
                disabled={isSyncingCalendar || selectedSourceListTasks.length === 0}
                className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSyncingCalendar ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Dodawanie do kalendarza...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Dodaj do Kalendarza</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
