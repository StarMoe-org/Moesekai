export interface DialogueLine {
    speaker: string | null;
    speech: string;
    raw: string;
}

export function stripChunkHeader(text: string): string {
    if (text.startsWith("[")) {
        const idx = text.indexOf("\n");
        if (idx !== -1) {
            return text.slice(idx + 1);
        }
        return "";
    }
    return text;
}

export function splitSpeakerLine(line: string): DialogueLine {
    const colonSpaceIdx = line.indexOf(": ");
    if (colonSpaceIdx > 0 && colonSpaceIdx < 32) {
        return {
            speaker: line.slice(0, colonSpaceIdx),
            speech: line.slice(colonSpaceIdx + 2),
            raw: line,
        };
    }
    const fullColonIdx = line.indexOf("\uff1a");
    if (fullColonIdx > 0 && fullColonIdx < 32) {
        return {
            speaker: line.slice(0, fullColonIdx),
            speech: line.slice(fullColonIdx + 1).trimStart(),
            raw: line,
        };
    }
    return { speaker: null, speech: line, raw: line };
}

/**
 * Splits a chunk's dialogue body (excluding the `[story | chars]` metadata header)
 * into logical utterance lines, preserving continuation lines under their speaker.
 */
export function parseDialogueLines(text: string): DialogueLine[] {
    const body = stripChunkHeader(text);
    if (!body) return [];

    const rawLines = body.split("\n");
    const result: DialogueLine[] = [];

    for (let i = 0; i < rawLines.length; i++) {
        const trimmed = rawLines[i].trim();
        if (!trimmed) continue;

        const parsed = splitSpeakerLine(trimmed);
        if (parsed.speaker !== null || result.length === 0) {
            result.push(parsed);
        } else {
            const prev = result[result.length - 1];
            prev.speech = prev.speech ? `${prev.speech}\n${trimmed}` : trimmed;
            prev.raw = prev.raw ? `${prev.raw}\n${trimmed}` : trimmed;
        }
    }

    return result;
}
