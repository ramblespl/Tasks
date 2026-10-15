import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Clock, Keyboard, Sparkles, Check, X } from 'lucide-react';

interface AndroidTimePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  value: string; // e.g. "09:30"
  onChange: (time: string) => void;
  title?: string;
}

export const AndroidTimePickerModal: React.FC<AndroidTimePickerModalProps> = ({
  isOpen,
  onClose,
  value,
  onChange,
  title = 'Wybierz godzinę',
}) => {
  // Parse initial time
  const [selectedHour, setSelectedHour] = useState<number>(() => {
    const [h] = (value || '09:00').split(':').map(Number);
    return isNaN(h) ? 9 : Math.max(0, Math.min(23, h));
  });

  const [selectedMinute, setSelectedMinute] = useState<number>(() => {
    const [, m] = (value || '09:00').split(':').map(Number);
    return isNaN(m) ? 0 : Math.max(0, Math.min(59, m));
  });

  // Active view tab: 'both' | 'hour' | 'minute'
  const [activeTab, setActiveTab] = useState<'both' | 'hour' | 'minute'>('both');

  // Inline keyboard editing states: 'none' | 'hour' | 'minute'
  const [inlineEdit, setInlineEdit] = useState<'none' | 'hour' | 'minute'>('none');
  const [inlineHourVal, setInlineHourVal] = useState<string>('');
  const [inlineMinuteVal, setInlineMinuteVal] = useState<string>('');

  const hourInputRef = useRef<HTMLInputElement>(null);
  const minuteInputRef = useRef<HTMLInputElement>(null);
  const lastHourTapRef = useRef<number>(0);
  const lastMinuteTapRef = useRef<number>(0);

  // Sync state when modal opens or value changes
  useEffect(() => {
    if (isOpen) {
      const [h, m] = (value || '09:00').split(':').map(Number);
      setSelectedHour(isNaN(h) ? 9 : Math.max(0, Math.min(23, h)));
      setSelectedMinute(isNaN(m) ? 0 : Math.max(0, Math.min(59, m)));
      setInlineEdit('none');
    }
  }, [isOpen, value]);

  const pad = (n: number) => String(n).padStart(2, '0');

  const startHourEdit = () => {
    setInlineHourVal(pad(selectedHour));
    setInlineEdit('hour');
    setActiveTab('hour');
    setTimeout(() => {
      hourInputRef.current?.focus();
      hourInputRef.current?.select();
    }, 30);
  };

  const startMinuteEdit = () => {
    setInlineMinuteVal(pad(selectedMinute));
    setInlineEdit('minute');
    setActiveTab('minute');
    setTimeout(() => {
      minuteInputRef.current?.focus();
      minuteInputRef.current?.select();
    }, 30);
  };

  const finishHourEdit = (val?: string) => {
    const raw = val !== undefined ? val : inlineHourVal;
    const num = parseInt(raw, 10);
    if (!isNaN(num)) {
      setSelectedHour(Math.max(0, Math.min(23, num)));
    }
    setInlineEdit('none');
  };

  const finishMinuteEdit = (val?: string) => {
    const raw = val !== undefined ? val : inlineMinuteVal;
    const num = parseInt(raw, 10);
    if (!isNaN(num)) {
      setSelectedMinute(Math.max(0, Math.min(59, num)));
    }
    setInlineEdit('none');
  };

  const handleApply = () => {
    onChange(`${pad(selectedHour)}:${pad(selectedMinute)}`);
    onClose();
  };

  const handleQuickAddMinutes = (delta: number) => {
    let total = selectedHour * 60 + selectedMinute + delta;
    if (total < 0) total += 24 * 60;
    total = total % (24 * 60);
    setSelectedHour(Math.floor(total / 60));
    setSelectedMinute(total % 60);
  };

  const handleSetPreset = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) {
      setSelectedHour(h);
      setSelectedMinute(m);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[500px] bg-[#f8f9fe] text-neutral-900 rounded-[28px] shadow-2xl border border-neutral-200/80 p-5 sm:p-6 flex flex-col overflow-hidden select-none animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Title and Android 17 Material You badge */}
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider font-semibold text-neutral-500">
                Android 17 Time Picker
              </span>
              <h3 className="text-base sm:text-lg font-bold text-neutral-900 leading-tight">
                {title}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 transition"
            title="Zamknij"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Material You Time Display: Big [ HH ] : [ MM ] rounded blocks */}
        <div className="flex flex-col items-center mb-3">
          <div className="flex items-center justify-center gap-2 sm:gap-3 py-2 px-3 bg-white/70 rounded-2xl border border-neutral-200/80 shadow-2xs w-full max-w-sm">
            {/* Hour Box */}
            {inlineEdit === 'hour' ? (
              <div className="flex flex-col items-center justify-center min-w-[84px] sm:min-w-[100px] h-[72px] sm:h-[80px] rounded-2xl bg-white border-2 border-blue-600 shadow-md">
                <input
                  ref={hourInputRef}
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  value={inlineHourVal}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/\D/g, '').slice(0, 2);
                    setInlineHourVal(clean);
                    if (clean.length > 0) {
                      const num = parseInt(clean, 10);
                      if (!isNaN(num)) {
                        setSelectedHour(Math.max(0, Math.min(23, num)));
                        if (clean.length === 2 || num > 2) {
                          setTimeout(() => startMinuteEdit(), 120);
                        }
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      finishHourEdit();
                    } else if (e.key === 'Tab') {
                      e.preventDefault();
                      startMinuteEdit();
                    }
                  }}
                  onBlur={() => finishHourEdit()}
                  className="w-full text-center text-3xl sm:text-4xl font-extrabold tracking-tight font-mono text-blue-600 bg-transparent focus:outline-none"
                  autoFocus
                />
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                  Wpisz godz.
                </span>
              </div>
            ) : (
              <div
                onClick={() => {
                  setActiveTab('hour');
                }}
                onDoubleClick={startHourEdit}
                onTouchEnd={(e) => {
                  const now = Date.now();
                  if (now - lastHourTapRef.current < 350) {
                    e.preventDefault();
                    startHourEdit();
                  }
                  lastHourTapRef.current = now;
                }}
                className={`flex flex-col items-center justify-center min-w-[84px] sm:min-w-[100px] h-[72px] sm:h-[80px] rounded-2xl transition-all cursor-pointer select-none relative group ${
                  activeTab === 'hour'
                    ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-600 ring-offset-2 scale-102'
                    : 'bg-neutral-100 hover:bg-neutral-200/80 text-neutral-800'
                }`}
                title="Dwukrotne kliknięcie: wpisz godzinę z klawiatury"
              >
                <span className="text-3xl sm:text-4xl font-extrabold tracking-tight font-mono">
                  {pad(selectedHour)}
                </span>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider mt-0.5 ${
                    activeTab === 'hour' ? 'text-blue-100' : 'text-neutral-500'
                  }`}
                >
                  Godzina
                </span>
              </div>
            )}

            {/* Separator colon */}
            <span className="text-3xl sm:text-4xl font-extrabold text-neutral-400 select-none pb-3">
              :
            </span>

            {/* Minute Box */}
            {inlineEdit === 'minute' ? (
              <div className="flex flex-col items-center justify-center min-w-[84px] sm:min-w-[100px] h-[72px] sm:h-[80px] rounded-2xl bg-white border-2 border-emerald-600 shadow-md">
                <input
                  ref={minuteInputRef}
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  value={inlineMinuteVal}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/\D/g, '').slice(0, 2);
                    setInlineMinuteVal(clean);
                    if (clean.length > 0) {
                      const num = parseInt(clean, 10);
                      if (!isNaN(num)) {
                        setSelectedMinute(Math.max(0, Math.min(59, num)));
                        if (clean.length === 2) {
                          setTimeout(() => finishMinuteEdit(clean), 150);
                        }
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      finishMinuteEdit();
                    }
                  }}
                  onBlur={() => finishMinuteEdit()}
                  className="w-full text-center text-3xl sm:text-4xl font-extrabold tracking-tight font-mono text-emerald-600 bg-transparent focus:outline-none"
                  autoFocus
                />
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                  Wpisz min.
                </span>
              </div>
            ) : (
              <div
                onClick={() => {
                  setActiveTab('minute');
                }}
                onDoubleClick={startMinuteEdit}
                onTouchEnd={(e) => {
                  const now = Date.now();
                  if (now - lastMinuteTapRef.current < 350) {
                    e.preventDefault();
                    startMinuteEdit();
                  }
                  lastMinuteTapRef.current = now;
                }}
                className={`flex flex-col items-center justify-center min-w-[84px] sm:min-w-[100px] h-[72px] sm:h-[80px] rounded-2xl transition-all cursor-pointer select-none relative group ${
                  activeTab === 'minute'
                    ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-600 ring-offset-2 scale-102'
                    : 'bg-neutral-100 hover:bg-neutral-200/80 text-neutral-800'
                }`}
                title="Dwukrotne kliknięcie: wpisz minutę z klawiatury"
              >
                <span className="text-3xl sm:text-4xl font-extrabold tracking-tight font-mono">
                  {pad(selectedMinute)}
                </span>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider mt-0.5 ${
                    activeTab === 'minute' ? 'text-blue-100' : 'text-neutral-500'
                  }`}
                >
                  Minuta
                </span>
              </div>
            )}

            {/* Both circles button */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('both');
                setInlineEdit('none');
              }}
              className={`hidden sm:flex flex-col items-center justify-center px-3 h-[72px] sm:h-[80px] rounded-2xl border transition text-xs font-semibold ${
                activeTab === 'both' && inlineEdit === 'none'
                  ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-xs'
                  : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:bg-neutral-100'
              }`}
              title="Pokaż kółko godziny i kółko minuty jednocześnie"
            >
              <Sparkles className="w-4 h-4 mb-1 text-blue-600" />
              <span>Oba kółka</span>
            </button>
          </div>

          {/* Double-click keyboard hint */}
          <p className="text-[11px] text-neutral-400 mt-1.5 flex items-center gap-1 font-medium">
            <Keyboard className="w-3 h-3 text-neutral-400" />
            <span>2x kliknij na godzinę lub minutę, aby wpisać z klawiatury</span>
          </p>
        </div>

        {/* View Mode Tabs on mobile */}
        <div className="flex sm:hidden items-center justify-center gap-1.5 mb-3 bg-neutral-200/70 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => {
              setActiveTab('both');
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === 'both'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-neutral-600'
            }`}
          >
            Oba kółka
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('hour');
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === 'hour'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-neutral-600'
            }`}
          >
            Kółko godz.
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('minute');
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === 'minute'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-neutral-600'
            }`}
          >
            Kółko min.
          </button>
        </div>

        {/* MAIN BODY: Interactive Dials ("kółka zostaw") */}
        <div className="flex items-center justify-center py-1">
          {activeTab === 'both' ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full">
              {/* Hour Dial (Left Circle) */}
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-700">
                    Godzina ({pad(selectedHour)})
                  </span>
                </div>
                <div className="w-full max-w-[210px] aspect-square">
                  <HourClockDial
                    selectedHour={selectedHour}
                    onSelectHour={(h) => {
                      setSelectedHour(h);
                      if (inlineEdit === 'hour') setInlineHourVal(pad(h));
                    }}
                  />
                </div>
              </div>

              {/* Minute Dial (Right Circle) */}
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-700">
                    Minuta ({pad(selectedMinute)})
                  </span>
                </div>
                <div className="w-full max-w-[210px] aspect-square">
                  <MinuteClockDial
                    selectedMinute={selectedMinute}
                    onSelectMinute={(m) => {
                      setSelectedMinute(m);
                      if (inlineEdit === 'minute') setInlineMinuteVal(pad(m));
                    }}
                  />
                </div>
              </div>
            </div>
          ) : activeTab === 'hour' ? (
            /* Single Big Hour Dial */
            <div className="flex flex-col items-center w-full">
              <div className="flex items-center justify-between w-full max-w-[260px] mb-2 px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-700">
                  Kółko godziny: {pad(selectedHour)}:00
                </span>
                <span className="text-[11px] text-blue-600 font-semibold">24h format</span>
              </div>
              <div className="w-full max-w-[250px] aspect-square">
                <HourClockDial
                  selectedHour={selectedHour}
                  onSelectHour={(h) => {
                    setSelectedHour(h);
                    if (inlineEdit === 'hour') setInlineHourVal(pad(h));
                    // Auto switch to minute dial for fluid flow
                    setActiveTab('minute');
                  }}
                />
              </div>
            </div>
          ) : (
            /* Single Big Minute Dial */
            <div className="flex flex-col items-center w-full">
              <div className="flex items-center justify-between w-full max-w-[260px] mb-2 px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-700">
                  Kółko minuty: {pad(selectedMinute)} min
                </span>
                <span className="text-[11px] text-emerald-600 font-semibold">kroki 5 min</span>
              </div>
              <div className="w-full max-w-[250px] aspect-square">
                <MinuteClockDial
                  selectedMinute={selectedMinute}
                  onSelectMinute={(m) => {
                    setSelectedMinute(m);
                    if (inlineEdit === 'minute') setInlineMinuteVal(pad(m));
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Quick presets and minute adjust buttons */}
        <div className="mt-3 pt-2.5 border-t border-neutral-200/70 flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-1 overflow-x-auto py-0.5 max-w-full">
            <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mr-0.5">
              Szybkie:
            </span>
            {['08:00', '09:00', '12:00', '15:00', '18:00', '20:00'].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleSetPreset(preset)}
                className={`text-[11px] font-mono px-2 py-0.5 rounded-lg border transition ${
                  `${pad(selectedHour)}:${pad(selectedMinute)}` === preset
                    ? 'bg-blue-600 text-white border-blue-600 font-bold'
                    : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleQuickAddMinutes(-15)}
              className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-neutral-200/70 hover:bg-neutral-200 text-neutral-700 transition"
              title="-15 minut"
            >
              -15m
            </button>
            <button
              type="button"
              onClick={() => handleQuickAddMinutes(15)}
              className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-neutral-200/70 hover:bg-neutral-200 text-neutral-700 transition"
              title="+15 minut"
            >
              +15m
            </button>
            <button
              type="button"
              onClick={() => handleQuickAddMinutes(30)}
              className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-neutral-200/70 hover:bg-neutral-200 text-neutral-700 transition"
              title="+30 minut"
            >
              +30m
            </button>
          </div>
        </div>

        {/* Footer Actions: Keyboard toggle + Anuluj + Zatwierdź */}
        <div className="mt-4 pt-3 border-t border-neutral-200 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (inlineEdit === 'none') {
                startHourEdit();
              } else {
                setInlineEdit('none');
              }
            }}
            className="p-2 rounded-full text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200/70 transition flex items-center gap-1 text-xs"
            title="Wpisz godzinę ręcznie z klawiatury (2x kliknij na godzinę/minutę)"
          >
            <Keyboard className="w-4 h-4 text-blue-600" />
            <span className="hidden sm:inline text-[11px] text-neutral-600 font-medium">Klawiatura</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/70 rounded-full transition"
            >
              Anuluj
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="flex items-center gap-1.5 px-5 py-2 text-xs sm:text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-sm hover:shadow transition active:scale-98"
            >
              <Check className="w-4 h-4" />
              <span>Zastosuj</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
 * 1. Hour Clock Dial (Android 17 / Material 3 24-hour clock face)
 * Center: (110, 110). Outer ring: 00, 13..23. Inner ring: 12, 1..11.
 * ------------------------------------------------------------- */
interface HourClockDialProps {
  selectedHour: number;
  onSelectHour: (hour: number) => void;
}

const HourClockDial: React.FC<HourClockDialProps> = ({ selectedHour, onSelectHour }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const isDraggingRef = useRef(false);

  // Outer ring numbers: 00 at top, 13..23
  const outerNumbers = useMemo(
    () => [
      { num: 0, label: '00', clockStep: 0 },
      { num: 13, label: '13', clockStep: 1 },
      { num: 14, label: '14', clockStep: 2 },
      { num: 15, label: '15', clockStep: 3 },
      { num: 16, label: '16', clockStep: 4 },
      { num: 17, label: '17', clockStep: 5 },
      { num: 18, label: '18', clockStep: 6 },
      { num: 19, label: '19', clockStep: 7 },
      { num: 20, label: '20', clockStep: 8 },
      { num: 21, label: '21', clockStep: 9 },
      { num: 22, label: '22', clockStep: 10 },
      { num: 23, label: '23', clockStep: 11 },
    ],
    []
  );

  // Inner ring numbers: 12 at top, 1..11
  const innerNumbers = useMemo(
    () => [
      { num: 12, label: '12', clockStep: 0 },
      { num: 1, label: '1', clockStep: 1 },
      { num: 2, label: '2', clockStep: 2 },
      { num: 3, label: '3', clockStep: 3 },
      { num: 4, label: '4', clockStep: 4 },
      { num: 5, label: '5', clockStep: 5 },
      { num: 6, label: '6', clockStep: 6 },
      { num: 7, label: '7', clockStep: 7 },
      { num: 8, label: '8', clockStep: 8 },
      { num: 9, label: '9', clockStep: 9 },
      { num: 10, label: '10', clockStep: 10 },
      { num: 11, label: '11', clockStep: 11 },
    ],
    []
  );

  const cx = 110;
  const cy = 110;
  const outerRadius = 84;
  const innerRadius = 54;

  const isOuter = selectedHour === 0 || selectedHour >= 13;
  const currentRadius = isOuter ? outerRadius : innerRadius;
  const currentClockStep = selectedHour % 12;
  const currentAngleRad = ((currentClockStep * 30 - 90) * Math.PI) / 180;
  const thumbX = cx + currentRadius * Math.cos(currentAngleRad);
  const thumbY = cy + currentRadius * Math.sin(currentAngleRad);

  const getHourFromCoords = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = clientX - (rect.left + rect.width / 2);
    const y = clientY - (rect.top + rect.height / 2);
    const dist = Math.sqrt(x * x + y * y);
    const angleDeg = ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360;
    const step = Math.round(angleDeg / 30) % 12;

    const threshold = (outerRadius + innerRadius) / 2;
    // Scale distance based on SVG rendering scale
    const svgScale = rect.width / 220;
    const scaledDist = dist / svgScale;

    let hour = 0;
    if (scaledDist >= threshold) {
      hour = step === 0 ? 0 : step + 12;
    } else {
      hour = step === 0 ? 12 : step;
    }
    onSelectHour(hour);
  }, [onSelectHour]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    getHourFromCoords(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDraggingRef.current) return;
    getHourFromCoords(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}
  };

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 220 220"
      className="w-full h-full cursor-pointer touch-none select-none drop-shadow-xs"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Dial background circle */}
      <circle cx={cx} cy={cy} r={102} fill="#eef0f8" stroke="#dbe0ef" strokeWidth={1} />

      {/* Subtle guide ring */}
      <circle cx={cx} cy={cy} r={outerRadius} fill="none" stroke="#e0e4f2" strokeDasharray="2 3" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={innerRadius} fill="none" stroke="#e0e4f2" strokeDasharray="2 3" strokeWidth={1} />

      {/* Clock hand line */}
      <line
        x1={cx}
        y1={cy}
        x2={thumbX}
        y2={thumbY}
        stroke="#2563eb"
        strokeWidth={2.5}
        strokeLinecap="round"
      />

      {/* Clock center pivot */}
      <circle cx={cx} cy={cy} r={4} fill="#2563eb" />

      {/* Selected Hour Thumb Bubble */}
      <circle
        cx={thumbX}
        cy={thumbY}
        r={isOuter ? 14 : 12}
        fill="#2563eb"
        className="transition-all duration-75"
      />

      {/* Outer Numbers (00, 13..23) */}
      {outerNumbers.map(({ num, label, clockStep }) => {
        const rad = ((clockStep * 30 - 90) * Math.PI) / 180;
        const x = cx + outerRadius * Math.cos(rad);
        const y = cy + outerRadius * Math.sin(rad);
        const isSelected = selectedHour === num;

        return (
          <text
            key={`outer-${num}`}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            fontWeight={isSelected ? 'bold' : '600'}
            fill={isSelected ? '#ffffff' : '#334155'}
            className="pointer-events-none select-none font-sans"
          >
            {label}
          </text>
        );
      })}

      {/* Inner Numbers (12, 1..11) */}
      {innerNumbers.map(({ num, label, clockStep }) => {
        const rad = ((clockStep * 30 - 90) * Math.PI) / 180;
        const x = cx + innerRadius * Math.cos(rad);
        const y = cy + innerRadius * Math.sin(rad);
        const isSelected = selectedHour === num;

        return (
          <text
            key={`inner-${num}`}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={10}
            fontWeight={isSelected ? 'bold' : '500'}
            fill={isSelected ? '#ffffff' : '#64748b'}
            className="pointer-events-none select-none font-sans"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
};

/* -------------------------------------------------------------
 * 2. Minute Clock Dial (Android 17 / Material 3 minute dial)
 * Center: (110, 110). Radius: 84px.
 * Major numbers: 00, 05, 10, ..., 55. Minor minute dots.
 * ------------------------------------------------------------- */
interface MinuteClockDialProps {
  selectedMinute: number;
  onSelectMinute: (minute: number) => void;
}

const MinuteClockDial: React.FC<MinuteClockDialProps> = ({ selectedMinute, onSelectMinute }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const isDraggingRef = useRef(false);

  const majorMinutes = useMemo(
    () => [
      { min: 0, label: '00', step: 0 },
      { min: 5, label: '05', step: 1 },
      { min: 10, label: '10', step: 2 },
      { min: 15, label: '15', step: 3 },
      { min: 20, label: '20', step: 4 },
      { min: 25, label: '25', step: 5 },
      { min: 30, label: '30', step: 6 },
      { min: 35, label: '35', step: 7 },
      { min: 40, label: '40', step: 8 },
      { min: 45, label: '45', step: 9 },
      { min: 50, label: '50', step: 10 },
      { min: 55, label: '55', step: 11 },
    ],
    []
  );

  const cx = 110;
  const cy = 110;
  const radius = 84;

  const currentAngleRad = ((selectedMinute * 6 - 90) * Math.PI) / 180;
  const thumbX = cx + radius * Math.cos(currentAngleRad);
  const thumbY = cy + radius * Math.sin(currentAngleRad);

  const getMinuteFromCoords = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = clientX - (rect.left + rect.width / 2);
    const y = clientY - (rect.top + rect.height / 2);
    const angleDeg = ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360;

    // Calculate exact minute (0-59)
    const exactMin = Math.round(angleDeg / 6) % 60;
    onSelectMinute(exactMin);
  }, [onSelectMinute]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    getMinuteFromCoords(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDraggingRef.current) return;
    getMinuteFromCoords(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}
  };

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 220 220"
      className="w-full h-full cursor-pointer touch-none select-none drop-shadow-xs"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Dial background circle */}
      <circle cx={cx} cy={cy} r={102} fill="#eef0f8" stroke="#dbe0ef" strokeWidth={1} />

      {/* Subtle guide ring */}
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#e0e4f2" strokeDasharray="1 4" strokeWidth={1} />

      {/* Minor tick marks around the dial */}
      {Array.from({ length: 60 }).map((_, i) => {
        if (i % 5 === 0) return null; // Skip major numbers
        const rad = ((i * 6 - 90) * Math.PI) / 180;
        const x = cx + radius * Math.cos(rad);
        const y = cy + radius * Math.sin(rad);
        return <circle key={`dot-${i}`} cx={x} cy={y} r={1} fill="#94a3b8" />;
      })}

      {/* Clock hand line */}
      <line
        x1={cx}
        y1={cy}
        x2={thumbX}
        y2={thumbY}
        stroke="#059669"
        strokeWidth={2.5}
        strokeLinecap="round"
      />

      {/* Clock center pivot */}
      <circle cx={cx} cy={cy} r={4} fill="#059669" />

      {/* Selected Minute Thumb Bubble */}
      <circle
        cx={thumbX}
        cy={thumbY}
        r={14}
        fill="#059669"
        className="transition-all duration-75"
      />

      {/* Render selected minute number in thumb if not on a major tick */}
      {selectedMinute % 5 !== 0 && (
        <text
          x={thumbX}
          y={thumbY}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={11}
          fontWeight="bold"
          fill="#ffffff"
          className="pointer-events-none select-none font-sans"
        >
          {String(selectedMinute).padStart(2, '0')}
        </text>
      )}

      {/* Major Minutes (00, 05, 10, ..., 55) */}
      {majorMinutes.map(({ min, label, step }) => {
        const rad = ((step * 30 - 90) * Math.PI) / 180;
        const x = cx + radius * Math.cos(rad);
        const y = cy + radius * Math.sin(rad);
        const isSelected = selectedMinute === min;

        return (
          <text
            key={`min-${min}`}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            fontWeight={isSelected ? 'bold' : '600'}
            fill={isSelected ? '#ffffff' : '#334155'}
            className="pointer-events-none select-none font-sans"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
};

/* -------------------------------------------------------------
 * 3. AndroidTimePickerField: Reusable time input trigger component
 * Renders an Android 17 style button with clock icon that opens
 * the AndroidTimePickerModal on click.
 * ------------------------------------------------------------- */
interface AndroidTimePickerFieldProps {
  label?: string;
  value: string;
  onChange: (time: string) => void;
  className?: string;
  title?: string;
}

export const AndroidTimePickerField: React.FC<AndroidTimePickerFieldProps> = ({
  label,
  value,
  onChange,
  className = '',
  title,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`w-full ${className}`}>
      {label && <label className="block text-[11px] font-medium text-neutral-600 mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-between text-xs sm:text-sm border border-neutral-300 rounded-lg px-2.5 py-2 bg-white hover:bg-neutral-50 hover:border-blue-400 focus:ring-2 focus:ring-blue-500 focus:outline-none transition group shadow-2xs"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-blue-600 group-hover:scale-110 transition-transform" />
          <span className="font-mono font-semibold text-neutral-800 tracking-wider">
            {value || '09:00'}
          </span>
        </div>
        <span className="text-[10px] uppercase font-bold tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md group-hover:bg-blue-100 transition">
          Zmień
        </span>
      </button>

      <AndroidTimePickerModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        value={value || '09:00'}
        onChange={onChange}
        title={title || label || 'Wybierz godzinę'}
      />
    </div>
  );
};
