import React, { Component, ReactNode } from "react";
import { AlertTriangle, Send } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
  isRedirecting: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    isRedirecting: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, isRedirecting: false };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReportError = async () => {
    try {
      this.setState({ isRedirecting: true });
      
      const { error, errorInfo } = this.state;
      const logData = `[CRASH REPORT]
Message: ${error?.message || "Unknown error"}
Stack: ${error?.stack || "No stack trace"}
Component Stack: ${errorInfo?.componentStack || "No component stack"}
Time: ${new Date().toISOString()}
URL: ${window.location.href}`;

      // Open tab synchronously first to avoid mobile popup blockers dropping context
      const newWin = window.open("https://t.me/+O50q6ltXTzwxMzk1", "_blank");
      
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(logData);
      }
      
      setTimeout(() => {
        this.setState({ isRedirecting: false });
      }, 3000);
    } catch (err) {
      console.error("Lỗi khi copy log:", err);
      this.setState({ isRedirecting: false });
      // Fallback redirect if something failed
      window.open("https://t.me/+O50q6ltXTzwxMzk1", "_blank");
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-red-100 dark:bg-red-900/20 rounded-xl border border-red-500/30 text-center glass relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-amber-500"></div>
            <AlertTriangle className="w-12 h-12 text-red-500 mb-4 animate-pulse" />
            <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">Đã Xảy Ra Lỗi Hiển Thị</h2>
            <p className="text-sm opacity-80 mb-6 max-w-md">
              {this.state.error?.message || "Hệ thống gặp sự cố không mong muốn trong quá trình render."}
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3">
               <button
                  onClick={() => this.setState({ hasError: false, error: undefined, errorInfo: undefined })}
                  className="px-5 py-2.5 bg-stone-200 dark:bg-zinc-800 text-stone-800 dark:text-stone-200 rounded-xl text-sm font-bold shadow hover:bg-stone-300 dark:hover:bg-zinc-700 transition active:scale-95 border border-stone-300 dark:border-zinc-600"
               >
                  Thử Lại (Retry)
               </button>
               
               <button
                  onClick={this.handleReportError}
                  disabled={this.state.isRedirecting}
                  className="group px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 hover:scale-105 transition-all active:scale-95 flex items-center gap-2"
               >
                  <Send className="w-4 h-4 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
                  {this.state.isRedirecting ? "Đã copy! Đang mở Telegram..." : "Báo Lỗi qua Telegram"}
               </button>
            </div>
        </div>
      );
    }

    return this.props.children;
  }
}
