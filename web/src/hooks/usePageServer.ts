"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme, type ServerSourceType } from "@/contexts/ThemeContext";

const SERVERS: readonly ServerSourceType[] = ["jp", "en", "tw", "kr", "cn"];

/** The server a `?server=` query pins, or null when it names none. */
function pinnedServer(): ServerSourceType | null {
    const value = new URLSearchParams(window.location.search).get("server");
    return SERVERS.find(server => server === value) ?? null;
}

/** The pin once the URL has been read in the browser (the server render has no URL). */
type Pin = { read: false } | { read: true; server: ServerSourceType | null };

/**
 * The game server a page shows: the one a shared link pins with `?server=`, or else the server
 * chosen in the settings. Choosing a server on the page changes the setting and drops the pin, so
 * the page keeps following the setting.
 */
export function usePageServer() {
    const { serverSource, setServerSource, hasHydratedThemeSettings } = useTheme();
    const [pin, setPin] = useState<Pin>({ read: false });

    useEffect(() => {
        const readUrl = () => setPin({ read: true, server: pinnedServer() });
        readUrl();
        window.addEventListener("popstate", readUrl);
        return () => window.removeEventListener("popstate", readUrl);
    }, []);

    const chooseServer = useCallback((server: ServerSourceType) => {
        setPin({ read: true, server: null });
        setServerSource(server);
    }, [setServerSource]);
    const unpin = useCallback(() => setPin({ read: true, server: null }), []);

    const pinned = pin.read ? pin.server : null;

    return {
        servers: SERVERS,
        server: pinned ?? serverSource,
        /** The pin, which the page keeps in its URL; null while it follows the setting. */
        pinned,
        /** False until the URL and, without a pin, the saved setting are read: the server is not yet known. */
        ready: pin.read && (pinned !== null || hasHydratedThemeSettings),
        chooseServer,
        unpin,
    };
}
