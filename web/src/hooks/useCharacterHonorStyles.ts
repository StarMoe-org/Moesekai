"use client";

import { useEffect, useState } from "react";
import { loadCharacterHonorStyles, type CharacterHonorStyles } from "@/lib/character-honor-styles";
import type { ServerSourceType } from "@/lib/fetch";

/**
 * The character honor style tables of a server (the current one when omitted), loaded only
 * while `enabled`. Null until they arrive; empty lists on servers that don't have them.
 */
export function useCharacterHonorStyles(server: ServerSourceType | undefined, enabled: boolean): CharacterHonorStyles | null {
    const key = server ?? "";
    const [result, setResult] = useState<{ key: string; styles: CharacterHonorStyles } | null>(null);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        void loadCharacterHonorStyles(server).then((styles) => {
            if (!cancelled) setResult({ key, styles });
        });
        return () => {
            cancelled = true;
        };
    }, [server, key, enabled]);

    return enabled && result?.key === key ? result.styles : null;
}
