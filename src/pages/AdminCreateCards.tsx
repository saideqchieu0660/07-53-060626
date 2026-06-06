import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Save, Trash2, ChevronLeft, Layers, Type, Speech, BookOpen, BrainCircuit, Edit3 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { v4 as uuidv4 } from "uuid";
import { store, Flashcard, Deck } from "../lib/store";
import { db } from "../lib/firebase";
import { doc, setDoc, updateDoc, arrayUnion, getDoc } from "firebase/firestore";

export default function AdminCreateCards() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(store.getCurrentUser());
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [decks, setDecks] = useState<Deck[]>(store.getDecks());

  // Deck Management State
  const [selectedDeckId, setSelectedDeckId] = useState<string>("new");
  const [newDeckTitle, setNewDeckTitle] = useState("");
  const [newDeckSubject, setNewDeckSubject] = useState("");
  
  // Card Builder State
  const [front, setFront] = useState("");
  const [wordForm, setWordForm] = useState("");
  const [back, setBack] = useState("");
  
  // local batch
  const [batchCards, setBatchCards] = useState<Flashcard[]>([]);
  const [editingBatchCardId, setEditingBatchCardId] = useState<string | null>(null);

  const handleUpdateBatchCard = (id: string, field: keyof Flashcard, value: string) => {
    setBatchCards(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };
  
  // UI States
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const frontInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const user = store.getCurrentUser();
    if (!user || (user.role !== "teacher" && user.role !== "admin")) {
      navigate("/dashboard");
    } else {
      setIsAuthorized(true);
      setCurrentUser(user);
    }
  }, [navigate]);

  if (!isAuthorized) return null;

  const handleAddCardToBatch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!front.trim() || !back.trim()) return;

    const baseSubject = selectedDeckId === "new" ? newDeckSubject || "general" : decks.find(d => d.id === selectedDeckId)?.subject || "general";
    
    const newCard: Flashcard = {
      id: `card_${uuidv4()}`,
      front: front.trim(),
      back: back.trim(),
      subject: baseSubject,
      mastery: 0,
      nextReview: Date.now(),
      isHard: false,
      repetitionCount: 0,
      easeFactor: 2.5,
      interval: 0,
      isNewCard: true
    };
    
    if (wordForm.trim()) {
        newCard.wordForm = wordForm.trim();
    }

    setBatchCards(prev => [...prev, newCard]);
    
    // Clear form for quick add
    setFront("");
    setWordForm("");
    setBack("");
    
    // Focus back to front input
    frontInputRef.current?.focus();
  };

  const handleRemoveFromBatch = (indexId: string) => {
    setBatchCards(prev => prev.filter(c => c.id !== indexId));
  };

  const handleBulkSave = async () => {
    if (batchCards.length === 0) return;
    
    // Validate New Deck if selected
    if (selectedDeckId === "new" && !newDeckTitle.trim()) {
      alert("Vui lòng nhập tên Bộ bài mới!");
      return;
    }

    setIsSaving(true);
    setSuccessMsg("");

    try {
      if (selectedDeckId === "new") {
         const newDeckId = `deck_${uuidv4()}`;
         const newDeck: Deck = {
           id: newDeckId,
           title: newDeckTitle.trim(),
           subject: newDeckSubject.trim() || "general",
           cards: batchCards
         };
         
         await setDoc(doc(db, "sets", newDeckId), newDeck);
         
         // Update local store
         store.addDeck(newDeck);
         setDecks(store.getDecks());
         setSelectedDeckId(newDeckId);
         setNewDeckTitle("");
         setNewDeckSubject("");
      } else {
         const deckRef = doc(db, "sets", selectedDeckId);
         await updateDoc(deckRef, {
             cards: arrayUnion(...batchCards)
         });
         
         // Fetch and update local store
         const snap = await getDoc(deckRef);
         if (snap.exists()) {
             const updatedDeck = snap.data() as Deck;
             const existingIdx = decks.findIndex(d => d.id === selectedDeckId);
             if (existingIdx !== -1) {
                 store.setDecksLocally([
                     ...decks.slice(0, existingIdx),
                     {...decks[existingIdx], cards: updatedDeck.cards},
                     ...decks.slice(existingIdx + 1)
                 ]);
                 setDecks(store.getDecks());
             }
         }
      }

      setSuccessMsg(`Đã lưu thành công ${batchCards.length} thẻ vào bộ bài!`);
      setBatchCards([]);
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      console.error("Save Card Error Details:", err);
      alert(`Có lỗi xảy ra khi lưu thẻ: ${err.message || "Lỗi không xác định"}. Vui lòng thử lại!`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-8 duration-500 mt-8">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-stone-800 dark:text-stone-100 flex items-center gap-3">
             <BrainCircuit className="w-8 h-8 text-yellow-500" />
             Tạo Thẻ Học Chuyên Sâu
          </h1>
          <p className="text-stone-500 dark:text-stone-400 mt-1 flex items-center gap-2">
             <span className="uppercase text-xs font-bold tracking-widest text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">Admin Route</span>
             Quản lý thư viện thẻ học tập trung
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 rounded-2xl font-medium flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-4">
           <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
           {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        
        {/* LEFT COLUMN: Deck & Card Builder */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Deck Selection Layer */}
          <div className="glass p-6 md:p-8 rounded-3xl border border-stone-200 dark:border-zinc-800 shadow-sm relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 relative z-10">
               <Layers className="w-5 h-5 text-blue-500" />
               Bộ bài đích
            </h2>
            
            <div className="space-y-4 relative z-10">
               <select 
                 className="w-full p-4 bg-white/60 dark:bg-zinc-900/60 border border-stone-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition font-medium appearance-none"
                 value={selectedDeckId}
                 onChange={(e) => setSelectedDeckId(e.target.value)}
               >
                 <option value="new">+ Tạo bộ bài mới (Tạo New Deck)</option>
                 <optgroup label="Bộ bài hiện có">
                    {decks.map(d => (
                       <option key={d.id} value={d.id}>{d.title} ({d.cards?.length || 0} thẻ)</option>
                    ))}
                 </optgroup>
               </select>

               {selectedDeckId === "new" && (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in zoom-in duration-300">
                    <input 
                      type="text"
                      placeholder="Tên bộ bài (VD: 3000 Từ Vựng Toeic)" 
                      className="p-4 bg-stone-100/50 dark:bg-zinc-800/50 border border-stone-200 dark:border-zinc-700 rounded-xl outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-zinc-900 transition"
                      value={newDeckTitle}
                      onChange={e => setNewDeckTitle(e.target.value)}
                    />
                    <input 
                      type="text"
                      placeholder="Danh mục (VD: Tiếng Anh)" 
                      className="p-4 bg-stone-100/50 dark:bg-zinc-800/50 border border-stone-200 dark:border-zinc-700 rounded-xl outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-zinc-900 transition"
                      value={newDeckSubject}
                      onChange={e => setNewDeckSubject(e.target.value)}
                    />
                 </div>
               )}
            </div>
          </div>

          {/* Card Builder Layer */}
          <div className="glass p-6 md:p-8 rounded-3xl border border-stone-200 dark:border-zinc-800 shadow-lg relative">
             <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-yellow-400/10 blur-3xl rounded-full" />
             <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Plus className="w-6 h-6 text-yellow-600 dark:text-yellow-500" />
                Thêm thông tin Thẻ
             </h2>

             <form onSubmit={handleAddCardToBatch} className="space-y-5">
                <div className="space-y-1.5">
                   <label className="text-xs font-bold uppercase tracking-widest opacity-60 flex items-center gap-2">
                      <Type className="w-3.5 h-3.5" /> Mặt trước (Từ / Khái niệm)
                   </label>
                   <input 
                      ref={frontInputRef}
                      type="text"
                      className="w-full text-lg p-5 bg-white/70 dark:bg-black/40 border border-stone-200 dark:border-zinc-700 shadow-inner rounded-xl outline-none focus:ring-2 focus:ring-yellow-500/50 transition font-medium"
                      placeholder="Nhập từ vựng, câu hỏi..."
                      value={front}
                      onChange={e => setFront(e.target.value)}
                      required
                   />
                </div>

                <div className="space-y-1.5">
                   <label className="text-xs font-bold uppercase tracking-widest opacity-60 flex items-center gap-2">
                      <Speech className="w-3.5 h-3.5" /> Từ loại / Phát âm (Không bắt buộc)
                   </label>
                   <input 
                      type="text"
                      className="w-full p-4 bg-stone-100/50 dark:bg-zinc-800/50 border border-stone-200 dark:border-zinc-700 rounded-xl outline-none focus:border-yellow-500 transition text-sm font-mono"
                      placeholder="VD: Noun, Verb, /'stʌdi/..."
                      value={wordForm}
                      onChange={e => setWordForm(e.target.value)}
                   />
                </div>

                <div className="space-y-1.5">
                   <label className="text-xs font-bold uppercase tracking-widest opacity-60 flex items-center gap-2">
                      <BookOpen className="w-3.5 h-3.5" /> Mặt sau (Nghĩa / Lời giải)
                   </label>
                   <textarea 
                      rows={4}
                      className="w-full p-5 bg-white/70 dark:bg-black/40 border border-stone-200 dark:border-zinc-700 shadow-inner rounded-xl outline-none focus:ring-2 focus:ring-yellow-500/50 transition resize-none leading-relaxed"
                      placeholder="Giải thích chi tiết, ý nghĩa, ví dụ tiếng Việt..."
                      value={back}
                      onChange={e => setBack(e.target.value)}
                      required
                      onKeyDown={(e) => {
                         if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleAddCardToBatch();
                         }
                      }}
                   />
                </div>

                <div className="pt-2 flex justify-end">
                   <button 
                     type="submit"
                     disabled={!front.trim() || !back.trim()}
                     className="px-6 py-3 bg-stone-800 hover:bg-black dark:bg-white dark:hover:bg-stone-200 text-white dark:text-black font-bold rounded-xl transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-95 duration-200"
                   >
                      Thêm vào Batch <kbd className="hidden sm:inline-block ml-2 px-2 py-0.5 bg-white/20 dark:bg-black/20 rounded font-mono text-xs shadow-sm">Enter</kbd>
                   </button>
                </div>
             </form>
          </div>
        </div>

        {/* RIGHT COLUMN: Batch Preview & Bulk Submission */}
        <div className="lg:col-span-5 h-full">
           <div className="glass p-6 rounded-3xl border border-stone-200 dark:border-zinc-800 flex flex-col h-full sticky top-28 shadow-sm">
              <div className="flex items-center justify-between mx-2 mb-4">
                 <h3 className="font-bold text-lg">Danh sách chờ lưu</h3>
                 <div className="px-3 py-1 bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 font-bold rounded-full text-sm flex items-center gap-2">
                    {batchCards.length} Thẻ
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto mb-6 pr-2 space-y-3 min-h-[300px] max-h-[500px]">
                 <AnimatePresence>
                    {batchCards.length === 0 ? (
                       <motion.div initial={{opacity: 0}} animate={{opacity: 1}} className="h-full flex flex-col items-center justify-center opacity-30 p-8 text-center">
                          <Layers className="w-12 h-12 mb-4 opacity-50" />
                          <p>Chưa có thẻ nào trong Batch.</p>
                          <p className="text-xs mt-2">Hãy điều thông tin ở form bên trái.</p>
                       </motion.div>
                    ) : (
                       batchCards.map((card, idx) => (
                          <motion.div 
                             key={card.id}
                             initial={{ opacity: 0, x: 20 }}
                             animate={{ opacity: 1, x: 0 }}
                             exit={{ opacity: 0, scale: 0.9 }}
                             className="p-4 bg-white/50 dark:bg-zinc-900/50 border border-stone-200 dark:border-zinc-800 rounded-2xl group flex flex-col gap-3"
                          >
                             {editingBatchCardId === card.id ? (
                                <div className="space-y-2 w-full animate-in fade-in zoom-in-95 duration-200">
                                    <input 
                                      className="w-full text-sm p-3 bg-white dark:bg-zinc-950 border border-stone-200/50 dark:border-zinc-700/50 shadow-inner rounded-lg outline-none focus:ring-1 focus:ring-amber-500 transition" 
                                      value={card.front}
                                      onChange={(e) => handleUpdateBatchCard(card.id, 'front', e.target.value)}
                                      placeholder="Mặt trước (Từ / Khái niệm)"
                                    />
                                    <input 
                                      className="w-full text-xs p-3 bg-white dark:bg-zinc-950 border border-stone-200/50 dark:border-zinc-700/50 shadow-inner rounded-lg outline-none focus:ring-1 focus:ring-amber-500 transition font-mono" 
                                      value={card.wordForm || ""}
                                      onChange={(e) => handleUpdateBatchCard(card.id, 'wordForm', e.target.value)}
                                      placeholder="Từ loại / Phát âm"
                                    />
                                    <textarea 
                                      className="w-full text-sm p-3 bg-white dark:bg-zinc-950 border border-stone-200/50 dark:border-zinc-700/50 shadow-inner rounded-lg outline-none focus:ring-1 focus:ring-amber-500 transition resize-none leading-relaxed" 
                                      value={card.back}
                                      onChange={(e) => handleUpdateBatchCard(card.id, 'back', e.target.value)}
                                      placeholder="Mặt sau (Nghĩa / Lời giải)"
                                      rows={3}
                                    />
                                    <div className="flex justify-end mt-2">
                                       <button 
                                         onClick={() => setEditingBatchCardId(null)}
                                         className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition shadow-sm active:scale-95"
                                       >
                                         Lưu Thay Đổi Thẻ
                                       </button>
                                    </div>
                                </div>
                             ) : (
                               <div className="flex justify-between items-start gap-3 w-full">
                                 <div className="flex-1 min-w-0">
                                    <div className="text-xs font-bold opacity-40 mb-1"># {idx + 1}</div>
                                    <h4 className="font-bold line-clamp-1 text-sm">{card.front} {card.wordForm && <span className="opacity-50 font-normal italic">({card.wordForm})</span>}</h4>
                                    <p className="text-xs opacity-70 line-clamp-2 mt-1">{card.back}</p>
                                 </div>
                                 <div className="flex flex-col gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                                    <button 
                                      onClick={() => setEditingBatchCardId(card.id)}
                                      className="p-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-500 hover:bg-amber-500 hover:text-white rounded-lg transition flex items-center justify-center transform active:scale-95"
                                      title="Sửa thẻ"
                                    >
                                       <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button 
                                      onClick={() => handleRemoveFromBatch(card.id)}
                                      className="p-1.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition flex items-center justify-center transform active:scale-95"
                                      title="Xóa thẻ"
                                    >
                                       <Trash2 className="w-4 h-4" />
                                    </button>
                                 </div>
                               </div>
                             )}
                          </motion.div>
                       ))
                    )}
                 </AnimatePresence>
              </div>

              <button 
                onClick={handleBulkSave}
                disabled={batchCards.length === 0 || isSaving}
                className="w-full btn-3d btn-3d-primary py-4 text-lg font-bold flex justify-center items-center gap-3 disabled:opacity-50 disabled:grayscale transition cursor-pointer"
              >
                 {isSaving ? (
                    <div className="flex gap-2 items-center">
                       <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                       Đang đồng bộ DB...
                    </div>
                 ) : (
                    <>
                       <Save className="w-6 h-6" /> Lưu toàn bộ lên Cloud
                    </>
                 )}
              </button>
           </div>
        </div>

      </div>
    </div>
  );
}
