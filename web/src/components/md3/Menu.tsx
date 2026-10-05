"use client";
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { mdCheck } from "./icons";

/* ==========================================================================
   M3 Menu: anchored popup list (surface-container, 4px radius… Expressive 16px).
   Uses a portal + fixed positioning so it escapes overflow:hidden parents.
   ========================================================================== */

export interface MenuItemDef {
    key: string;
    label: React.ReactNode;
    icon?: string;
    trailing?: React.ReactNode;
    selected?: boolean;
    disabled?: boolean;
    onSelect?: () => void;
    /** Render a divider before this item. */
    dividerBefore?: boolean;
}

export interface MenuProps {
    /** Render the anchor. Receives props to spread onto the trigger button. */
    anchor: (props: {
        ref: React.Ref<HTMLButtonElement>;
        onClick: () => void;
        "aria-haspopup": "menu";
        "aria-expanded": boolean;
        "aria-controls": string;
    }) => React.ReactNode;
    items: ReadonlyArray<MenuItemDef>;
    align?: "start" | "end";
    /** Match the menu width to the anchor (for select-style menus). */
    matchAnchorWidth?: boolean;
    className?: string;
}

export function Menu({ anchor, items, align = "start", matchAnchorWidth, className }: MenuProps) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number; width: number; flipUp: boolean } | null>(null);
    const anchorRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const menuId = useId();

    const place = useCallback(() => {
        const el = anchorRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const spaceBelow = window.innerHeight - r.bottom;
        const flipUp = spaceBelow < 240 && r.top > spaceBelow;
        setPos({ top: flipUp ? r.top : r.bottom, left: align === "end" ? r.right : r.left, width: r.width, flipUp });
    }, [align]);

    useLayoutEffect(() => {
        if (!open) return;
        place();
        const onScroll = () => place();
        window.addEventListener("resize", onScroll);
        window.addEventListener("scroll", onScroll, true);
        return () => {
            window.removeEventListener("resize", onScroll);
            window.removeEventListener("scroll", onScroll, true);
        };
    }, [open, place]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            const t = e.target as Node;
            if (menuRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
                anchorRef.current?.focus();
            }
        };
        document.addEventListener("pointerdown", onDown);
        document.addEventListener("keydown", onKey);
        // focus first enabled item
        requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus());
        return () => {
            document.removeEventListener("pointerdown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const onMenuKeyDown = (e: React.KeyboardEvent) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
        e.preventDefault();
        const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? []);
        if (!nodes.length) return;
        const idx = nodes.indexOf(document.activeElement as HTMLElement);
        const next =
            e.key === "Home" ? 0 : e.key === "End" ? nodes.length - 1 : (idx + (e.key === "ArrowDown" ? 1 : -1) + nodes.length) % nodes.length;
        nodes[next]?.focus();
    };

    return (
        <>
            {anchor({
                ref: anchorRef,
                onClick: () => setOpen((v) => !v),
                "aria-haspopup": "menu",
                "aria-expanded": open,
                "aria-controls": menuId,
            })}
            {open &&
                pos &&
                createPortal(
                    <div
                        ref={menuRef}
                        id={menuId}
                        role="menu"
                        onKeyDown={onMenuKeyDown}
                        className={cn(
                            "md3-menu-enter fixed z-[300] max-h-[min(60vh,420px)] min-w-[112px] max-w-[280px] overflow-y-auto rounded-md3-lg bg-surface-container py-2 text-on-surface shadow-elev-2",
                            className,
                        )}
                        style={{
                            top: pos.flipUp ? undefined : pos.top + 4,
                            bottom: pos.flipUp ? window.innerHeight - pos.top + 4 : undefined,
                            left: align === "start" ? pos.left : undefined,
                            right: align === "end" ? window.innerWidth - pos.left : undefined,
                            minWidth: matchAnchorWidth ? pos.width : undefined,
                            maxWidth: matchAnchorWidth ? Math.max(pos.width, 280) : undefined,
                            transformOrigin: pos.flipUp ? "bottom" : "top",
                        }}
                    >
                        {items.map((item) => (
                            <React.Fragment key={item.key}>
                                {item.dividerBefore && <div role="separator" className="my-2 h-px bg-outline-variant" />}
                                <button
                                    type="button"
                                    role={item.selected === undefined ? "menuitem" : "menuitemradio"}
                                    disabled={item.disabled}
                                    aria-checked={item.selected === undefined ? undefined : item.selected}
                                    onClick={() => {
                                        item.onSelect?.();
                                        setOpen(false);
                                        anchorRef.current?.focus();
                                    }}
                                    className={cn(
                                        "state-layer flex h-12 w-full cursor-pointer items-center gap-3 px-3 text-left type-label-l outline-none focus-visible:bg-on-surface/10",
                                        item.selected ? "bg-tertiary-container text-on-tertiary-container" : "text-on-surface",
                                        item.disabled && "pointer-events-none opacity-38",
                                    )}
                                >
                                    {item.icon ? (
                                        <Icon path={item.icon} size={24} className={item.selected ? "" : "text-on-surface-variant"} />
                                    ) : item.selected !== undefined ? (
                                        <span className="w-6">{item.selected && <Icon path={mdCheck} size={24} />}</span>
                                    ) : null}
                                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                    {item.trailing && <span className="text-on-surface-variant">{item.trailing}</span>}
                                </button>
                            </React.Fragment>
                        ))}
                    </div>,
                    document.body,
                )}
        </>
    );
}

export default Menu;
