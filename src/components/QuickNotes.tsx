import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Edit2, X, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface Note {
  id: string;
  content: string;
  timestamp: number;
}

export function QuickNotes() {
  const [notes, setNotes] = useState<Note[]>(() => {
    try {
      const saved = localStorage.getItem('henosis_quick_notes');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isAdding, setIsAdding] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    localStorage.setItem('henosis_quick_notes', JSON.stringify(notes));
  }, [notes]);

  const handleAddNote = () => {
    if (!newNoteContent.trim()) return;
    const newNote: Note = {
      id: Date.now().toString(),
      content: newNoteContent.trim(),
      timestamp: Date.now()
    };
    setNotes([newNote, ...notes]);
    setNewNoteContent('');
    setIsAdding(false);
  };

  const handleDeleteNote = (id: string) => {
    setNotes(notes.filter(n => n.id !== id));
  };

  const handleSaveEdit = () => {
    if (!editContent.trim() || !editingId) return;
    setNotes(notes.map(n => n.id === editingId ? { ...n, content: editContent.trim(), timestamp: Date.now() } : n));
    setEditingId(null);
    setEditContent('');
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setEditContent(note.content);
  };

  return (
    <section className="glass p-6 rounded-xl flex flex-col h-[400px]">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-700 via-amber-500 to-yellow-600 dark:from-amber-200 dark:via-yellow-400 dark:to-amber-500 flex items-center gap-2">
          <Save className="w-5 h-5 text-yellow-500" /> Quick Notes
        </h3>
        {!isAdding && (
          <button 
            onClick={() => setIsAdding(true)}
            className="p-1.5 rounded-lg bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 dark:hover:text-yellow-900 border border-yellow-500/30 hover:bg-yellow-500 hover:text-white transition group"
            title="Thêm ghi chú"
          >
            <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
        <AnimatePresence mode="popLayout">
          {isAdding && (
            <motion.div
              initial={{ opacity: 0, height: 0, scale: 0.95 }}
              animate={{ opacity: 1, height: 'auto', scale: 1 }}
              exit={{ opacity: 0, height: 0, scale: 0.95 }}
              className="bg-white/60 dark:bg-black/40 backdrop-blur-md rounded-xl p-3 border border-yellow-500/40 shadow-inner"
            >
              <textarea
                autoFocus
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    handleAddNote();
                  }
                }}
                placeholder="Take a note... (Markdown supported)"
                className="w-full bg-transparent border-none outline-none resize-none text-sm min-h-[80px] text-stone-800 dark:text-stone-200 placeholder:text-stone-400"
              />
              <div className="flex justify-end gap-2 mt-2 border-t border-amber-500/10 pt-2">
                <button onClick={() => setIsAdding(false)} className="p-1.5 text-stone-500 hover:text-red-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
                <button onClick={handleAddNote} className="py-1 px-3 bg-yellow-500 text-stone-900 dark:text-yellow-900 font-bold text-xs rounded-lg shadow-md hover:bg-yellow-600 transition-colors flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Lưu (Ctrl+Enter)
                </button>
              </div>
            </motion.div>
          )}

          {notes.length === 0 && !isAdding && (
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               className="text-center opacity-60 py-8 text-sm italic border-2 border-dashed border-stone-300 dark:border-stone-700/50 rounded-xl"
             >
               Start jotting down quick ideas.
             </motion.div>
          )}

          {notes.map(note => (
            <motion.div
              key={note.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="group relative bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm rounded-xl p-3 shadow-sm border border-stone-200/50 dark:border-zinc-700/30 hover:border-amber-500/40 transition-colors"
            >
              {editingId === note.id ? (
                <div className="space-y-2">
                   <textarea
                    autoFocus
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        handleSaveEdit();
                      }
                    }}
                    className="w-full bg-stone-100/50 dark:bg-zinc-800/50 rounded-lg p-2 border-none outline-none resize-none text-sm min-h-[80px] text-stone-800 dark:text-stone-200 focus:ring-1 focus:ring-yellow-500/50"
                  />
                  <div className="flex justify-end gap-2 flex-wrap">
                    <button onClick={() => setEditingId(null)} className="p-1 px-2 text-xs font-bold text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 transition-colors">
                      Hủy
                    </button>
                    <button onClick={handleSaveEdit} className="py-1 px-3 bg-yellow-500 text-stone-900 dark:text-yellow-900 font-bold text-xs rounded-lg shadow hover:bg-yellow-600 transition-colors flex items-center gap-1">
                      Lưu thay đổi
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="pr-6 text-sm markdown-body !bg-transparent text-stone-800 dark:text-stone-200 leading-relaxed overflow-hidden">
                     <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{note.content}</ReactMarkdown>
                  </div>
                  <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(note)} className="p-1.5 bg-white/80 dark:bg-zinc-800/80 rounded-md shadow-sm border border-stone-200 dark:border-zinc-700 text-stone-500 hover:text-blue-500 block">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDeleteNote(note.id)} className="p-1.5 bg-white/80 dark:bg-zinc-800/80 rounded-md shadow-sm border border-stone-200 dark:border-zinc-700 text-stone-500 hover:text-red-500 block">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-[10px] opacity-40 mt-3 text-right font-mono font-medium">
                    {new Date(note.timestamp).toLocaleDateString('vi-VN')} {new Date(note.timestamp).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}
                  </div>
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
