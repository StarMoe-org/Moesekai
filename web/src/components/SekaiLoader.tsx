"use client";
import { useEffect, useState } from "react";

export default function SekaiLoader() {
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'loading' | 'waiting' | 'complete'>('loading');

  useEffect(() => {
    // Phase 1: Fast load to 90% (0.5s)
    const waitTimer = setTimeout(() => {
      setPhase('waiting');
    }, 500);

    // Simulate actual loading completion after 1.5s
    const loadTimer = setTimeout(() => {
      setPhase('complete');
      // Hide overlay after completion animation (400ms matches CSS transition)
      const hideTimer = setTimeout(() => setLoading(false), 400);
      return () => clearTimeout(hideTimer);
    }, 1500);

    return () => {
      clearTimeout(waitTimer);
      clearTimeout(loadTimer);
    };
  }, []);

  if (!loading) return null;

  return (
    <>
      <style jsx global>{`
        .loading-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          
          background-color: var(--md-sys-color-surface);
          
          transition: opacity 0.4s cubic-bezier(0.2, 0, 0, 1), visibility 0.4s cubic-bezier(0.2, 0, 0, 1);
        }


        .loading-overlay.hidden {
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
        }
        
        /* Miku Loader Container */
        .loader-container {
          position: relative;
          width: min(400px, 60vw);
          aspect-ratio: 6 / 1;
          margin-bottom: 20px;
        }
        
        /* Common mask style */
        .miku-layer {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          -webkit-mask-image: url('/loading.webp');
          mask-image: url('/loading.webp');
          -webkit-mask-size: contain;
          mask-size: contain;
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          -webkit-mask-position: center;
          mask-position: center;
        }
        
        /* Base layer - light cyan (unloaded) */
        .base {
          background-color: var(--md-sys-color-secondary-container);
          z-index: 1;
        }
        
        /* Progress wrapper */
        .progress-wrapper {
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          width: 0%;
          overflow: hidden;
          z-index: 2;
          transition: width 0.3s ease-out;
        }
        
        /* Phase animations */
        .progress-wrapper.loading {
          animation: miku-load-fast 0.5s ease-out forwards;
        }
        .progress-wrapper.waiting {
          width: 90%;
        }
        .progress-wrapper.complete {
          width: 100%;
        }
        
        /* Progress color layer */
        .progress-color {
          width: min(400px, 60vw);
          height: 100%;
          background-color: var(--md-sys-color-primary);
        }
        
        @keyframes miku-load-fast {
          0% { width: 0%; }
          100% { width: 90%; }
        }
        
        .loading-text {
          color: var(--md-sys-color-on-surface-variant);
          font-size: 14px;
          line-height: 20px;
          font-weight: 500;
          letter-spacing: 0.1px;
          animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>

      <div className={`loading-overlay ${phase === 'complete' ? "hidden" : ""}`}>
        <div className="loader-container">
          <div className="miku-layer base"></div>
          <div className={`progress-wrapper ${phase}`}>
            <div className="miku-layer progress-color"></div>
          </div>
        </div>
        <div className="loading-text">Connecting to SEKAI...</div>
      </div>
    </>
  );
}
