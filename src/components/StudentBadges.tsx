import React, { useState, useEffect, useRef } from 'react';
import { Award, Zap, Star, Shield, Cpu, Book, Flame, Calendar, Clock, Lock, Sparkles, CheckCircle2, X, Download } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils.js';
import { triggerCelebration } from '../lib/celebration.js';
import { toPng } from 'html-to-image';

const BADGES = [
  { id: 'novice', name: 'Tân Binh', desc: 'Đạt 50 Mastery', req: 50, icon: Book, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/30', gradient: 'from-blue-500/20 to-blue-400/5', type: 'points' as const, span: 'col-span-1 min-h-[180px]' },
  { id: 'early_bird', name: 'Chăm Chỉ', desc: 'Đạt 200 Mastery', req: 200, icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', gradient: 'from-yellow-400/20 to-yellow-600/5', type: 'points' as const, span: 'col-span-1 min-h-[180px]' },
  { id: 'knowledge_seeker', name: 'Cầu Tri Thức', desc: 'Đạt 500 Mastery', req: 500, icon: Star, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/30', gradient: 'from-purple-400/20 to-purple-600/5', type: 'points' as const, span: 'col-span-1 sm:col-span-2 md:col-span-1 min-h-[180px]' },
  { id: 'week_warrior', name: 'Chiến Binh Tuần', desc: '7 ngày liên tục', req: 7, icon: Flame, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30', gradient: 'from-orange-500/20 to-red-500/5', type: 'streak' as const, span: 'col-span-1 sm:col-span-2 md:col-span-1 min-h-[180px]' },
  
  // VIP Badges
  { id: 'scholar', name: 'Học Giả', desc: 'Đạt 1,000 Mastery', req: 1000, icon: Award, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', gradient: 'from-emerald-400/20 to-teal-600/10', type: 'points' as const, span: 'col-span-2 sm:col-span-2 md:col-span-2 md:row-span-2 min-h-[220px]', isVip: true },
  { id: 'monthly_sage', name: 'Hiền Nhân', desc: '30 ngày liên tục', req: 30, icon: Calendar, color: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500/40', gradient: 'from-indigo-400/20 to-blue-600/10', type: 'streak' as const, span: 'col-span-2 md:col-span-2 md:row-span-2 min-h-[220px]', isVip: true },
  
  // Legendary Badges
  { id: 'ai_master', name: 'Bậc Thầy AI', desc: 'Đạt 2,000 Mastery', req: 2000, icon: Cpu, color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/50', gradient: 'from-teal-400/30 to-emerald-600/10', type: 'points' as const, span: 'col-span-2 sm:col-span-3 md:col-span-2 min-h-[180px]', isVip: true },
  { id: 'stoic', name: 'Chân Nhân Khắc Kỷ', desc: 'Đạt 5,000 Mastery', req: 5000, icon: Shield, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/50', gradient: 'from-amber-400/30 via-yellow-500/20 to-orange-600/10', type: 'points' as const, span: 'col-span-2 sm:col-span-3 md:col-span-4 lg:col-span-2 min-h-[180px]', isVip: true },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
};

const BadgeCard = ({ badge, val, unlocked, progress }: any) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const frontRef = useRef<HTMLDivElement>(null);
  const Icon = badge.icon;

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!unlocked || !frontRef.current) return;
    try {
      setIsDownloading(true);
      const dataUrl = await toPng(frontRef.current, { 
        cacheBust: true, 
        pixelRatio: 3,
        style: {
          transform: 'none',
        }
      });
      const link = document.createElement('a');
      link.download = `henosis-badge-${badge.id}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export badge:', err);
    } finally {
      // Short delay to show success state on button if preferred, but resetting immediately is fine.
      setTimeout(() => setIsDownloading(false), 500);
    }
  };

  return (
    <motion.div 
      variants={itemVariants}
      className={cn("group w-full h-full relative cursor-pointer [perspective:1000px]", badge.span)}
      onMouseEnter={() => setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
      onClick={() => setIsFlipped(!isFlipped)}
    >
      <motion.div
        className="w-full h-full relative transition-[transform] duration-700 [transform-style:preserve-3d]"
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
         {/* FRONT FACE */}
         <div 
           ref={frontRef}
           className={cn(
             "absolute top-0 left-0 w-full h-full p-4 lg:p-6 flex flex-col justify-between rounded-2xl transition-all duration-500 [backface-visibility:hidden] overflow-hidden bg-white dark:bg-zinc-900",
             unlocked 
               ? `border-2 ${badge.border} shadow-lg group-hover:shadow-2xl group-hover:-translate-y-1 group-hover:scale-[1.02]`
               : "bg-stone-200/50 dark:bg-zinc-800/80 border-2 border-stone-300/30 dark:border-zinc-700/50 grayscale opacity-80 group-hover:grayscale-[0.5] group-hover:opacity-100 group-hover:-translate-y-1" 
           )}
         >
             {/* Neon Glow around logic if unlocked */}
             {unlocked && (
                <div className={cn("absolute inset-0 bg-gradient-to-br opacity-10 dark:opacity-20 pointer-events-none", badge.gradient)} />
             )}
             
             {unlocked && badge.isVip && (
                <div className="absolute -inset-10 bg-gradient-to-r from-yellow-500/20 via-orange-500/20 to-red-500/20 blur-2xl animate-pulse pointer-events-none" />
             )}

             {/* Shimmer for locked */}
             {!unlocked && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
                   <div className="w-[150%] h-full bg-gradient-to-r from-transparent via-white/20 dark:via-white/5 to-transparent absolute top-0 -left-[100%] animate-[shimmer_2s_infinite_linear]" />
                </div>
             )}

             <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                 <div className="flex items-start justify-between">
                     <div className={cn(
                         "p-3 rounded-2xl shadow-sm border", 
                         unlocked ? `${badge.bg} ${badge.border}` : "bg-stone-300/50 dark:bg-zinc-700/50 border-transparent"
                     )}>
                        <Icon className={cn("w-7 h-7 md:w-10 md:h-10", unlocked ? badge.color : "text-stone-500")} />
                     </div>
                     {unlocked ? (
                         badge.isVip ? <Sparkles className="w-6 h-6 text-yellow-500 animate-[bounce_2s_infinite]" /> : <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-emerald-500 drop-shadow-md" />
                     ) : (
                         <div className="p-2 bg-stone-300/50 dark:bg-zinc-700/50 rounded-full transition-colors drop-shadow-sm">
                            <Lock className="w-3 h-3 md:w-4 md:h-4 text-stone-500" />
                         </div>
                     )}
                 </div>

                 <div className="space-y-1.5 mt-auto">
                     <h4 className={cn("font-black tracking-tight text-lg md:text-xl", unlocked ? "text-stone-900 dark:text-white" : "text-stone-600 dark:text-stone-400 group-hover:text-amber-600 transition-colors")}>
                        {badge.name}
                     </h4>
                     
                     <div className="flex justify-between items-center bg-black/5 dark:bg-white/5 px-2 py-1.5 rounded-lg border border-black/5 dark:border-white/5 backdrop-blur-sm">
                        <span className={cn("text-xs md:text-sm font-bold truncate", unlocked ? badge.color : "text-stone-500")}>
                           {badge.desc}
                        </span>
                        {!unlocked && (
                           <span className="text-xs font-bold font-mono text-stone-500">{Math.floor(progress)}%</span>
                        )}
                     </div>
                     
                     {!unlocked && (
                        <div className="h-1.5 w-full bg-stone-300 dark:bg-zinc-700 rounded-full overflow-hidden mt-2 relative">
                            <motion.div 
                               className="absolute h-full bg-gradient-to-r from-stone-400 to-amber-500 rounded-full" 
                               initial={{ width: 0 }}
                               animate={{ width: `${progress}%` }}
                               transition={{ duration: 1, ease: "easeOut" }}
                            />
                        </div>
                     )}
                 </div>
             </div>
         </div>

         {/* BACK FACE */}
         <div className={cn(
             "absolute top-0 left-0 w-full h-full p-4 lg:p-6 flex flex-col justify-between rounded-2xl transition-all duration-500 [backface-visibility:hidden] [transform:rotateY(180deg)] overflow-hidden",
             unlocked 
               ? `bg-stone-900 dark:bg-black border-2 border-stone-800`
               : "bg-stone-800 dark:bg-zinc-900 border-2 border-stone-700"
           )}
         >
             <div className="absolute inset-0 bg-gradient-to-br from-black/60 to-transparent z-0"></div>
             
             <div className="relative z-10 flex flex-col h-full items-center text-center justify-between">
                <div className="w-full">
                  <h4 className="font-bold text-white uppercase tracking-widest text-xs lg:text-sm mb-1 opacity-70">
                     Tiến trình
                  </h4>
                  <div className="font-mono text-2xl lg:text-3xl font-black text-white">
                     {val} <span className="text-sm opacity-50">/ {badge.req}</span>
                  </div>
                </div>

                <div className="w-full space-y-3 mt-auto">
                   <div className="text-[10px] lg:text-xs text-white/70 bg-white/10 p-2 rounded-lg border border-white/5 backdrop-blur-sm">
                      Mở khóa: <br/> 
                      <span className="font-bold text-white">{badge.isVip ? "🔥 10x XP Rate & Khung VIP" : "✨ +200 XP Khích Lệ"}</span>
                   </div>
                   
                   <div className="flex gap-2">
                       <button 
                         disabled={!unlocked}
                         className={cn(
                            "flex-1 py-2.5 rounded-xl font-bold text-xs lg:text-sm transition-all flex items-center justify-center gap-2",
                            unlocked 
                              ? "bg-yellow-500 text-black hover:bg-yellow-400 active:scale-95 shadow-[0_0_15px_rgba(234,179,8,0.4)]"
                              : "bg-stone-700 text-stone-400 cursor-not-allowed"
                         )}
                       >
                          {unlocked ? <><Zap className="w-3 h-3 md:w-4 md:h-4"/> Đã Nhận</> : <><Lock className="w-3 h-3 md:w-4 md:h-4"/> Khóa</>}
                       </button>

                       {unlocked && (
                         <button
                            onClick={handleDownload}
                            disabled={isDownloading}
                            className="px-4 py-2.5 rounded-xl font-bold text-xs lg:text-sm transition-all flex items-center justify-center bg-stone-800 hover:bg-stone-700 active:scale-95 text-yellow-500 border border-stone-600 shadow-sm"
                            title="Tải ảnh badge"
                         >
                            {isDownloading ? <span className="animate-pulse">...</span> : <Download className="w-4 h-4"/>}
                         </button>
                       )}
                   </div>
                </div>
             </div>
         </div>
      </motion.div>
    </motion.div>
  )
}


export const StudentBadges = ({ points, streak }: { points: number, streak: number }) => {
  const unlockedIdsRef = useRef<string[]>([]);
  const [unlockedIdsStore, setUnlockedIdsStore] = useState<string[]>([]);
  const [newlyUnlocked, setNewlyUnlocked] = useState<typeof BADGES[0] | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    const currentUnlocked = BADGES.filter(b => (b.type === 'streak' ? streak : points) >= b.req).map(b => b.id);
    
    if (isFirstRender.current) {
       unlockedIdsRef.current = currentUnlocked;
       setUnlockedIdsStore(currentUnlocked);
       isFirstRender.current = false;
       return;
    }

    const newUnlocks = currentUnlocked.filter(id => !unlockedIdsRef.current.includes(id));
    
    if (newUnlocks.length > 0) {
       const badgeToCelebrate = BADGES.find(b => b.id === newUnlocks[0]);
       if (badgeToCelebrate) {
          triggerCelebration();
          setNewlyUnlocked(badgeToCelebrate);
       }
       unlockedIdsRef.current = currentUnlocked;
       setUnlockedIdsStore(currentUnlocked);
    }
  }, [points, streak]);

  const closeModal = () => setNewlyUnlocked(null);

  return (
    <div className="glass p-6 md:p-8 rounded-3xl space-y-8 relative overflow-hidden">
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(200%) skewX(-15deg); }
        }
      `}</style>
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
         <div className="space-y-1">
            <h3 className="text-2xl md:text-3xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-700 via-amber-500 to-yellow-600 dark:from-amber-200 dark:via-yellow-400 dark:to-amber-500 flex items-center gap-3">
              <Award className="w-8 h-8 text-yellow-500" /> Tủ Kính Thành Tựu
            </h3>
            <p className="text-sm font-medium text-stone-500 dark:text-stone-400 italic">Mỗi kỷ lục phá vỡ là một bước tiến đến sự vĩ đại.</p>
         </div>
         <div className="flex gap-4">
            <div className="px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-400 text-sm font-black flex items-center gap-2 shadow-inner">
               <Book className="w-4 h-4" /> {points} XP
            </div>
            <div className="px-4 py-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-700 dark:text-orange-400 text-sm font-black flex items-center gap-2 shadow-inner">
               <Flame className="w-4 h-4" /> {streak} Đêm
            </div>
         </div>
      </div>

      <motion.div 
         variants={containerVariants}
         initial="hidden"
         animate="show"
         className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4 auto-rows-fr"
      >
        {BADGES.map(badge => {
          const val = badge.type === 'streak' ? streak : points;
          const unlocked = val >= badge.req;
          const progress = Math.min(100, (val / badge.req) * 100);
          
          return (
             <BadgeCard 
                key={badge.id}
                badge={badge}
                val={val}
                unlocked={unlocked}
                progress={progress}
             />
          );
        })}
      </motion.div>

      {newlyUnlocked && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl max-w-sm w-full relative shadow-2xl border border-yellow-500/30 animate-in zoom-in-95 duration-500 overflow-hidden text-center">
               <button onClick={closeModal} className="absolute top-4 right-4 p-2 bg-stone-200/50 dark:bg-zinc-800/50 hover:bg-stone-300 dark:hover:bg-zinc-700 rounded-full transition">
                  <X className="w-5 h-5" />
               </button>
               
               <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-yellow-500/10 via-amber-500/5 to-transparent pointer-events-none" />
               
               <div className="relative z-10 flex flex-col items-center gap-4">
                  <div className={cn("p-5 rounded-2xl shadow-xl", newlyUnlocked.bg, newlyUnlocked.border)}>
                     <newlyUnlocked.icon className={cn("w-16 h-16", newlyUnlocked.color, newlyUnlocked.isVip && "animate-bounce")} />
                  </div>
                  
                  <div className="space-y-2">
                     <span className="text-sm font-bold text-amber-500 tracking-widest uppercase">Thành tựu mới</span>
                     <h2 className="text-2xl font-black text-stone-900 dark:text-white font-display">
                        {newlyUnlocked.name}
                     </h2>
                     <p className="text-stone-600 dark:text-stone-300 opacity-80 leading-relaxed text-sm">
                        Thuộc tính vinh hiển: <strong className={newlyUnlocked.color}>{newlyUnlocked.desc}</strong>!
                     </p>
                  </div>
                  
                  <button onClick={closeModal} className="mt-4 px-6 py-3 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-600 transition hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(234,179,8,0.3)] w-full flex items-center justify-center gap-2">
                     <Award className="w-5 h-5" /> Vô Cực Tuyệt Hảo!
                  </button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

