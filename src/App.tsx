import React, { useState, useEffect } from "react";
import { Link, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { Moon, Sun, LogOut, MessageCircle, Flame, Volume2, VolumeX, Home, BookOpen, User as UserIcon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useTheme, ThemeProvider } from "./components/ThemeProvider";
import { SoundProvider, useSoundContext } from "./components/SoundProvider";
import { MarcusAureliusIcon } from "./components/MarcusAureliusIcon";
import { StreakDisplay } from "./components/StreakDisplay";
import { Breadcrumbs } from "./components/Breadcrumbs";
import AuthScreen from "./components/AuthScreen";
import VerifyEmailScreen from "./components/VerifyEmailScreen";
import StudentDashboard from "./pages/StudentDashboard";
import TeacherDashboard from "./pages/TeacherDashboard";
import StudyRoom from "./pages/StudyRoom";
import CoStudyRoom from "./pages/CoStudyRoom";
import SetupProfileScreen from "./pages/SetupProfileScreen";
import AdminKeysDashboard from "./pages/AdminKeysDashboard";
import AdminCreateCards from "./pages/AdminCreateCards";
import Agent3Widget from "./components/Agent3Widget";
import { GlobalErrorToast } from "./components/GlobalErrorToast";
import { AudioVisualizer } from "./components/AudioVisualizer";
import { ParticleBackground } from "./components/ParticleBackground";
import { CustomCursor } from "./components/CustomCursor";
import { NetworkStatus } from "./components/NetworkStatus";
import { auth, FirebaseListenerManager } from "./lib/firebase";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { store } from "./lib/store";

import { ErrorBoundary } from "./components/ErrorBoundary";
import { DashboardSkeleton } from "./components/DashboardSkeleton";
import { AppUpdateNotification } from "./components/AppUpdateNotification";
import { AutoRefreshBadge } from "./components/AutoRefreshBadge";
import { ForceRefreshButton } from "./components/ForceRefreshButton";

const PageWrapper = ({ children }: { children: React.ReactNode }) => (
    <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full"
    >
        <ErrorBoundary>
            {children}
        </ErrorBoundary>
    </motion.div>
);

function Layout({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const { isSoundEnabled, toggleSound } = useSoundContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const handler = () => {
       setPulse(true);
       setTimeout(() => setPulse(false), 1000);
    };
    window.addEventListener("app-pulse-logo", handler);
    return () => window.removeEventListener("app-pulse-logo", handler);
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      console.log("Setting up auth state observer...");
      unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        try {
          if (currentUser && !currentUser.isAnonymous && !currentUser.emailVerified) {
            await signOut(auth);
            store.logout();
            FirebaseListenerManager.clearAll();
            setUser(null);
            setIsAuthLoading(false);
            const emailParams = currentUser.email ? `?email=${encodeURIComponent(currentUser.email)}` : "";
            navigate(`/verify${emailParams}`);
            return;
          }

          // Directly sync user with store
          const prevUser = user;
          await store.setFirebaseUser(currentUser);
          setUser(currentUser);
          
          if (!currentUser) {
            FirebaseListenerManager.clearAll();
          }

          if (currentUser && !prevUser) {
             // Dispatch pulse when logging in
             window.dispatchEvent(new CustomEvent("app-pulse-logo"));
          }
        } catch (e) {
          console.error("Firebase auth initialization error:", e);
          setUser(currentUser);
        } finally {
          setIsAuthLoading(false);
          // Redirect if not authenticated and not on verification page
          if (!currentUser && window.location.pathname !== '/verify') {
            navigate("/");
          } else if (currentUser && window.location.pathname === '/') {
            const currentStoreUser = store.getCurrentUser();
            if (currentStoreUser) {
              navigate(currentStoreUser.role === 'teacher' || currentStoreUser.role === 'admin' ? '/teacher' : '/dashboard');
            } else {
              navigate('/dashboard');
            }
          }
        }
      });
    } catch (e) {
      console.error("Auth state observer error:", e);
      setIsAuthLoading(false);
    }

    return () => unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    try {
      // Clean up co-study room presence before losing auth context
      if (auth.currentUser?.uid) {
         try {
             const { doc, deleteDoc } = await import("firebase/firestore");
             const { db } = await import("./lib/firebase");
             await deleteDoc(doc(db, "costudy_room", auth.currentUser.uid));
         } catch (roomErr) {
             console.error("Cleanup room error:", roomErr);
         }
      }

      if (auth.currentUser?.isAnonymous) {
          try {
             // In case they accidentally accrued a Firestore profile (maybe scored something), clear it to keep Leaderboard clean
             const { dbService } = await import("./lib/firebase");
             await dbService.deleteUserProfile(auth.currentUser.uid);
             await auth.currentUser.delete();
          } catch (delError) {
             console.error("Soft failing cleanup of anonymous auth:", delError);
          }
      } else {
          await signOut(auth);
      }
      store.logout();
      navigate("/");
    } catch (e) {
      console.error("Error signing out:", e);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans transition-colors duration-300 overflow-x-hidden">
      <CustomCursor />
      <ParticleBackground />
      <NetworkStatus />
      <header className="glass shadow-sm fixed top-0 w-full z-40 px-4 md:px-6 py-4 flex items-center justify-between border-b-0 rounded-none rounded-b-2xl">
        <div className="flex items-center gap-2">
          <motion.div
             animate={pulse ? { rotate: [0, 15, -15, 10, -10, 0], scale: [1, 1.2, 1] } : {}}
             transition={{ duration: 0.6 }}
          >
            <MarcusAureliusIcon className="w-6 h-6 text-yellow-500" />
          </motion.div>
          <span className="italic font-serif tracking-widest uppercase font-light text-xl md:text-2xl text-yellow-500">HENOSIS</span>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
          <AutoRefreshBadge />
          {user && store.getCurrentUser()?.streak !== undefined && (
            <StreakDisplay />
          )}
          {user && (
            <a href="https://t.me/+O50q6ltXTzwxMzk1" target="_blank" rel="noopener noreferrer" 
               className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-500/20 dark:border-amber-500/40 bg-amber-500/10 hover:bg-yellow-500 hover:text-black transition text-stone-800 dark:text-stone-200 font-medium text-xs md:text-sm"
               title="Hỗ trợ (Telegram)">
              <MessageCircle className="w-4 h-4 text-yellow-500" />
              <span className="hidden sm:inline">Hỗ trợ Telegram</span>
              <span className="inline sm:hidden">Hỗ trợ</span>
            </a>
          )}

          <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition">
            {theme === "dark" ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-1">
            <button onClick={toggleSound} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition flex items-center justify-center w-9 h-9" title="Toggle Sound">
              <motion.div
                key={isSoundEnabled ? "sound-on" : "sound-off"}
                initial={{ scale: 0.5, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                {isSoundEnabled ? <Volume2 className="w-5 h-5 text-yellow-500" /> : <VolumeX className="w-5 h-5 text-stone-500" />}
              </motion.div>
            </button>
            {isSoundEnabled && <AudioVisualizer />}
          </div>
          
          {user && (
            <div className="flex items-center gap-2 md:gap-4">
              <span className="font-medium text-sm md:text-base hidden xs:inline">{user.email?.split("@")[0] || "User"}</span>
              <button onClick={handleLogout} className="p-2 rounded-full hover:bg-red-500/10 text-red-500 transition" title="Đăng xuất">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 mt-24 mb-24 md:mb-10 px-4 md:px-8 max-w-7xl mx-auto w-full">
        <Breadcrumbs />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          {isAuthLoading ? (
             <DashboardSkeleton />
          ) : children}
        </motion.div>
      </main>

      {user && (
        <nav className="md:hidden fixed bottom-0 w-full z-40 glass rounded-none border-t border-white/20 dark:border-white/10 pt-3 pb-6 flex justify-around items-center px-2">
          {(() => {
            const currentPath = location.pathname;
            const currentUser = store.getCurrentUser();
            const isTeacher = currentUser?.role === 'teacher' || currentUser?.role === 'admin';
            const homePath = isTeacher ? "/teacher" : "/dashboard";
            const tabs = [
              { name: "Home", path: homePath, icon: Home },
              { name: "Study Room", path: "/co-study", icon: BookOpen },
              { name: "Profile", path: "/setup-profile", icon: UserIcon },
            ];

            return tabs.map((tab) => {
              const isActive = currentPath === tab.path || (tab.name === "Home" && (currentPath === '/dashboard' || currentPath === '/teacher'));
              const Icon = tab.icon;
              return (
                <button
                  key={tab.name}
                  onClick={() => navigate(tab.path)}
                  className={`flex flex-col items-center justify-center p-2 min-w-[72px] transition-all duration-300 ${
                    isActive ? "text-yellow-600 dark:text-yellow-400 transform -translate-y-1" : "text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
                  }`}
                >
                  <Icon className={`w-6 h-6 mb-1 transition-all duration-300 ${isActive ? "fill-yellow-500/20" : ""}`} />
                  <span className="text-[11px] font-medium">{tab.name}</span>
                </button>
              );
            });
          })()}
        </nav>
      )}

      {user && <Agent3Widget />}
      <GlobalErrorToast />
      <AppUpdateNotification />
      <ForceRefreshButton />
    </div>
  );
}

export default function App() {
  const location = useLocation();

  return (
    <ThemeProvider>
      <Layout>
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<PageWrapper><AuthScreen /></PageWrapper>} />
            <Route path="/verify" element={<PageWrapper><VerifyEmailScreen /></PageWrapper>} />
            <Route path="/dashboard" element={<PageWrapper><StudentDashboard /></PageWrapper>} />
            <Route path="/teacher" element={<PageWrapper><TeacherDashboard /></PageWrapper>} />
            <Route path="/study/:deckId" element={<PageWrapper><StudyRoom /></PageWrapper>} />
            <Route path="/co-study" element={<PageWrapper><CoStudyRoom /></PageWrapper>} />
            <Route path="/setup-profile" element={<PageWrapper><SetupProfileScreen /></PageWrapper>} />
            <Route path="/admin/keys" element={<PageWrapper><AdminKeysDashboard /></PageWrapper>} />
            <Route path="/admin/create-cards" element={<PageWrapper><AdminCreateCards /></PageWrapper>} />
          </Routes>
        </AnimatePresence>
      </Layout>
    </ThemeProvider>
  );
}
