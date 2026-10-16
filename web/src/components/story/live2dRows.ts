import type { SsePlayerNode } from "@/lib/sseWeb/player";
import type { IProcessedAction } from "@/types/story";

/**
 * How the Live2D player's nodes and a story list's rows follow each other: a node's row is the
 * one made from the same snippet of the scenario. `rows[node]` is the node's row (-1 when the
 * list has none); `nodeOfRow` takes a row back to its node.
 */
export interface Live2DRows {
    rows: number[];
    nodeOfRow: Map<number, number>;
}

export function live2dRows(actions: readonly IProcessedAction[] | undefined, nodes: readonly SsePlayerNode[] | null): Live2DRows {
    const rowOfSnippet = new Map<number, number>();
    actions?.forEach((act, idx) => {
        if (act.snippetIndex !== undefined) rowOfSnippet.set(act.snippetIndex, idx);
    });
    const rows = (nodes ?? []).map(node => rowOfSnippet.get(node.snippet) ?? -1);
    return { rows, nodeOfRow: new Map(rows.flatMap((row, node) => (row >= 0 ? [[row, node] as const] : []))) };
}

/** The row of the node playback is in; a node without a row leaves the last one before it marked. */
export function live2dActiveRow({ rows }: Live2DRows, node: number): number {
    return rows.slice(0, Math.min(node, rows.length - 1) + 1).findLast(row => row >= 0) ?? -1;
}
