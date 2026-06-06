import React, { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "../lib/utils";

export function AutoRefreshBadge() {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isDisabled, setIsDisabled] = useState(false);

  useEffect(() => {
    // Initial calculation
    const calculateTimeLeft = () => {
       const updateSetting = localStorage.getItem("autoUpdateInterval") || "10";
       if (updateSetting === "disabled") {
         setIsDisabled(true);
         setTimeLeft(null);
         return null;
       }
       setIsDisabled(false);
       const intervalMins = parseInt(updateSetting, 10);
       
       // To sync globally, we could use the start of the current hour/minute as an epoch,
       // but for simplicity we'll just track from when this component mounts, OR read from a shared global.
       // Since the service worker uses Date.now() when it starts, let's just use localStorage to track the exact target time.
       let targetTime = localStorage.getItem("autoUpdateTargetTime");
       const now = Date.now();
       
       if (!targetTime || parseInt(targetTime, 10) <= now) {
          const nextTarget = now + intervalMins * 60 * 1000;
          localStorage.setItem("autoUpdateTargetTime", nextTarget.toString());
          targetTime = nextTarget.toString();
       }
       
       return Math.max(0, parseInt(targetTime, 10) - now);
    };

    let currentRemaining = calculateTimeLeft();
    if (currentRemaining !== null) {
       setTimeLeft(currentRemaining);
    }

    const interval = setInterval(() => {
       const updateSetting = localStorage.getItem("autoUpdateInterval") || "10";
       if (updateSetting === "disabled") {
         setIsDisabled(true);
         setTimeLeft(null);
         localStorage.removeItem("autoUpdateTargetTime");
         return;
       }
       
       setIsDisabled(false);
       let targetTime = localStorage.getItem("autoUpdateTargetTime");
       const now = Date.now();
       const intervalMins = parseInt(updateSetting, 10);

       if (!targetTime || parseInt(targetTime, 10) <= now) {
          // Time's up, trigger a refresh event locally and reset target
          const nextTarget = now + intervalMins * 60 * 1000;
          localStorage.setItem("autoUpdateTargetTime", nextTarget.toString());
          targetTime = nextTarget.toString();
          
          // Trigger the SW check manually (since the SW itself is a bit isolated)
          if ('serviceWorker' in navigator) {
             navigator.serviceWorker.ready.then(reg => {
                reg.update().catch(err => {
                   console.warn('[AutoRefresh] ServiceWorker update failed, continuing...');
                });
             }).catch(err => {
                console.warn('[AutoRefresh] ServiceWorker ready failed');
             });
          }
       }
       
       setTimeLeft(Math.max(0, parseInt(targetTime, 10) - Date.now()));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (isDisabled) return null;

  const m = timeLeft !== null ? Math.floor(timeLeft / 60000) : 0;
  const s = timeLeft !== null ? Math.floor((timeLeft % 60000) / 1000) : 0;

  return (
    <div className="flex items-center gap-2 bg-stone-100/80 dark:bg-zinc-900/80 backdrop-blur border border-stone-200 dark:border-zinc-800 px-3 py-1.5 rounded-full shadow-sm" title="Tự động đồng bộ & cập nhật phiên bản">
       <span className="relative flex h-2.5 w-2.5">
          {timeLeft && timeLeft < 10000 ? (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </>
          ) : (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </>
          )}
       </span>
       <span className="text-[10px] font-mono font-bold text-stone-600 dark:text-stone-400 tracking-wider flex items-center gap-1.5">
          <RefreshCw className={cn("w-3 h-3", timeLeft && timeLeft < 10000 ? "animate-spin text-red-500" : "")} />
          {timeLeft === null ? "--:--" : `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`}
       </span>
    </div>
  );
}
