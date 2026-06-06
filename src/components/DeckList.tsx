import React, { useState, useMemo, useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { Play, BookOpen, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Deck } from '../lib/store';

interface DeckListProps {
  decks: Deck[];
  showSearch?: boolean;
}

const TiltCard = ({ children, delayIdx }: { children: React.ReactNode, delayIdx: number }) => {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseXSpring = useSpring(x, { stiffness: 300, damping: 30 });
  const mouseYSpring = useSpring(y, { stiffness: 300, damping: 30 });
  
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["10deg", "-10deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-10deg", "10deg"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    x.set(mouseX / width - 0.5);
    y.set(mouseY / height - 0.5);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delayIdx * 0.1, type: "spring", stiffness: 100 }}
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
      }}
      className="perspective-1000 h-full"
    >
      <div className="card-3d relative p-6 rounded-2xl flex flex-col group overflow-hidden h-full transform-style-3d bg-white/70 dark:bg-black/80">
        {children}
      </div>
    </motion.div>
  );
};

export const DeckList = ({ decks, showSearch = true }: DeckListProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    const saved = localStorage.getItem('recentSearches');
    return saved ? JSON.parse(saved) : [];
  });
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const saveSearch = (query: string) => {
    if (!query.trim()) return;
    const newRecent = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
    setRecentSearches(newRecent);
    localStorage.setItem('recentSearches', JSON.stringify(newRecent));
  };

  const filteredDecks = useMemo(() => {
    return decks.filter(deck => 
      deck.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (deck.subject || "general").toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [decks, searchQuery]);

  const groupedDecks = useMemo(() => {
    return filteredDecks.reduce((acc, deck) => {
      const subj = deck.subject || "general";
      if (!acc[subj]) acc[subj] = [];
      acc[subj].push(deck);
      return acc;
    }, {} as Record<string, Deck[]>);
  }, [filteredDecks]);

  return (
    <div className="space-y-6">
      {showSearch && (
        <div className="relative w-full max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-stone-400" />
          </div>
          <input
            type="text"
            placeholder="Tìm kiếm bộ thẻ..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsDropdownOpen(true)}
            onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveSearch(searchQuery);
            }}
            className="block w-full pl-10 pr-10 py-2.5 border border-stone-300 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-900 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              <X className="h-5 w-5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200" />
            </button>
          )}
          {isDropdownOpen && !searchQuery && recentSearches.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="px-4 py-2 text-xs text-stone-500 uppercase tracking-wider font-semibold border-b border-stone-200 dark:border-stone-700">Tìm kiếm gần đây</div>
              {recentSearches.map((search) => (
                <button
                  key={search}
                  onClick={() => setSearchQuery(search)}
                  className="w-full text-left px-4 py-2 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
                >
                  {search}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-8">
        {Object.entries(groupedDecks).map(([subject, subjectDecks]) => (
          <div key={subject} className="space-y-4">
            <h3 className="text-xl font-display font-bold text-stone-800 dark:text-stone-200 uppercase tracking-widest border-b border-amber-600/20 dark:border-amber-500/30 pb-2 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-amber-500" /> {subject}
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              {subjectDecks.map((deck, idx) => {
                const masteredCount = deck.cards.filter(c => c.mastery >= 80).length;
                const masteryRate = deck.cards.length > 0 ? Math.round((masteredCount / deck.cards.length) * 100) : 0;
                
                return (
                  <TiltCard key={deck.id} delayIdx={idx}>
                    {/* Animated gradient border pseudo-element effect already handled by .card-3d layer logic */}
                    <div className="relative z-10 flex flex-col h-full [transform:translateZ(30px)]">
                      <h4 className="font-bold text-lg mb-1 group-hover:text-amber-500 transition-colors">{deck.title}</h4>
                      <span className="text-xs font-mono opacity-60 uppercase tracking-widest mb-4">{deck.subject}</span>
                      
                      <div className="mt-auto pt-4 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between">
                        <div className="flex flex-col gap-1 w-full mr-4">
                          <div className="flex justify-between text-xs font-mono font-bold">
                            <span>Thông thạo</span>
                            <span className="text-yellow-600 dark:text-yellow-400">{masteryRate}%</span>
                          </div>
                          <div className="w-full h-2 bg-stone-300/60 dark:bg-zinc-800/80 rounded-full overflow-hidden shadow-inner">
                            <motion.div 
                              className="bg-gradient-to-r from-amber-500 to-yellow-400 h-full shimmer-bar relative"
                              initial={{ width: 0 }}
                              animate={{ width: `${masteryRate}%` }}
                              transition={{ duration: 1.5, ease: "easeOut" }}
                            />
                          </div>
                        </div>
                        
                        <Link to={`/study/${deck.id}`} className="btn-3d-primary w-12 h-12 rounded-full flex items-center justify-center shrink-0">
                          <Play className="w-5 h-5 ml-1" />
                        </Link>
                      </div>
                    </div>
                  </TiltCard>
                );
              })}
            </div>
          </div>
        ))}
        {filteredDecks.length === 0 && (
          <div className="p-8 text-center text-stone-500 italic space-y-3">
            <p>Không tìm thấy bộ thẻ nào phù hợp.</p>
            <button className="text-yellow-600 dark:text-yellow-400 font-bold hover:underline">
                Tạo bộ thẻ mới
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
