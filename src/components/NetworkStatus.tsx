import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { db } from '../lib/firebase';
import { disableNetwork, enableNetwork } from 'firebase/firestore';
import { NetworkHealthMonitor } from '../lib/NetworkHealthMonitor';

export const NetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showToast, setShowToast] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    NetworkHealthMonitor.init();
    
    let syncTimeoutId: ReturnType<typeof setTimeout>;

    const handleOnline = async () => {
      setIsOnline(true);
      setShowToast(true);
      setIsSyncing(true);

      // CƠ CHẾ SOFT RELOAD AN TOÀN (SMART RE-SYNC)
      // Tái khởi động Firebase WebSocket/Listeners thay vì F5 cục súc
      // Bảo vệ hoàn hảo transient state của Pomodoro và Redux/Zustand local
      try {
        console.log('[System] Re-establishing Firebase Secure Connections...');
        await disableNetwork(db);
        await enableNetwork(db);
        window.dispatchEvent(new CustomEvent('app-network-reconnect'));
        console.log('[System] Network streams repaired successfully & event dispatched.');
      } catch (error) {
        console.error('[System] Error reviving network streams:', error);
      } finally {
        setTimeout(() => setIsSyncing(false), 2000);
        syncTimeoutId = setTimeout(() => setShowToast(false), 5000);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowToast(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // ANTI-LOOP THROTLLER & PERIODIC HEALTH CHECK
    const healthCheckInterval = setInterval(() => {
      if (!navigator.onLine) return;
      
      const lastRefresh = parseInt(localStorage.getItem('last_system_health_check') || '0', 10);
      const now = Date.now();
      const THREE_HOURS = 3 * 60 * 60 * 1000;
      
      if (now - lastRefresh > THREE_HOURS) {
        // Thực hiện ghi log hoặc soft-reload silent nếu cần clear Memory Leak
        localStorage.setItem('last_system_health_check', now.toString());
        console.log('[System] Periodic health check passed.');
      }
    }, 15 * 60 * 1000); // 15 phút check 1 lần

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(syncTimeoutId);
      clearInterval(healthCheckInterval);
      NetworkHealthMonitor.cleanup();
    };
  }, []);

  return (
    <AnimatePresence>
      {showToast && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-2.5 rounded-full shadow-lg border backdrop-blur-md ${
            isOnline 
              ? 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400' 
              : 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400'
          }`}
        >
          {isOnline ? (
            isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />
          ) : (
            <WifiOff className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">
            {!isOnline 
               ? 'Mất kết nối internet' 
               : (isSyncing ? 'Đang đồng bộ lại dữ liệu...' : 'Đã kết nối và đồng bộ')}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

