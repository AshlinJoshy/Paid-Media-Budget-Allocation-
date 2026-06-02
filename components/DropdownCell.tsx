'use client';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, X, ChevronDown, Trash2 } from 'lucide-react';

interface Props {
  value: string;
  options: string[];
  field: string;
  onSave: (v: string) => void;
  onAddOption: (field: string, value: string) => void;
  onDeleteOption?: (field: string, value: string) => void;
  className?: string;
  placeholder?: string;
  chipClassName?: string;
}

export default function DropdownCell({
  value, options, field, onSave, onAddOption, onDeleteOption,
  className = '', placeholder = '—', chipClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState('');
  const [filter, setFilter] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const newRef = useRef<HTMLInputElement>(null);

  // Compute popup position relative to viewport when opening, and on scroll/resize
  // while open. The popup is portaled to body, so we need explicit fixed coords.
  useEffect(() => {
    if (!open) { setPopupPos(null); return; }
    function reposition() {
      const btn = buttonRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setPopupPos({ top: r.bottom + 2, left: r.left, width: Math.max(224, r.width) });
    }
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  // Outside click: now needs to allow clicks INSIDE the portaled popup, which
  // is no longer a child of the trigger button. Check both refs.
  useEffect(() => {
    function outside(e: MouseEvent) {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (popupRef.current?.contains(t)) return;
      setOpen(false); setAdding(false); setFilter(''); setPendingDelete(null);
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  useEffect(() => { if (adding) newRef.current?.focus(); }, [adding]);

  function select(v: string) { onSave(v); setOpen(false); setFilter(''); setPendingDelete(null); }
  function clear() { onSave(''); setOpen(false); setFilter(''); setPendingDelete(null); }

  function addNew() {
    const trimmed = newVal.trim();
    if (!trimmed) return;
    onAddOption(field, trimmed);
    onSave(trimmed);
    setNewVal('');
    setAdding(false);
    setOpen(false);
  }

  function confirmDelete(v: string) {
    if (pendingDelete === v && onDeleteOption) {
      onDeleteOption(field, v);
      setPendingDelete(null);
    } else {
      setPendingDelete(v);
    }
  }

  const filtered = options.filter((o) => o.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 w-full px-1 py-0.5 text-xs rounded hover:bg-white/60 text-left transition-colors duration-150"
      >
        <span className="flex-1 truncate min-w-0">
          {value ? (
            chipClassName ? (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${chipClassName}`}>
                {value}
              </span>
            ) : (
              value
            )
          ) : (
            <span className="text-gray-300 italic opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
              {placeholder}
            </span>
          )}
        </span>
        <ChevronDown className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity duration-150" />
      </button>

      {open && popupPos && typeof document !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          className="fixed z-[1000] bg-white border border-gray-200 rounded shadow-lg"
          style={{ top: popupPos.top, left: popupPos.left, width: popupPos.width }}
        >
          <div className="p-1 border-b border-gray-100">
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search…"
              className="w-full px-2 py-1 text-xs border border-gray-200 rounded outline-none"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-0.5">
            {value && (
              <li>
                <button
                  onClick={clear}
                  className="flex items-center gap-2 w-full px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 text-left"
                >
                  <X className="h-3 w-3" />
                  Clear selection
                </button>
              </li>
            )}
            {filtered.map((opt) => (
              <li key={opt} className="group/opt flex items-center hover:bg-gray-50">
                <button
                  onClick={() => select(opt)}
                  className="flex items-center gap-2 flex-1 min-w-0 px-2 py-1 text-xs text-left"
                >
                  <Check className={`h-3 w-3 shrink-0 ${value === opt ? 'text-blue-500' : 'opacity-0'}`} />
                  <span className="truncate">{opt}</span>
                </button>
                {onDeleteOption && (
                  <button
                    onClick={(e) => { e.stopPropagation(); confirmDelete(opt); }}
                    className={`px-1.5 py-1 transition-opacity duration-150 ${pendingDelete === opt ? 'opacity-100 text-red-500' : 'opacity-0 group-hover/opt:opacity-100 text-gray-300 hover:text-red-500'}`}
                    title={pendingDelete === opt ? 'Click again to confirm' : 'Delete option'}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-2 py-1 text-xs text-gray-400 italic">No match</li>
            )}
          </ul>
          <div className="border-t border-gray-100 p-1">
            {adding ? (
              <div className="flex gap-1">
                <input
                  ref={newRef}
                  value={newVal}
                  onChange={(e) => setNewVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addNew(); if (e.key === 'Escape') setAdding(false); }}
                  placeholder="New option…"
                  className="flex-1 px-1 py-0.5 text-xs border border-gray-200 rounded outline-none"
                />
                <button onClick={addNew} className="text-green-600 hover:text-green-700"><Check className="h-3.5 w-3.5" /></button>
                <button onClick={() => setAdding(false)} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="flex items-center gap-1 w-full px-1 py-0.5 text-xs text-blue-500 hover:text-blue-700"
              >
                <Plus className="h-3 w-3" /> Add option
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
