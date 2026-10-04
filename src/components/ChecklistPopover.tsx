import React, { useState, useRef, useEffect } from 'react';
import { Filter, CheckSquare, Square, ChevronDown, Check, X } from 'lucide-react';

export interface ChecklistOption {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  color?: string;
}

interface ChecklistPopoverProps {
  label: string;
  items: ChecklistOption[];
  selectedIds: string[];
  allId?: string;
  onToggleId: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  triggerId?: string;
  className?: string;
  align?: 'left' | 'right' | 'auto';
}

export const ChecklistPopover: React.FC<ChecklistPopoverProps> = ({
  label,
  items,
  selectedIds,
  allId,
  onToggleId,
  onSelectAll,
  onClearAll,
  triggerId,
  className = '',
  align = 'auto',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  // Compute best alignment and width to keep dropdown strictly within screen on mobile and desktop
  useEffect(() => {
    if (!isOpen || !popoverRef.current) return;

    const calculatePosition = () => {
      if (!popoverRef.current) return;
      const rect = popoverRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (viewportWidth < 640) {
        // On mobile devices, use fixed full-width responsive positioning with safe margins
        // Place just below trigger if space allows, otherwise anchor safely above or near top
        const spaceBelow = viewportHeight - rect.bottom;
        const top = spaceBelow > 260 ? rect.bottom + 6 : Math.max(12, rect.top - 280);

        setPopoverStyle({
          position: 'fixed',
          top: `${Math.max(12, Math.min(top, viewportHeight - 320))}px`,
          left: '10px',
          right: '10px',
          width: 'auto',
          maxWidth: 'calc(100vw - 20px)',
          margin: 0,
          zIndex: 9999,
        });
      } else {
        const shouldAlignRight =
          align === 'right' || rect.left + 320 > viewportWidth - 24;
        if (shouldAlignRight) {
          setPopoverStyle({
            position: 'absolute',
            top: '100%',
            right: 0,
            left: 'auto',
            width: '20rem',
            maxWidth: 'calc(100vw - 32px)',
            marginTop: '6px',
            zIndex: 50,
          });
        } else {
          setPopoverStyle({
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 'auto',
            width: '20rem',
            maxWidth: 'calc(100vw - 32px)',
            marginTop: '6px',
            zIndex: 50,
          });
        }
      }
    };

    calculatePosition();
    window.addEventListener('resize', calculatePosition);
    window.addEventListener('scroll', calculatePosition, true);
    return () => {
      window.removeEventListener('resize', calculatePosition);
      window.removeEventListener('scroll', calculatePosition, true);
    };
  }, [isOpen, align]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const isAllExplicitlySelected =
    (allId && selectedIds.includes(allId)) ||
    (items.length > 0 && items.every((item) => selectedIds.includes(item.id)));

  const activeCount = isAllExplicitlySelected
    ? items.length
    : items.filter((item) => selectedIds.includes(item.id)).length;

  return (
    <div ref={popoverRef} className={`relative inline-block text-left ${className}`}>
      <button
        id={triggerId}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`inline-flex items-center space-x-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer shadow-2xs ${
          isOpen
            ? 'bg-blue-50 text-blue-700 border-blue-300 ring-2 ring-blue-100'
            : activeCount > 0
            ? 'bg-white text-neutral-800 border-neutral-300 hover:bg-neutral-50 hover:border-neutral-400'
            : 'bg-neutral-50 text-neutral-500 border-neutral-250 hover:bg-white'
        }`}
        title={`Filtruj ${label.toLowerCase()} za pomocą checkboxów`}
      >
        <Filter className="w-3.5 h-3.5 text-neutral-500" />
        <span>{label}</span>
        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-neutral-200/80 text-neutral-800">
          {isAllExplicitlySelected ? 'Wszystkie' : `${activeCount}/${items.length}`}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <>
          {/* Mobile backdrop for instant dismiss and to prevent background interaction */}
          <div
            className="fixed inset-0 bg-black/20 z-[9998] sm:hidden transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          <div
            style={popoverStyle}
            className="bg-white rounded-xl shadow-xl border border-neutral-200 z-[9999] sm:z-50 p-2.5 space-y-2 animate-in fade-in zoom-in-95 duration-100"
          >
            {/* Header & Batch toggles */}
            <div className="flex items-center justify-between border-b border-neutral-150 pb-2">
              <div className="text-xs font-bold text-neutral-900">
                Wybór: {label}
              </div>
              <div className="flex items-center space-x-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={onSelectAll}
                  className="text-blue-600 hover:text-blue-800 font-medium hover:underline cursor-pointer"
                >
                  Wszystkie
                </button>
                <span className="text-neutral-300">|</span>
                <button
                  type="button"
                  onClick={onClearAll}
                  className="text-neutral-500 hover:text-neutral-800 font-medium hover:underline cursor-pointer"
                >
                  Wyczyść
                </button>
              </div>
            </div>

            {/* Items list with checkboxes */}
            <div className="max-h-60 sm:max-h-72 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {items.length === 0 ? (
                <p className="text-xs text-neutral-400 py-3 text-center">
                  Brak elementów do wyświetlenia
                </p>
              ) : (
                items.map((item) => {
                  const isSelected =
                    isAllExplicitlySelected || selectedIds.includes(item.id);

                  // Clean any legacy system suffixes from title
                  const displayTitle = item.title
                    ? item.title
                        .replace(/\s*[([](?:główny|glowny|primary)[)\]]/gi, '')
                        .replace(/\s*-\s*(?:główny|glowny|primary)/gi, '')
                        .replace(/\s*[([](?:wyjazdy|wyjazd)[)\]]/gi, '')
                        .replace(/\s*-\s*(?:wyjazdy|wyjazd)/gi, '')
                        .trim() || item.title
                    : item.title;

                  // Never show legacy system badges
                  const shouldShowBadge =
                    item.badge &&
                    !/^(?:główny|glowny|primary|wyjazdy|wyjazd)$/i.test(item.badge.trim());

                  return (
                    <label
                      key={item.id}
                      onClick={(e) => {
                        e.preventDefault();
                        onToggleId(item.id);
                      }}
                      className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer select-none transition-colors ${
                        isSelected
                          ? 'bg-blue-50/70 text-neutral-900 font-medium hover:bg-blue-100/70'
                          : 'text-neutral-600 hover:bg-neutral-100'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0 pr-2 flex-1">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
                            isSelected
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-neutral-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>

                        {item.color && (
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                            style={{ backgroundColor: item.color }}
                          />
                        )}

                        <span className="truncate flex-1" title={displayTitle}>
                          {displayTitle}
                        </span>
                      </div>

                      {shouldShowBadge && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-neutral-200/70 text-neutral-700 font-medium">
                          {item.badge}
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>

            {/* Footer status */}
            <div className="pt-2 border-t border-neutral-150 flex items-center justify-between text-[11px] text-neutral-500">
              <span>
                Zaznaczono: <strong>{activeCount}</strong> z {items.length}
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-neutral-700 hover:text-neutral-900 font-medium hover:underline cursor-pointer"
              >
                Zamknij
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
