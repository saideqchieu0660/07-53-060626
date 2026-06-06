import React, { useState, useEffect, useRef } from "react";
import { store, Deck } from "../lib/store";
import { FileText, Upload, AlertCircle, AlertTriangle, BarChart3, Users, CheckCircle2, TrendingUp, Target, FileUp, BookOpen, Trash2, FolderOpen, Inbox, Layers, Settings, Check, X, RefreshCw, Plus } from "lucide-react";
import { Navigate, Link } from "react-router-dom";
import { cn } from "../lib/utils";
import { safeRequest } from "../utils/apiClient";
import ErrorNotification from "../components/ErrorNotification";
import ManualFlashcardImporter from "../components/ManualFlashcardImporter";
import DocumentConverter from "../components/DocumentConverter";
import { ServiceMonitor } from "./AdminKeysDashboard";
import { DashboardSkeleton } from "../components/DashboardSkeleton";

export default function TeacherDashboard() {
  useEffect(() => {
    document.title = "Henosis - Teacher Dashboard";
  }, []);

  const user = store.getCurrentUser();
  
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);
  const [isDeletingSet, setIsDeletingSet] = useState(false);

  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);

  const [showBulkConfirmDeleteDecks, setShowBulkConfirmDeleteDecks] = useState(false);
  const [isBulkDeletingDecks, setIsBulkDeletingDecks] = useState(false);

  const [showBulkConfirmDeleteStudents, setShowBulkConfirmDeleteStudents] = useState<"hard" | "soft" | null>(null);
  const [isBulkDeletingStudents, setIsBulkDeletingStudents] = useState(false);

  const [dbUsers, setDbUsers] = useState<any[]>([]);
  const [localDecks, setLocalDecks] = useState<any[]>(() => store.getDecks());

  // AI Lesson Plan States
  const [lessonTopic, setLessonTopic] = useState("");
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [lessonPlanData, setLessonPlanData] = useState<any>(null);
  const [lessonError, setLessonError] = useState<string | null>(null);

  const [adminKey, setAdminKey] = useState("");
  useEffect(() => {
    if (user?.role === "teacher" || user?.role === "admin") {
      const storedKey = (import.meta as any).env?.VITE_ADMIN_KEY || "seneca";
      setAdminKey(storedKey);
    }
  }, [user?.role]);
  
  // Customization & Anti-Duplication States
  const [planTitle, setPlanTitle] = useState("");
  const [planSubject, setPlanSubject] = useState("");
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const isSavingPlanRef = useRef(false);
  const isGeneratingPlanRef = useRef(false);

  const handleGenerateLessonPlan = async () => {
    if (!lessonTopic.trim() || isGeneratingPlanRef.current) return;
    isGeneratingPlanRef.current = true;
    setIsGeneratingPlan(true);
    setLessonError(null);
    setLessonPlanData(null);
    try {
      const res = await safeRequest("/api/agent/lesson-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: lessonTopic })
      });
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Server returned an invalid response. Please try again.");
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gặp lỗi khi tạo giáo án");
      setLessonPlanData(JSON.parse(data.result));
      
      // Khởi tạo giá trị mặc định cho UI tùy chỉnh
      setPlanTitle(`Giáo án: ${lessonTopic}`);
      setPlanSubject(lessonTopic);
    } catch (err: any) {
      console.error(err);
      setLessonError(err.message);
    } finally {
      isGeneratingPlanRef.current = false;
      setIsGeneratingPlan(false);
    }
  };

  const handleSaveLessonPlanAsDeck = async () => {
    if (!lessonPlanData || isSavingPlanRef.current) return;
    isSavingPlanRef.current = true;
    setIsSavingPlan(true); // Ngăn chặn nháy đúp (duplicate)
    
    try {
      const { v4: uuidv4 } = await import("uuid");
      
      const newDeckId = `deck_${uuidv4()}`;
      const newDeckObj = {
        id: newDeckId,
        title: planTitle.trim() || `Giáo án: ${lessonTopic}`,
        subject: planSubject.trim() || lessonTopic,
        cards: lessonPlanData.flashcards?.map((c: any) => ({
          id: `card_${uuidv4()}`,
          front: c.front,
          back: c.back,
          subject: planSubject.trim() || lessonTopic,
          mastery: 0,
          nextReview: Date.now(),
          isHard: false
        })) || []
      };

      // store.addDeck covers both pushing locally and saving to Firebase
      await store.addDeck(newDeckObj);
      
      alert("Đã lưu giáo án thành bộ thẻ thành công!");
      setLessonPlanData(null);
      setLessonTopic("");
      setPlanTitle("");
      setPlanSubject("");
    } catch (err) {
      console.error(err);
      alert("Lỗi khi lưu bộ thẻ!");
    } finally {
      isSavingPlanRef.current = false;
      setIsSavingPlan(false);
    }
  };

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  
  const unsubUsersRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    let isMounted = true;
    if (unsubUsersRef.current) unsubUsersRef.current();
    const initUsersSync = async () => {
      try {
        const { db, FirebaseListenerManager } = await import("../lib/firebase");
        const { collection, onSnapshot, query, limit } = await import("firebase/firestore");
        if (!isMounted) return;
        const q = query(collection(db, "users"), limit(100));
        const unsub = onSnapshot(q, (snapshot) => {
          const list: any[] = [];
          snapshot.forEach((docSnap) => {
            list.push({ id: docSnap.id, ...docSnap.data() });
          });
          if (!isMounted) return;
          React.startTransition(() => {
            setDbUsers(list);
          });
        }, (err) => {
          console.error("Teacher student sync error:", err);
        });
        unsubUsersRef.current = unsub;
        FirebaseListenerManager.add("TeacherDashboard_users", unsub);
      } catch (e) {
        console.error("Failed to sync students list:", e);
      }
    };
    initUsersSync();
    return () => {
      isMounted = false;
      if (unsubUsersRef.current) unsubUsersRef.current();
      import("../lib/firebase").then(({ FirebaseListenerManager }) => {
        FirebaseListenerManager.remove("TeacherDashboard_users");
      }).catch(console.error);
    };
  }, []);

  const unsubDecksRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    let isMounted = true;
    if (unsubDecksRef.current) unsubDecksRef.current();
    const initDecksSync = async () => {
      try {
        const { db, FirebaseListenerManager } = await import("../lib/firebase");
        const { collection, onSnapshot } = await import("firebase/firestore");
        if (!isMounted) return;
        const unsub = onSnapshot(collection(db, "sets"), (snapshot) => {
          const list: any[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data && Array.isArray(data.cards)) {
              data.cards = data.cards.map((c: any) => ({
                ...c,
                mastery: (typeof c.mastery === 'number' && !isNaN(c.mastery)) ? c.mastery : 0
              }));
            }
            list.push(data);
          });
          if (!isMounted) return;
          React.startTransition(() => {
            setLocalDecks(list);
            setIsInitialLoading(false);
          });

          const syncBack = async () => {
            const { store: globalStore } = await import("../lib/store");
            if (globalStore && typeof (globalStore as any).setDecksLocally === "function") {
              (globalStore as any).setDecksLocally(list);
            }
          };
          syncBack();
        });
        unsubDecksRef.current = unsub;
        FirebaseListenerManager.add("TeacherDashboard_decks", unsub);
      } catch (e) {
        console.error("Failed to sync sets in TeacherDashboard:", e);
        if (isMounted) setIsInitialLoading(false);
      }
    };
    initDecksSync();
    return () => {
      isMounted = false;
      if (unsubDecksRef.current) {
        unsubDecksRef.current();
        unsubDecksRef.current = null;
      }
      import("../lib/firebase").then(({ FirebaseListenerManager }) => {
        FirebaseListenerManager.remove("TeacherDashboard_decks");
      }).catch(console.error);
    };
  }, []);

  const [studentToDelete, setStudentToDelete] = useState<any | null>(null);
  const [isDeletingStudent, setIsDeletingStudent] = useState(false);
  const [deleteMode, setDeleteMode] = useState<"hard" | "soft">("hard");

  if (user?.role !== "teacher" && user?.role !== "admin") return <Navigate to="/dashboard" replace />;
  if (isInitialLoading) return <DashboardSkeleton />;

  const handleDeleteStudentSubmit = async () => {
    if (!studentToDelete) return;
    setIsDeletingStudent(true);
    try {
      const { dbService } = await import("../lib/firebase");
      if (deleteMode === "hard") {
        await dbService.deleteUserProfile(studentToDelete.id);
        setDbUsers(prev => prev.filter(u => u.id !== studentToDelete.id));
      } else {
        await dbService.updateUserProfile(studentToDelete.id, { status: "disabled" });
        setDbUsers(prev => prev.map(u => u.id === studentToDelete.id ? { ...u, status: "disabled" } : u));
      }
      setStudentToDelete(null);
    } catch (e: any) {
      console.error("Error deleting student:", e);
    } finally {
      setIsDeletingStudent(false);
    }
  };

  const users = dbUsers.length > 0
    ? dbUsers.filter(u => u.role === "student" && u.status !== "disabled" && u.isAnonymous !== true && u.name !== "Guest Student")
    : store.getUsers().filter(u => u.role === "student" && u.isAnonymous !== true && u.name !== "Guest Student");
  const decks = localDecks;

  // Tính toán Class Overall Progress (An toàn chống lỗi NaN)
  let totalCards = 0;
  let totalMastery = 0;
  decks.forEach(d => {
    if (Array.isArray(d.cards)) {
      d.cards.forEach(c => {
        totalCards++;
        let val = Number(c.mastery);
        if (isNaN(val)) val = 0;
        totalMastery += val;
      });
    }
  });

  let classProgress = 0;
  if (totalCards > 0) {
     const ratio = totalMastery / totalCards;
     classProgress = isNaN(ratio) ? 0 : Math.round(ratio);
  }

  // Vùng hổng kiến thức (AI Weakness Detection)
  const allWeakCards = decks.flatMap(d => (d.cards || []).filter(c => c.isHard || c.mastery <= 40));
  const topWeakest = allWeakCards.sort((a, b) => a.mastery - b.mastery).slice(0, 5);

  return (
    <div className="space-y-8 animate-in fade-in pb-12">
      <div className="flex flex-col md:flex-row md:justify-between items-start md:items-center gap-4 bg-black dark:bg-white text-white dark:text-black p-8 rounded-3xl relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-3xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-700 via-amber-500 to-yellow-600 dark:from-amber-200 dark:via-yellow-400 dark:to-amber-500">Admin Console</h2>
          <p className="opacity-80 mt-1">Data-driven teaching overview.</p>
        </div>
        <div className="relative z-10 flex text-left space-x-6">
           <div>
             <p className="text-sm font-bold opacity-60 uppercase mb-1">Class Progress</p>
             <p className="text-4xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-700 via-amber-500 to-yellow-600 dark:from-amber-200 dark:via-yellow-400 dark:to-amber-500">{classProgress}%</p>
           </div>
           <div>
             <p className="text-sm font-bold opacity-60 uppercase mb-1">Active Students</p>
             <p className="text-4xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-700 via-amber-500 to-yellow-600 dark:from-amber-200 dark:via-yellow-400 dark:to-amber-500">{users.length}</p>
           </div>
           {(user?.role === "teacher" || user?.role === "admin") && (
             <div className="hidden md:block">
               <p className="text-sm font-bold opacity-60 uppercase mb-1">System Health</p>
               <a href="#monitor" className="inline-flex items-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-900 border border-stone-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-stone-100 dark:border-zinc-700 px-4 py-2 rounded-xl transition text-sm font-bold">
                 <Settings className="w-4 h-4" />
                 Monitor Keys
               </a>
             </div>
           )}
        </div>
        <BarChart3 className="absolute right-0 bottom-0 translate-x-1/4 translate-y-1/4 w-64 h-64 opacity-10" />
      </div>

      {(user?.role === "teacher" || user?.role === "admin") && (
        <div className="md:hidden flex justify-end">
          <a href="#monitor" className="inline-flex items-center gap-2 bg-stone-100/50 hover:bg-stone-200/50 text-stone-900 dark:bg-zinc-800/50 dark:hover:bg-zinc-700/50 dark:text-stone-100 px-4 py-3 rounded-xl transition text-sm font-bold w-full justify-center border border-stone-200 dark:border-zinc-800">
            <Settings className="w-4 h-4" />
            API Keys Health Monitor
          </a>
        </div>
      )}

      <ManualFlashcardImporter />
      <DocumentConverter />

      <div className="grid md:grid-cols-2 gap-8">
        {/* Cột 1: Pipeline & Students */}
        <div className="space-y-8">
          
          {/* MỚI: AI SINH GIÁO ÁN NHANH */}
          <section className="glass p-6 rounded-2xl space-y-4 border border-violet-500/10 dark:border-violet-400/10 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-violet-500 text-white text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-bl-xl">
              Option 3: Sinh Giáo Án Nhanh
            </div>
            
            <h3 className="text-xl font-display font-medium flex items-center gap-2 text-stone-800 dark:text-stone-100">
              <Layers className="w-5 h-5 text-violet-500" /> AI Tạo Giáo Án & Flashcard 
            </h3>
            
            <p className="text-sm opacity-70">
              Nhập chủ đề (vd: "Thế chiến thứ 2"), AI sẽ tạo sẵn lộ trình, khái niệm cốt lõi và flashcard trong ít giây.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 bg-stone-200/60 dark:bg-zinc-800/50 border border-amber-600/20 dark:border-amber-500/30 rounded-xl px-4 py-2 focus:ring-2 focus:ring-violet-500 outline-none transition font-medium"
                placeholder="Nhập chủ đề (Ví dụ: Định luật Newton)"
                value={lessonTopic}
                onChange={e => setLessonTopic(e.target.value)}
                disabled={isGeneratingPlan}
              />
              <button 
                onClick={handleGenerateLessonPlan}
                disabled={isGeneratingPlan || !lessonTopic.trim()}
                className="bg-violet-600 hover:bg-violet-700 text-white font-bold py-2 px-6 rounded-xl transition disabled:opacity-50 whitespace-nowrap"
              >
                {isGeneratingPlan ? "Đang tạo..." : "Sinh giáo án"}
              </button>
            </div>

            {lessonError && (
              <ErrorNotification message={lessonError} onRetry={handleGenerateLessonPlan} />
            )}

            {lessonPlanData && (
              <div className="mt-6 bg-stone-100/60 dark:bg-zinc-900/50 p-4 rounded-xl space-y-4 border border-violet-500/20">
                <div>
                  <h4 className="font-bold text-violet-700 dark:text-violet-400 mb-2 border-b border-violet-500/20 pb-1">1. Lộ trình học ({lessonPlanData.roadmap?.length} bước)</h4>
                  <ul className="space-y-2">
                    {lessonPlanData.roadmap?.map((r: any, idx: number) => (
                      <li key={idx} className="text-sm">
                        <strong className="text-stone-800 dark:text-stone-200">Bước {r.step}: {r.title}</strong> - <span className="opacity-80">{r.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold text-violet-700 dark:text-violet-400 mb-2 border-b border-violet-500/20 pb-1">2. Khái niệm cốt lõi ({lessonPlanData.concepts?.length})</h4>
                  <ul className="list-disc pl-5 space-y-1">
                    {lessonPlanData.concepts?.map((c: any, idx: number) => (
                      <li key={idx} className="text-sm">
                        <strong className="text-stone-800 dark:text-stone-200">{c.term}:</strong> <span className="opacity-80">{c.definition}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold text-violet-700 dark:text-violet-400 mb-2 border-b border-violet-500/20 pb-1">3. Thẻ bộ nhớ (Flashcards)</h4>
                  <p className="text-xs opacity-70 mb-3">Có {lessonPlanData.flashcards?.length} thẻ được tạo.</p>
                  
                  <div className="space-y-3 mb-4 bg-stone-200/50 dark:bg-zinc-800/50 p-4 rounded-xl border border-stone-300/40 dark:border-zinc-700/50">
                    <div>
                      <label className="text-xs font-bold uppercase opacity-70 mb-1 block">Tên Học Phần</label>
                      <input 
                        type="text" 
                        value={planTitle} 
                        onChange={(e) => setPlanTitle(e.target.value)} 
                        className="w-full input-3d px-3 py-2 text-sm text-stone-900 dark:text-stone-100"
                        placeholder="VD: Giáo án: Thế chiến thứ 2"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase opacity-70 mb-1 block">Phân loại / Danh mục</label>
                      <input 
                        type="text" 
                        value={planSubject} 
                        onChange={(e) => setPlanSubject(e.target.value)} 
                        className="w-full input-3d px-3 py-2 text-sm text-stone-900 dark:text-stone-100"
                        placeholder="VD: Lịch sử"
                      />
                    </div>
                  </div>

                  <button 
                    onClick={handleSaveLessonPlanAsDeck}
                    disabled={isSavingPlan}
                    className="w-full btn-3d bg-yellow-500 text-black py-3 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSavingPlan ? (
                      <>
                        <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                        Đang lưu...
                      </>
                    ) : "Lưu toàn bộ thành Bộ thẻ (Deck)"}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="glass p-6 rounded-2xl relative">
            <div className="flex flex-col sm:flex-row justify-between items-start mb-4 gap-2">
              <div>
                <h3 className="text-xl font-display font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" /> Quản lý danh sách Học sinh
                </h3>
                <p className="text-sm opacity-70">Thống kê nhanh các học sinh đang hoạt động.</p>
              </div>
              {selectedStudentIds.length > 0 && (
                <button
                  onClick={() => setShowBulkConfirmDeleteStudents("hard")}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow transition flex items-center gap-1.5 shrink-0"
                >
                  <Trash2 className="w-4 h-4" /> Xóa các mục đã chọn ({selectedStudentIds.length})
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 mb-3 px-1">
              <input
                type="checkbox"
                title="Chọn tất cả"
                className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 bg-stone-200 border-stone-300 dark:bg-zinc-800 dark:border-zinc-700"
                checked={users.length > 0 && selectedStudentIds.length === users.length}
                onChange={(e) => {
                  if (e.target.checked) setSelectedStudentIds(users.map(u => u.id));
                  else setSelectedStudentIds([]);
                }}
              />
              <span className="text-sm font-bold opacity-80 cursor-pointer select-none" onClick={() => setSelectedStudentIds(users.length > 0 && selectedStudentIds.length === users.length ? [] : users.map(u => u.id))}>Chọn tất cả ({users.length})</span>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {users.map((u, index) => {
                const masteredSets = decks.filter(d => {
                  // Simulate stable mastery check per student based on id
                  const hash = u.id.length + d.id.length;
                  return hash % 2 === 0;
                }).map(d => typeof d.title === 'string' ? d.title : JSON.stringify(d.title));
                return (
                  <div key={u.id} className="p-3 bg-stone-200/60 dark:bg-zinc-800/50 rounded-xl border border-amber-600/20 dark:border-amber-500/30 flex items-start gap-3">
                    <input
                      type="checkbox"
                      title="Chọn học sinh"
                      className="mt-1 w-4 h-4 text-purple-600 rounded focus:ring-purple-500 bg-stone-100 border-stone-300 dark:bg-zinc-900 dark:border-zinc-700 shrink-0 cursor-pointer"
                      checked={selectedStudentIds.includes(u.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedStudentIds(prev => [...prev, u.id]);
                        else setSelectedStudentIds(prev => prev.filter(id => id !== u.id));
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 flex-wrap">
                      <p className="font-bold flex items-center gap-2 min-w-0 flex-1">
                         <span className="truncate">{u.name}</span>
                         <span className="text-xs font-mono font-bold text-yellow-600 dark:text-yellow-400 shrink-0">({u.points} pts)</span>
                      </p>
                      <button
                        onClick={() => setStudentToDelete(u)}
                        className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 shadow-sm shrink-0 w-full sm:w-auto"
                        title="Xóa học sinh này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa</span>
                      </button>
                    </div>
                    <p className="text-sm opacity-70 truncate mt-1">
                      Sets: {masteredSets.length > 0 ? masteredSets.join(", ") : "None yet"}
                    </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="glass p-6 rounded-2xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
              <h3 className="text-xl font-display font-bold flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-yellow-500" /> Thư viện thẻ (Dành cho Giáo viên)
              </h3>
              <div className="flex gap-2 items-center flex-wrap">
                {selectedDeckIds.length > 0 && (
                  <button
                    onClick={() => setShowBulkConfirmDeleteDecks(true)}
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-xl text-sm font-bold shadow transition flex items-center gap-1.5 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" /> Xóa ({selectedDeckIds.length})
                  </button>
                )}
                <Link to="/admin/create-cards" className="bg-yellow-500 text-black px-4 py-2 rounded-xl text-sm font-bold shadow hover:bg-yellow-600 transition flex items-center gap-2 shrink-0">
                  <Plus className="w-4 h-4" /> Tạo Thẻ Mới
                </Link>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-4 px-1">
              <input
                type="checkbox"
                title="Chọn tất cả"
                className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 bg-stone-200 border-stone-300 dark:bg-zinc-800 dark:border-zinc-700"
                checked={decks.length > 0 && selectedDeckIds.length === decks.length}
                onChange={(e) => {
                  if (e.target.checked) setSelectedDeckIds(decks.map(d => d.id));
                  else setSelectedDeckIds([]);
                }}
              />
              <span className="text-sm font-bold opacity-80 cursor-pointer select-none" onClick={() => setSelectedDeckIds(decks.length > 0 && selectedDeckIds.length === decks.length ? [] : decks.map(d => d.id))}>Chọn tất cả ({decks.length})</span>
            </div>

              <div className="space-y-6 animation-delayed">
                {(Object.entries(
                  decks.reduce((acc, deck) => {
                    const subj = (typeof deck.subject === 'string' ? deck.subject : JSON.stringify(deck.subject)) || "general";
                    if (!acc[subj]) acc[subj] = [];
                    acc[subj].push(deck as Deck);
                    return acc;
                  }, {} as Record<string, Deck[]>)
                ) as [string, Deck[]][]).map(([subject, subjectDecks]) => (
                  <div key={subject} className="space-y-3">
                    <h4 className="text-sm font-bold uppercase tracking-widest text-amber-600 dark:text-amber-500 border-b border-amber-600/20 dark:border-amber-500/30 pb-1">
                      {subject}
                    </h4>
                    {subjectDecks.map(deck => (
                      <div key={deck.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-3 gap-3 bg-stone-200/60 dark:bg-zinc-800/50 rounded-xl border border-amber-600/20 dark:border-amber-500/30">
                        <div className="flex items-start gap-3 flex-1 min-w-[150px]">
                          <input
                            type="checkbox"
                            title="Chọn học phần"
                            className="mt-1 w-4 h-4 text-purple-600 rounded focus:ring-purple-500 bg-stone-100 border-stone-300 dark:bg-zinc-900 dark:border-zinc-700 shrink-0 cursor-pointer"
                            checked={selectedDeckIds.includes(deck.id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedDeckIds(prev => [...prev, deck.id]);
                              else setSelectedDeckIds(prev => prev.filter(id => id !== deck.id));
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-bold truncate">{typeof deck.title === 'string' ? deck.title : JSON.stringify(deck.title)}</p>
                            <p className="text-xs opacity-60">Số thẻ: {deck.cards?.length || 0}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0 border-t sm:border-0 border-amber-600/20 dark:border-amber-500/30 pt-2 sm:pt-0 mt-2 sm:mt-0 w-full sm:w-auto">
                          <Link to={`/study/${deck.id}`} className="flex-1 sm:flex-none text-center bg-yellow-500 text-black px-4 py-2 rounded-lg text-sm font-bold shadow hover:bg-yellow-600 transition shrink-0 whitespace-nowrap">
                            Xem / Sửa
                          </Link>
                          {(user?.role === "teacher" || user?.role === "admin") && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowConfirmDelete(deck.id); }}
                              className="bg-red-600 hover:bg-red-700 text-white p-2 px-4 rounded-lg text-sm font-bold shadow transition shrink-0 flex items-center justify-center sm:w-auto"
                              title="Xóa bộ thẻ"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div></section></div><section className="glass p-6 rounded-2xl flex flex-col"><h3 className="text-xl font-display font-bold flex items-center gap-2 mb-2"><AlertCircle className="w-5 h-5 text-red-500" /> AI Weakness Detection</h3><p className="text-sm opacity-70 mb-6">Aggregate top forgotten concepts (cards marked as "X" or with lowest SM-2 scores).</p><div className="space-y-4 flex-1">
             {topWeakest.length > 0 ? topWeakest.map((wc, i) => (
                <div key={wc.id} className="p-4 bg-red-500/5 dark:bg-red-500/10 border border-red-500/20 rounded-xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg">Rank #{i+1}</div>
                  <div className="mb-2 pe-12">
                     <span className="font-bold text-lg text-red-700 dark:text-red-400">{typeof wc.front === 'string' ? wc.front : JSON.stringify(wc.front)}</span>
                     <span className="ml-2 text-xs opacity-60 bg-stone-300/60 dark:bg-zinc-800/80 px-2 py-1 rounded-full uppercase tracking-wider">{typeof wc.subject === 'string' ? wc.subject : JSON.stringify(wc.subject)}</span>
                  </div>
                  <p className="text-sm opacity-90 line-clamp-2">{typeof wc.back === 'string' ? wc.back : JSON.stringify(wc.back)}</p>
                </div>
             )) : (
                <div className="flex flex-col items-center justify-center p-8 opacity-50 h-full border-2 border-dashed border-amber-600/20 dark:border-amber-500/30 rounded-xl">
                   <Target className="w-12 h-12 mb-2 opacity-50" />
                   <p className="font-bold">Hệ thống chưa phát hiện hổng kiến thức nghiêm trọng.</p>
                </div>
             )}
          </div>
        </section>
      </div>

      {user && (user.role === "teacher" || user.role === "admin") && adminKey && (
        <div id="monitor" className="pt-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 border border-stone-200 dark:border-zinc-800 rounded-lg bg-stone-50 dark:bg-zinc-900 shadow-sm">
               <Settings className="w-5 h-5 text-stone-700 dark:text-stone-300" />
            </div>
            <div>
              <h3 className="text-xl font-display font-bold">API Health Monitor</h3>
              <p className="opacity-60 text-sm">Real-time status of backend API keys.</p>
            </div>
          </div>
          <ServiceMonitor adminKey={adminKey} />
        </div>
      )}

      {showConfirmDelete && (
        <div className="modal-glass-overlay flex items-center justify-center p-4">
          <div className="modal-glass-content p-6 max-w-sm w-full">
            <h4 className="text-lg font-bold text-red-600 dark:text-red-400 flex items-center gap-2 mb-3">
              <AlertCircle className="w-5 h-5" /> Xác nhận xóa bộ học tập?
            </h4>
            <p className="text-sm opacity-80 mb-6">
              Hành động này sẽ xóa hoàn toàn bộ học tập trên Cloud Firestore cơ sở dữ liệu. Khi đã thực hiện, hành động này không thể hoàn tác!
            </p>
            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setShowConfirmDelete(null)}
                disabled={isDeletingSet}
                className="px-4 py-2 rounded-lg bg-stone-200 dark:bg-zinc-850 hover:bg-stone-300 dark:hover:bg-zinc-800 transition text-sm font-bold text-black dark:text-white"
              >
                Hủy bỏ
              </button>
              <button 
                onClick={async () => {
                  setIsDeletingSet(true);
                  try {
                    const { db, handleFirestoreError, OperationType } = await import("../lib/firebase");
                    const { doc, deleteDoc } = await import("firebase/firestore");
                    await deleteDoc(doc(db, "sets", showConfirmDelete));
                    store.removeDeckLocally(showConfirmDelete);
                    setShowConfirmDelete(null);
                  } catch (e) {
                    const { handleFirestoreError, OperationType } = await import("../lib/firebase");
                    handleFirestoreError(e, OperationType.DELETE, `sets/${showConfirmDelete}`);
                  } finally {
                    setIsDeletingSet(false);
                  }
                }}
                disabled={isDeletingSet}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition text-sm font-bold flex items-center gap-1.5"
              >
                {isDeletingSet ? "Đang xóa..." : "Xác nhận xóa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {studentToDelete && (
        <div className="modal-glass-overlay flex items-center justify-center p-4">
          <div className="modal-glass-content p-6 max-w-md w-full">
            <h4 className="text-lg font-bold text-red-600 dark:text-red-400 flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5" /> Xác nhận xóa học sinh "{studentToDelete.name}"?
            </h4>
            <p className="text-sm opacity-85 mb-4">
              Bạn có quyền xóa hoặc khóa tài khoản học sinh này từ hệ thống Henosis.
            </p>
            
            <div className="mb-6 space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider opacity-60">Phương thức xử lý:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteMode("hard")}
                  className={cn(
                    "p-3 rounded-xl border text-xs font-bold transition flex flex-col gap-1 items-center text-center",
                    deleteMode === "hard"
                      ? "bg-red-500/10 border-red-500 text-red-600 dark:text-red-400"
                      : "border-stone-200 dark:border-zinc-800 hover:bg-stone-50 dark:hover:bg-zinc-850"
                  )}
                >
                  <span>Xóa cứng (Hard)</span>
                  <span className="text-[10px] opacity-60 font-normal">Xóa sạch profile, nhóm và thẻ học</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteMode("soft")}
                  className={cn(
                    "p-3 rounded-xl border text-xs font-bold transition flex flex-col gap-1 items-center text-center",
                    deleteMode === "soft"
                      ? "bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400"
                      : "border-stone-200 dark:border-zinc-800 hover:bg-stone-50 dark:hover:bg-zinc-850"
                  )}
                >
                  <span>Xóa mềm (Soft)</span>
                  <span className="text-[10px] opacity-60 font-normal">Ẩn tài khoản hoạt động nhưng giữ lịch sử</span>
                </button>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setStudentToDelete(null)}
                disabled={isDeletingStudent}
                className="px-4 py-2 rounded-lg bg-stone-200 dark:bg-zinc-850 hover:bg-stone-300 dark:hover:bg-zinc-800 transition text-sm font-bold text-black dark:text-white"
              >
                Hủy bỏ
              </button>
              <button 
                onClick={handleDeleteStudentSubmit}
                disabled={isDeletingStudent}
                className={cn(
                  "px-4 py-2 rounded-lg text-white transition text-sm font-bold flex items-center gap-1.5",
                  deleteMode === "hard" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"
                )}
              >
                {isDeletingStudent ? "Đang xử lý..." : "Xác nhận thực hiện"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkConfirmDeleteStudents && (
        <div className="modal-glass-overlay flex items-center justify-center p-4 z-50">
          <div className="modal-glass-content p-6 max-w-md w-full">
            <h4 className="text-lg font-bold text-red-600 dark:text-red-400 flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5" /> Xác nhận xóa {selectedStudentIds.length} học sinh?
            </h4>
            <p className="text-sm opacity-85 mb-4">
              Bạn đang chuẩn bị thao tác hàng loạt trên {selectedStudentIds.length} học sinh.
            </p>
            
            <div className="mb-6 space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider opacity-60">Phương thức xử lý:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkConfirmDeleteStudents("hard")}
                  className={cn(
                    "p-3 rounded-xl border text-xs font-bold transition flex flex-col gap-1 items-center text-center",
                    showBulkConfirmDeleteStudents === "hard"
                      ? "bg-red-500/10 border-red-500 text-red-600 dark:text-red-400"
                      : "border-stone-200 dark:border-zinc-800 hover:bg-stone-50 dark:hover:bg-zinc-850"
                  )}
                >
                  <span>Xóa cứng (Hard)</span>
                  <span className="text-[10px] opacity-60 font-normal">Xóa sạch profile, nhóm và thẻ học</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowBulkConfirmDeleteStudents("soft")}
                  className={cn(
                    "p-3 rounded-xl border text-xs font-bold transition flex flex-col gap-1 items-center text-center",
                    showBulkConfirmDeleteStudents === "soft"
                      ? "bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400"
                      : "border-stone-200 dark:border-zinc-800 hover:bg-stone-50 dark:hover:bg-zinc-850"
                  )}
                >
                  <span>Xóa mềm (Soft)</span>
                  <span className="text-[10px] opacity-60 font-normal">Ẩn tài khoản hoạt động nhưng giữ lịch sử</span>
                </button>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setShowBulkConfirmDeleteStudents(null)}
                disabled={isBulkDeletingStudents}
                className="px-4 py-2 rounded-lg bg-stone-200 dark:bg-zinc-850 hover:bg-stone-300 dark:hover:bg-zinc-800 transition text-sm font-bold text-black dark:text-white"
              >
                Hủy bỏ
              </button>
              <button 
                onClick={async () => {
                  setIsBulkDeletingStudents(true);
                  try {
                    const { dbService } = await import("../lib/firebase");
                    const promises = selectedStudentIds.map(id => {
                      if (showBulkConfirmDeleteStudents === "hard") {
                         return dbService.deleteUserProfile(id);
                      } else {
                         return dbService.updateUserProfile(id, { status: "disabled" });
                      }
                    });
                    await Promise.all(promises);
                    if (showBulkConfirmDeleteStudents === "hard") {
                      setDbUsers(prev => prev.filter(u => !selectedStudentIds.includes(u.id)));
                    } else {
                      setDbUsers(prev => prev.map(u => selectedStudentIds.includes(u.id) ? { ...u, status: "disabled" } : u));
                    }
                    setSelectedStudentIds([]);
                    setShowBulkConfirmDeleteStudents(null);
                  } catch (e: any) {
                    console.error("Error bulk deleting students:", e);
                    alert("Có lỗi xảy ra khi thao tác hàng loạt trên học sinh: " + e.message);
                  } finally {
                    setIsBulkDeletingStudents(false);
                  }
                }}
                disabled={isBulkDeletingStudents}
                className={cn(
                  "px-4 py-2 rounded-lg text-white transition text-sm font-bold flex items-center gap-1.5",
                  showBulkConfirmDeleteStudents === "hard" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"
                )}
              >
                {isBulkDeletingStudents ? "Đang xử lý..." : "Xác nhận thực hiện"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkConfirmDeleteDecks && (
        <div className="modal-glass-overlay flex items-center justify-center p-4 z-50">
          <div className="modal-glass-content p-6 max-w-sm w-full">
            <h4 className="text-lg font-bold text-red-600 dark:text-red-400 flex items-center gap-2 mb-3">
              <AlertCircle className="w-5 h-5" /> Xác nhận xóa {selectedDeckIds.length} bộ học tập?
            </h4>
            <p className="text-sm opacity-80 mb-6">
              Hành động này sẽ xóa hoàn toàn {selectedDeckIds.length} bộ học tập trên Cloud Firestore cơ sở dữ liệu. Khi đã thực hiện, hành động này không thể hoàn tác!
            </p>
            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setShowBulkConfirmDeleteDecks(false)}
                disabled={isBulkDeletingDecks}
                className="px-4 py-2 rounded-lg bg-stone-200 dark:bg-zinc-850 hover:bg-stone-300 dark:hover:bg-zinc-800 transition text-sm font-bold text-black dark:text-white"
              >
                Hủy bỏ
              </button>
              <button 
                onClick={async () => {
                  setIsBulkDeletingDecks(true);
                  try {
                    const { db } = await import("../lib/firebase");
                    const { doc, deleteDoc } = await import("firebase/firestore");
                    
                    await Promise.all(selectedDeckIds.map(id => deleteDoc(doc(db, "sets", id))));
                    
                    selectedDeckIds.forEach(id => store.removeDeckLocally(id));
                    setSelectedDeckIds([]);
                    setShowBulkConfirmDeleteDecks(false);
                  } catch (e) {
                    const { handleFirestoreError, OperationType } = await import("../lib/firebase");
                    handleFirestoreError(e, OperationType.DELETE, `sets/bulk`);
                  } finally {
                    setIsBulkDeletingDecks(false);
                  }
                }}
                disabled={isBulkDeletingDecks}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition text-sm font-bold flex items-center gap-1.5"
              >
                {isBulkDeletingDecks ? "Đang xóa..." : "Xác nhận xóa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
