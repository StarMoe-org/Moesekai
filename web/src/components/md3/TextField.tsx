"use client";
import React, { useCallback, useId, useRef, useState } from "react";
import { isKeyboardEventComposing } from "@/lib/shortcuts";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { mdCancel, mdErrorFill } from "./icons";

/* ==========================================================================
   M3 Text field: filled | outlined, with floating label, leading/trailing
   icons, prefix/suffix, supporting text, error state and character count.

   IME-safe: while an input method is composing (Chinese/Japanese/Korean),
   `onValueChange` is deferred until composition ends, and Escape/Enter are
   not acted upon. `onChange` (raw event) still fires for every keystroke.
   ========================================================================== */

export type TextFieldVariant = "filled" | "outlined";

export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
    variant?: TextFieldVariant;
    label?: string;
    /** Leading icon path. */
    icon?: string;
    /** Trailing icon path (ignored when `clearable` shows the clear button). */
    trailingIcon?: string;
    /** Custom trailing node (e.g. IconButton). Rendered after trailingIcon. */
    trailing?: React.ReactNode;
    prefixText?: string;
    suffixText?: string;
    supportingText?: React.ReactNode;
    errorText?: string;
    error?: boolean;
    /** Show a clear button when the field has a value. Requires `onValueChange`. */
    clearable?: boolean;
    clearLabel?: string;
    /** IME-aware value callback (preferred over onChange). */
    onValueChange?: (value: string) => void;
    /** Clear the value when Escape is pressed (IME-safe). Default true when clearable. */
    clearOnEscape?: boolean;
    /** Compact density (48px instead of 56px). */
    dense?: boolean;
    containerClassName?: string;
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
    {
        variant = "outlined",
        label,
        icon,
        trailingIcon,
        trailing,
        prefixText,
        suffixText,
        supportingText,
        errorText,
        error,
        clearable,
        clearLabel,
        onValueChange,
        clearOnEscape,
        dense,
        className,
        containerClassName,
        id,
        value,
        defaultValue,
        placeholder,
        disabled,
        required,
        maxLength,
        onChange,
        onKeyDown,
        onCompositionStart,
        onCompositionEnd,
        onFocus,
        onBlur,
        ...rest
    },
    ref,
) {
    const autoId = useId();
    const inputId = id ?? `tf-${autoId}`;
    const supportId = `${inputId}-support`;
    const isComposingRef = useRef(false);
    const [focused, setFocused] = useState(false);

    // Local mirror so the field stays responsive during IME composition even when
    // the parent only updates `value` after composition ends.
    const isControlled = value !== undefined;
    const [localValue, setLocalValue] = useState<string>(String(value ?? defaultValue ?? ""));
    const [prevValue, setPrevValue] = useState(value);
    if (isControlled && value !== prevValue) {
        setPrevValue(value);
        setLocalValue(String(value ?? ""));
    }
    const current = isControlled ? localValue : undefined;
    const [uncontrolledHasValue, setUncontrolledHasValue] = useState(Boolean(defaultValue));
    const populated = isControlled ? localValue.length > 0 : uncontrolledHasValue;
    const floated = focused || populated || Boolean(placeholder) || Boolean(prefixText);
    const isError = Boolean(error || errorText);
    const shouldClearOnEscape = clearOnEscape ?? Boolean(clearable);

    const emit = useCallback((next: string) => onValueChange?.(next), [onValueChange]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = e.target.value;
        if (isControlled) setLocalValue(next);
        else setUncontrolledHasValue(next.length > 0);
        onChange?.(e);
        if (!isComposingRef.current) emit(next);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const composing =
            isComposingRef.current ||
            isKeyboardEventComposing(e.nativeEvent) ||
            e.nativeEvent.isComposing ||
            e.key === "Process" ||
            (e as unknown as { keyCode?: number }).keyCode === 229;
        if (composing) {
            e.stopPropagation();
            return;
        }
        if (e.key === "Escape" && shouldClearOnEscape && (isControlled ? localValue : e.currentTarget.value)) {
            e.preventDefault();
            e.stopPropagation();
            if (isControlled) setLocalValue("");
            else {
                e.currentTarget.value = "";
                setUncontrolledHasValue(false);
            }
            emit("");
            return;
        }
        onKeyDown?.(e);
    };

    const handleClear = () => {
        if (isControlled) setLocalValue("");
        setUncontrolledHasValue(false);
        emit("");
    };

    const showClear = clearable && populated && !disabled;
    const height = dense ? "h-12" : "h-14";
    const filled = variant === "filled";

    const container = cn(
        "group/tf relative flex w-full items-center gap-0 transition-colors duration-150 ease-md3-standard",
        height,
        filled
            ? cn(
                  "rounded-t-md3-xs bg-surface-container-highest",
                  "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:transition-[height,background-color] after:duration-150",
                  isError
                      ? "after:h-[2px] after:bg-error"
                      : focused
                        ? "after:h-[2px] after:bg-primary"
                        : "after:h-px after:bg-on-surface-variant hover:after:bg-on-surface",
              )
            : cn(
                  "rounded-md3-xs border",
                  isError
                      ? cn("border-error", focused && "border-2")
                      : focused
                        ? "border-2 border-primary"
                        : "border-outline hover:border-on-surface",
              ),
        disabled && "pointer-events-none opacity-38",
        containerClassName,
    );

    const labelColor = isError ? "text-error" : focused ? "text-primary" : "text-on-surface-variant";

    return (
        <div className={cn("w-full", className)}>
            <div className={container}>
                {icon && <Icon path={icon} size={24} className="ml-3 text-on-surface-variant" />}
                <div className={cn("relative flex h-full min-w-0 flex-1 items-center px-4", icon && "pl-3")}>
                    {prefixText && (
                        <span className={cn("type-body-l text-on-surface-variant", filled && label && "pt-4")}>{prefixText}</span>
                    )}
                    <input
                        ref={ref}
                        id={inputId}
                        value={current}
                        defaultValue={isControlled ? undefined : defaultValue}
                        placeholder={floated ? placeholder : undefined}
                        disabled={disabled}
                        required={required}
                        maxLength={maxLength}
                        aria-invalid={isError || undefined}
                        aria-describedby={supportingText || errorText ? supportId : undefined}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        onCompositionStart={(e) => {
                            isComposingRef.current = true;
                            onCompositionStart?.(e);
                        }}
                        onCompositionEnd={(e) => {
                            isComposingRef.current = false;
                            const next = e.currentTarget.value;
                            if (isControlled) setLocalValue(next);
                            emit(next);
                            onCompositionEnd?.(e);
                        }}
                        onFocus={(e) => {
                            setFocused(true);
                            onFocus?.(e);
                        }}
                        onBlur={(e) => {
                            setFocused(false);
                            onBlur?.(e);
                        }}
                        className={cn(
                            "h-full w-full min-w-0 bg-transparent type-body-l text-on-surface caret-primary outline-none",
                            "placeholder:text-on-surface-variant",
                            filled && label && "pt-4",
                            !filled && "py-0",
                        )}
                        {...rest}
                    />
                    {suffixText && (
                        <span className={cn("type-body-l text-on-surface-variant", filled && label && "pt-4")}>{suffixText}</span>
                    )}
                    {label && (
                        <label
                            htmlFor={inputId}
                            className={cn(
                                "pointer-events-none absolute origin-left truncate transition-all duration-150 ease-md3-standard",
                                "max-w-[calc(100%-2rem)]",
                                filled
                                    ? floated
                                        ? "left-4 top-2 type-body-s"
                                        : "left-4 top-1/2 -translate-y-1/2 type-body-l"
                                    : floated
                                      ? cn("-top-2 left-3 bg-[var(--md3-tf-label-bg,var(--md-sys-color-surface))] px-1 type-body-s")
                                      : "left-4 top-1/2 -translate-y-1/2 type-body-l",
                                labelColor,
                            )}
                        >
                            {label}
                            {required && " *"}
                        </label>
                    )}
                </div>
                {isError && !showClear && <Icon path={mdErrorFill} size={24} className="mr-3 text-error" />}
                {showClear ? (
                    <button
                        type="button"
                        onClick={handleClear}
                        aria-label={clearLabel}
                        title={clearLabel}
                        className="state-layer focus-ring mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant"
                    >
                        <Icon path={mdCancel} size={24} />
                    </button>
                ) : (
                    trailingIcon && !isError && <Icon path={trailingIcon} size={24} className="mr-3 text-on-surface-variant" />
                )}
                {trailing}
            </div>
            {(supportingText || errorText || maxLength) && (
                <div id={supportId} className={cn("flex gap-4 px-4 pt-1 type-body-s", isError ? "text-error" : "text-on-surface-variant")}>
                    <span className="flex-1">{errorText || supportingText}</span>
                    {maxLength && isControlled && (
                        <span>
                            {localValue.length}/{maxLength}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
});

export default TextField;
