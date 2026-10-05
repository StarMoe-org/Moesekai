"use client";
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { mdCheck } from "./icons";
import { isKeyboardEventComposing } from "@/lib/shortcuts";
import { OverlayParentContext, useOverlay } from "./useOverlay";

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
    const [activeKey, setActiveKey] = useState(() => items.find((item) => !item.disabled)?.key);
    const closeMenu = useCallback(() => {
        setOpen(false);
        anchorRef.current?.focus();
    }, []);
    const { overlayRef: menuRef, overlayContext, onFocusCapture, isTopOverlay } = useOverlay(open, closeMenu, { syncHistory: false, modal: false });
    const menuId = useId();
    const tabStopKey = items.some((item) => item.key === activeKey && !item.disabled) ? activeKey : items.find((item) => !item.disabled)?.key;

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
            if (!isTopOverlay()) return;
            const t = e.target as Node;
            if (menuRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
            setOpen(false);
        };
        document.addEventListener("pointerdown", onDown);
        return () => document.removeEventListener("pointerdown", onDown);
    }, [open, menuRef, isTopOverlay]);

    const onMenuKeyDown = (e: React.KeyboardEvent) => {
        if (!isTopOverlay() || !e.currentTarget.contains(e.target as Node) || e.defaultPrevented || isKeyboardEventComposing(e.nativeEvent)) return;
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            closeMenu();
            return;
        }
        if (e.key === "Tab") {
            e.stopPropagation();
            closeMenu();
            return;
        }
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
        e.preventDefault();
        const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? []);
        if (!nodes.length) return;
        const idx = nodes.indexOf(document.activeElement as HTMLElement);
        const next =
            e.key === "Home" ? 0 : e.key === "End" ? nodes.length - 1 : idx < 0 ? (e.key === "ArrowDown" ? 0 : nodes.length - 1) : (idx + (e.key === "ArrowDown" ? 1 : -1) + nodes.length) % nodes.length;
        nodes[next]?.focus();
    };

    return (
        <>
            {anchor({
                ref: anchorRef,
                onClick: () => {
                    setActiveKey(items.find((item) => !item.disabled)?.key);
                    setOpen((v) => !v);
                },
                "aria-haspopup": "menu",
                "aria-expanded": open,
                "aria-controls": menuId,
            })}
            {open &&
                pos &&
                createPortal(
                    <OverlayParentContext.Provider value={overlayContext}>
                    <div
                        ref={menuRef}
                        onFocusCapture={onFocusCapture}
                        id={menuId}
                        role="menu"
                        tabIndex={-1}
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
                                    tabIndex={item.key === tabStopKey ? 0 : -1}
                                    onFocus={() => setActiveKey(item.key)}
                                    aria-checked={item.selected === undefined ? undefined : item.selected}
                                    onClick={() => {
                                        item.onSelect?.();
                                        closeMenu();
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
                    </div>
                    </OverlayParentContext.Provider>,
                    document.body,
                )}
        </>
    );
}

export default Menu;
