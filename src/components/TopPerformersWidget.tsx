import React from "react";
import { motion } from "motion/react";
import { Crown, Flame, ChevronUp, ChevronDown, Sparkles, Trophy, Award, Shield } from "lucide-react";
import { cn } from "../lib/utils";
import { User } from "../lib/store";

interface TopPerformersWidgetProps {
  users: User[];
  currentUserId?: string;
  rankTrends?: Record<string, 'up' | 'down' | 'same'>;
  onUserClick?: (user: User) => void;
}

export const getTier = (points: number) => {
    if (points >= 100) return { name: "Grandmaster", color: "text-purple-500 bg-purple-500/10 border-purple-500/30", gradient: "from-purple-500 to-fuchsia-600", icon: <Crown className="w-3 h-3" /> };
    if (points >= 50) return { name: "Diamond", color: "text-cyan-500 bg-cyan-500/10 border-cyan-500/30", gradient: "from-cyan-400 to-blue-500", icon: <Sparkles className="w-3 h-3" /> };
    if (points >= 20) return { name: "Gold", color: "text-yellow-500 bg-yellow-500/10 border-yellow-500/30", gradient: "from-yellow-400 to-amber-600", icon: <Trophy className="w-3 h-3" /> };
    if (points >= 10) return { name: "Silver", color: "text-gray-400 bg-gray-400/10 border-gray-400/30", gradient: "from-gray-300 to-gray-500", icon: <Award className="w-3 h-3" /> };
    return { name: "Bronze", color: "text-orange-500 bg-orange-500/10 border-orange-500/30", gradient: "from-orange-400 to-red-500", icon: <Shield className="w-3 h-3" /> };
};

export const TopPerformersWidget: React.FC<TopPerformersWidgetProps> = ({ users, currentUserId, rankTrends = {}, onUserClick }) => {
  if (!users || users.length === 0) return null;

  return (
    <div className="glass p-6 rounded-2xl">
      <div className="flex items-center gap-2 mb-6 border-b border-amber-600/20 dark:border-amber-500/30 pb-3">
        <Trophy className="w-5 h-5 text-yellow-500" />
        <h3 className="font-bold text-lg font-display text-transparent bg-clip-text bg-gradient-to-r from-amber-700 via-amber-500 to-yellow-600 dark:from-amber-200 dark:via-yellow-400 dark:to-amber-500">
            Top 3 Tuần Nay
        </h3>
      </div>
      
      <div className="flex flex-wrap justify-center items-end gap-3 sm:gap-4 md:gap-6 pt-4 relative">
        {[1, 0, 2].map(pos => {
          const u = users[pos];
          if (!u) return null;
          const tier = getTier(u.points || 0);
          const isFirst = pos === 0;
          const isSecond = pos === 1;
          const isThird = pos === 2;
          const trend = rankTrends[u.id] || 'same';

          return (
            <motion.div 
              key={u.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: pos * 0.1 }}
              whileHover={{ scale: 1.05, y: -5 }}
              onClick={() => onUserClick && onUserClick(u)}
              className={cn(
                "relative flex flex-col items-center px-1 py-3 sm:p-4 rounded-2xl cursor-pointer transition-all duration-300",
                "bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-white/20 dark:border-white/10",
                isFirst ? "order-1 w-[32%] max-w-[140px] shadow-[0_0_30px_-10px_rgba(234,179,8,0.5)] z-20" : 
                isSecond ? "order-2 w-[30%] max-w-[120px] z-10" : 
                "order-3 w-[30%] max-w-[120px] z-10",
                u.id === currentUserId ? "ring-2 ring-amber-500 ring-offset-2 ring-offset-white dark:ring-offset-black" : ""
              )}
            >
              {isFirst && <Crown className="absolute -top-5 w-8 h-8 text-yellow-500 drop-shadow-xl animate-pulse" />}
              {trend === 'up' && <ChevronUp className="absolute top-1 right-1 w-4 h-4 text-green-500 animate-bounce" />}
              {trend === 'down' && <ChevronDown className="absolute top-1 right-1 w-4 h-4 text-red-500" />}

              <div className={cn(
                "flex items-center justify-center font-display font-bold shrink-0 rounded-full mb-2 shadow-xl relative",
                isFirst ? "w-14 h-14 text-xl bg-gradient-to-br from-yellow-300 via-yellow-400 to-yellow-600 text-black border-2 border-white/20 shadow-yellow-500/50" : 
                isSecond ? "w-10 h-10 text-lg bg-gradient-to-br from-gray-100 via-gray-300 to-gray-500 text-black border-2 border-white/20 shadow-gray-400/50" : 
                "w-10 h-10 text-lg bg-gradient-to-br from-orange-200 via-orange-400 to-orange-600 text-black border-2 border-white/20 shadow-orange-500/50"
              )}>
                {pos + 1}
              </div>
              
              <h4 className="font-bold text-center text-[11px] sm:text-xs mb-1 line-clamp-1 break-all px-1 leading-tight">{u.name}</h4>
              {u.id === currentUserId && <span className="text-[8px] bg-yellow-500 text-black px-1.5 py-0.5 rounded-full uppercase tracking-wider mb-1 font-bold">You</span>}
              
              {u.streak ? (
                <div className="flex items-center gap-0.5 text-[9px] font-bold text-orange-500 bg-orange-500/10 px-1.5 py-0.5 rounded-full mb-1.5 border border-orange-500/20 whitespace-nowrap">
                   <Flame className="w-2.5 h-2.5" /> {u.streak}
                </div>
              ) : <div className="h-4 mb-1.5"></div>}
              
              <div className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center justify-center whitespace-nowrap border", tier.color)}>
                 <div className="flex items-center gap-1">
                   {tier.icon} <span>{u.points || 0}</span>
                 </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
