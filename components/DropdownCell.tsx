'use client';
import { useState, useRef, useEffect } from 'react';
import { Check, Plus, X, ChevronDown } from 'lucide-react';

interface Props {
  value: string;
  options: string[];
  field: string;
  onSave: (v: string) => void;
  onAddOption: (field: string, value: string) => void;
  className?: string;
  placeholder?: string;
}

export default function DropdownCell({ value, options, field, onSave, onAddOption, className = '', placeholder = '—' }: Props) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState('');
  const [filter, setFilter] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const newRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setAdding(false); setFilter('');
      }
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  useEffect(() => { if (adding) newRef.current?.focus(); }, [adding]);

  function select(v: string) { onSave(v); setOpen(false); setFilter(''); }

  function addNew() {
    const trimmed = newVal.trim();
    if (!trimmed) return;
    onAddOption(field, trimmed);
    onSave(trimmed);
    setNewVal('');
    setAdding(false);
    setOpen(false);
  }

  const filtered = options.filter((o) => o.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 w-full px-1 py-0.5 text-xs rounded hover:bg-white/60 text-left group"
      >
        <span className={`flex-1 truncate ${!value ? 'text-gray-300 italic' : ''}`}>
          {value || placeholder}
        </span>
        <ChevronDown className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-0.5 w-48 bg-white border border-gray-200 rounded shadow-lg">
          <div className="p-1 border-b border-gray-100">
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search…"
              className="w-full px-2 py-1 text-xs border border-gray-200 rounded outline-none"
            />
          </div>
          <ul className="max-h-40 overflow-y-auto py-0.5">
            {filtered.map((opt) => (
              <li key={opt}>
                <button
                  onClick={() => select(opt)}
                  className="flex items-center gap-2 w-full px-2 py-1 text-xs hover:bg-gray-50 text-left"
                >
                  <Check className={`h-3 w-3 shrink-0 ${value === opt ? 'text-blue-500' : 'opacity-0'}`} />
                  {opt}
                </button>
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
        </div>
      )}
    </div>
  );
}
