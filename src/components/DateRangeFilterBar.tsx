import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  CalendarRange,
  ChevronDown,
  RotateCcw,
  SlidersHorizontal,
  Check,
} from 'lucide-react';
import {
  DateRangeState,
  DateFilterPreset,
  DATE_PRESET_LABELS,
  calculatePresetDates,
  getDefaultDateRange,
  formatHumanDate,
} from '../utils/dateFilterUtils';

interface DateRangeFilterBarProps {
  range: DateRangeState;
  onChangeRange: (newRange: DateRangeState) => void;
  totalCount: number;
  filteredCount: number;
  accentColor?: 'blue' | 'emerald';
  orientation?: 'horizontal' | 'vertical';
  // Optional tasks-specific support for tasks without due dates
  includeNoDateTasks?: boolean;
  onToggleIncludeNoDateTasks?: (val: boolean) => void;
  noDateCount?: number;
  idPrefix?: string;
}

export const DateRangeFilterBar: React.FC<DateRangeFilterBarProps> = ({
  range,
  onChangeRange,
  totalCount,
  filteredCount,
  accentColor = 'blue',
  orientation = 'horizontal',
  includeNoDateTasks,
  onToggleIncludeNoDateTasks,
  noDateCount,
  idPrefix = 'date-filter',
}) => {
  const [showCustomInputs, setShowCustomInputs] = useState(range.preset === 'custom');

  const isEmerald = accentColor === 'emerald';
  const activeBgClass = isEmerald
    ? 'bg-emerald-600 text-white shadow-xs'
    : 'bg-blue-600 text-white shadow-xs';
  const activeBorderClass = isEmerald
    ? 'border-emerald-500 text-emerald-700 bg-emerald-50/50'
    : 'border-blue-500 text-blue-700 bg-blue-50/50';
  const tagBgClass = isEmerald
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-blue-50 text-blue-700 border-blue-200';

  const handleSelectPreset = (preset: DateFilterPreset) => {
    if (preset === 'custom') {
      setShowCustomInputs(true);
      onChangeRange({
        preset: 'custom',
        startDate: range.startDate || calculatePresetDates('from_today').startDate,
        endDate: range.endDate,
      });
      return;
    }

    setShowCustomInputs(false);
    const { startDate, endDate } = calculatePresetDates(preset);
    onChangeRange({
      preset,
      startDate,
      endDate,
    });
  };

  const handleStartDateChange = (val: string) => {
    onChangeRange({
      preset: 'custom',
      startDate: val,
      endDate: range.endDate,
    });
  };

  const handleEndDateChange = (val: string) => {
    onChangeRange({
      preset: 'custom',
      startDate: range.startDate,
      endDate: val,
    });
  };

  const handleResetToDefault = () => {
    setShowCustomInputs(false);
    onChangeRange(getDefaultDateRange());
  };

  // Determine human summary of active date range
  const getRangeDescription = () => {
    if (range.preset === 'from_today') {
      return `od dzisiaj (${formatHumanDate(range.startDate)})`;
    }
    if (range.preset === 'today') {
      return `dzisiaj (${formatHumanDate(range.startDate)})`;
    }
    if (range.preset === 'all') {
      return 'wszystkie terminy (w tym przeszłe)';
    }
    if (range.startDate && range.endDate) {
      return `${formatHumanDate(range.startDate)} – ${formatHumanDate(range.endDate)}`;
    }
    if (range.startDate) {
      return `od ${formatHumanDate(range.startDate)}`;
    }
    if (range.endDate) {
      return `do ${formatHumanDate(range.endDate)}`;
    }
    return 'wszystkie';
  };

  const isDefaultRange = range.preset === 'from_today';

  const presets: { id: DateFilterPreset; label: string }[] = [
    { id: 'from_today', label: 'Od dzisiaj (domyślnie)' },
    { id: 'today', label: 'Dziś' },
    { id: 'next_7_days', label: '7 dni' },
    { id: 'next_30_days', label: '30 dni' },
    { id: 'this_month', label: 'Ten miesiąc' },
    { id: 'all', label: 'Wszystkie' },
    { id: 'custom', label: 'Własny...' },
  ];

  if (orientation === 'vertical') {
    return (
      <div className="space-y-2.5 w-full">
        <div className="flex items-center justify-between text-xs text-neutral-600">
          <div className="flex items-center space-x-1.5 font-semibold text-neutral-800">
            <CalendarRange className="w-3.5 h-3.5 text-neutral-500" />
            <span>Zakres dat</span>
          </div>
          {!isDefaultRange && (
            <button
              type="button"
              id={`${idPrefix}-btn-reset`}
              onClick={handleResetToDefault}
              className="text-[10px] text-neutral-500 hover:text-neutral-800 transition cursor-pointer flex items-center gap-1"
              title="Domyślny zakres (od dzisiaj)"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>Domyślny</span>
            </button>
          )}
        </div>

        {/* Preset Buttons in 2-column or list */}
        <div className="grid grid-cols-2 gap-1 text-[11px]">
          {presets.map((p) => {
            const isActive = range.preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                id={`${idPrefix}-preset-${p.id}`}
                onClick={() => handleSelectPreset(p.id)}
                className={`px-2 py-1.5 rounded-lg text-center font-medium transition cursor-pointer truncate ${
                  isActive
                    ? activeBgClass
                    : 'bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Custom Inputs */}
        {(showCustomInputs || range.preset === 'custom') && (
          <div className="space-y-1.5 p-2 bg-white rounded-lg border border-neutral-200 text-xs">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-semibold text-neutral-500">Od:</span>
              <input
                id={`${idPrefix}-input-start`}
                type="date"
                value={range.startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="text-xs bg-neutral-50 border border-neutral-200 rounded px-1.5 py-0.5 w-32 text-neutral-800"
              />
            </div>
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-semibold text-neutral-500">Do:</span>
              <input
                id={`${idPrefix}-input-end`}
                type="date"
                value={range.endDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="text-xs bg-neutral-50 border border-neutral-200 rounded px-1.5 py-0.5 w-32 text-neutral-800"
              />
            </div>
          </div>
        )}

        {/* Optional Tasks Checkbox */}
        {onToggleIncludeNoDateTasks && (
          <label className="flex items-center space-x-2 text-xs text-neutral-600 hover:text-neutral-900 cursor-pointer pt-0.5 select-none">
            <input
              type="checkbox"
              id={`${idPrefix}-checkbox-no-date`}
              checked={!!includeNoDateTasks}
              onChange={(e) => onToggleIncludeNoDateTasks(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
            />
            <span className="text-[11px]">
              Zadania bez terminu
              {noDateCount !== undefined ? ` (${noDateCount})` : ''}
            </span>
          </label>
        )}

        {/* Summary count */}
        <div className="text-[10px] text-neutral-500 pt-1 flex items-center justify-between border-t border-neutral-200/70">
          <span className="truncate max-w-[140px]">{getRangeDescription()}</span>
          <span className="font-semibold text-neutral-700 shrink-0">
            {filteredCount === totalCount ? `${totalCount}` : `${filteredCount}/${totalCount}`}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-neutral-50/80 border-b border-neutral-200/80 px-3.5 py-2.5 space-y-2">
      {/* Top Row: Presets & Quick summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 min-h-[28px]">
        <div className="flex items-center space-x-1.5 text-xs text-neutral-600 shrink-0">
          <CalendarRange className="w-3.5 h-3.5 text-neutral-500" />
          <span className="font-semibold text-neutral-700">Zakres dat:</span>
        </div>

        {/* Preset Pills */}
        <div className="flex flex-wrap items-center gap-1">
          {presets.map((p) => {
            const isActive = range.preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                id={`${idPrefix}-preset-${p.id}`}
                onClick={() => handleSelectPreset(p.id)}
                className={`px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? activeBgClass
                    : 'bg-white text-neutral-700 hover:bg-neutral-100/90 border border-neutral-200/90'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Second Row: Detailed custom date inputs or active filter summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs min-h-[28px]">
        {/* Custom inputs or Range badge */}
        {showCustomInputs || range.preset === 'custom' ? (
          <div className="flex flex-wrap items-center gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-neutral-200">
            <div className="flex items-center space-x-1.5">
              <label htmlFor={`${idPrefix}-input-start`} className="text-[11px] font-semibold text-neutral-600">
                Od:
              </label>
              <input
                id={`${idPrefix}-input-start`}
                type="date"
                value={range.startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="text-xs bg-neutral-50 border border-neutral-200 rounded px-2 py-0.5 text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-400 cursor-pointer"
              />
            </div>

            <div className="flex items-center space-x-1.5">
              <label htmlFor={`${idPrefix}-input-end`} className="text-[11px] font-semibold text-neutral-600">
                Do:
              </label>
              <input
                id={`${idPrefix}-input-end`}
                type="date"
                value={range.endDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                placeholder="Bez limitu"
                className="text-xs bg-neutral-50 border border-neutral-200 rounded px-2 py-0.5 text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-400 cursor-pointer"
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${tagBgClass}`}
            >
              Pokazuj: {getRangeDescription()}
            </span>
            {!isDefaultRange && (
              <button
                type="button"
                id={`${idPrefix}-btn-reset`}
                onClick={handleResetToDefault}
                className="inline-flex items-center space-x-1 text-[11px] text-neutral-500 hover:text-neutral-800 transition cursor-pointer"
                title="Przywróć domyślny filtr (od dzisiaj)"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Wróć do &bdquo;Od dzisiaj&rdquo;</span>
              </button>
            )}
          </div>
        )}

        {/* Counts & Optional Tasks Checkbox */}
        <div className="flex items-center space-x-3 text-neutral-500 text-[11px] ml-auto">
          {onToggleIncludeNoDateTasks && (
            <label className="inline-flex items-center space-x-1.5 cursor-pointer select-none text-neutral-600 hover:text-neutral-900">
              <input
                type="checkbox"
                id={`${idPrefix}-checkbox-no-date`}
                checked={!!includeNoDateTasks}
                onChange={(e) => onToggleIncludeNoDateTasks(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
              />
              <span>
                Zadania bez terminu
                {noDateCount !== undefined ? ` (${noDateCount})` : ''}
              </span>
            </label>
          )}

          <span className="font-medium text-neutral-700">
            {filteredCount === totalCount ? (
              <span>{totalCount} pozycji</span>
            ) : (
              <span>
                {filteredCount} z {totalCount} pozycji
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
};
