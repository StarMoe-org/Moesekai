"use client";

import { motion } from "framer-motion";

interface ScoreChangeBadgeProps {
    scoreDelta: number;
}

export default function ScoreChangeBadge({ scoreDelta }: ScoreChangeBadgeProps) {
    if (scoreDelta === 0) {
        return <span className="text-[9px] text-on-surface-variant">—</span>;
    }

    const positive = scoreDelta > 0;

    return (
        <motion.span
            key={scoreDelta}
            initial={{ scale: 1.2, opacity: 0, y: positive ? 4 : -4 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 18 }}
            className={`inline-flex items-center gap-0.5 rounded-md3-xs px-1 py-0.5 type-label-s ${
                positive
                    ? "bg-emerald-100 text-emerald-700 "
                    : "bg-rose-100 text-rose-700 "
            }`}
        >
            <span className="text-[8px]">{positive ? "▲" : "▼"}</span>
            {positive ? "+" : ""}{scoreDelta.toLocaleString()}
        </motion.span>
    );
}
