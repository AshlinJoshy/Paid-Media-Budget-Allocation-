'use client';
import { useState, useRef, useEffect } from 'react';

interface Props {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  placeholder?: string;
  type?: 'text' | 'date' | 'number';
  prefix?: string;
}

export default function EditableCell({ value, onSave, className = '', placeholder = '—', type = 'text', prefix }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function commit() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') { setDraft(value); setEditing(false); }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        type={type}
        className={`w-full px-1 py-0.5 text-xs border border-blue-400 rounded outline-none bg-white ${className}`}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={`block w-full px-1 py-0.5 text-xs cursor-text rounded hover:bg-white/60 truncate ${!value ? 'text-gray-300' : ''} ${className}`}
      title={value || placeholder}
    >
      {prefix && value ? <span className="text-gray-400">{prefix}</span> : null}
      {value || <span className="text-gray-300 italic text-[11px]">{placeholder}</span>}
    </span>
  );
}
