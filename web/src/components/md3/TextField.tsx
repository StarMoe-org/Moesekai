"use client";
import React, { useCallback, useId, useImperativeHandle, useRef, useState } from "react";
import { isKeyboardEventComposing } from "@/lib/shortcuts";
import { useI18n } from "@/contexts/I18nContext";
import { cn, withOverrides } from "./cn";
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
        className,
        containerClassName,
        id,
        value,
        defaultValue,
        placeholder,
        disabled,
        readOnly,
        "aria-describedby": describedBy,
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
    const { t } = useI18n();
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);
    const committedCompositionRef = useRef<string | null>(null);
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
    const shouldClearOnEscape = !disabled && !readOnly && (clearOnEscape ?? Boolean(clearable));

    const emit = useCallback((next: string) => onValueChange?.(next), [onValueChange]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = e.target.value;
        if (isControlled) setLocalValue(next);
        else setUncontrolledHasValue(next.length > 0);
        onChange?.(e);
        if (!isComposingRef.current && !(e.nativeEvent as InputEvent).isComposing) {
            if (committedCompositionRef.current !== next) emit(next);
            committedCompositionRef.current = null;
        }
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
        if (disabled || readOnly || isComposingRef.current) return;
        if (isControlled) setLocalValue("");
        else if (inputRef.current) inputRef.current.value = "";
        setUncontrolledHasValue(false);
        committedCompositionRef.current = null;
        emit("");
        inputRef.current?.focus();
    };

    const showClear = clearable && populated && !disabled && !readOnly;
    const accessibleClearLabel = clearLabel ?? t("common.md3.clear");
    // 40px like Select and the segmented buttons; a filled field's inner label needs 48px.
    const height = variant === "filled" && label ? "h-12" : "h-10";
    const filled = variant === "filled";

    const container = withOverrides(
        "group/tf relative flex w-full items-center gap-0 transition-colors duration-150 ease-md3-standard",
        height,
        filled
            ? cn(
                  "rounded-md3-md bg-surface-container-high",
                  isError
                      ? "ring-2 ring-inset ring-error"
                      : focused
                        ? "ring-2 ring-inset ring-primary"
                        : "hover:bg-surface-container-highest",
              )
            : cn(
                  "rounded-md3-md border",
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
        <div className={withOverrides("w-full", className)}>
            <div className={container}>
                {icon && <Icon path={icon} size={20} className="ml-3 text-on-surface-variant" />}
                <div className={cn("relative flex h-full min-w-0 flex-1 items-center px-3", icon && "pl-2")}>
                    {prefixText && (
                        <span className={cn("type-body-m text-on-surface-variant", filled && label && "pt-4")}>{prefixText}</span>
                    )}
                    <input
                        ref={inputRef}
                        id={inputId}
                        value={current}
                        defaultValue={isControlled ? undefined : defaultValue}
                        placeholder={floated ? placeholder : undefined}
                        disabled={disabled}
                        readOnly={readOnly}
                        required={required}
                        maxLength={maxLength}
                        aria-invalid={isError || undefined}
                        aria-describedby={[describedBy, supportingText || errorText || maxLength ? supportId : undefined].filter(Boolean).join(" ") || undefined}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        onCompositionStart={(e) => {
                            isComposingRef.current = true;
                            committedCompositionRef.current = null;
                            onCompositionStart?.(e);
                        }}
                        onCompositionEnd={(e) => {
                            isComposingRef.current = false;
                            const next = e.currentTarget.value;
                            if (isControlled) setLocalValue(next);
                            else setUncontrolledHasValue(next.length > 0);
                            committedCompositionRef.current = next;
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
                            "h-full w-full min-w-0 bg-transparent text-on-surface caret-primary outline-none",
                            "type-body-m",
                            "placeholder:text-on-surface-variant",
                            filled && label && "pt-4",
                            !filled && "py-0",
                        )}
                        {...rest}
                    />
                    {suffixText && (
                        <span className={cn("type-body-m text-on-surface-variant", filled && label && "pt-4")}>{suffixText}</span>
                    )}
                    {label && (
                        <label
                            htmlFor={inputId}
                            className={cn(
                                "pointer-events-none absolute origin-left truncate transition-all duration-150 ease-md3-standard",
                                "max-w-[calc(100%-2rem)]",
                                filled
                                    ? floated
                                        ? "left-3 top-1.5 type-body-s"
                                        : "left-3 top-1/2 -translate-y-1/2 type-body-m"
                                    : floated
                                      ? cn("-top-2 left-2 bg-[var(--md3-tf-label-bg,var(--md-sys-color-surface))] px-1 type-body-s")
                                      : "left-3 top-1/2 -translate-y-1/2 type-body-m",
                                labelColor,
                            )}
                        >
                            {label}
                            {required && " *"}
                        </label>
                    )}
                </div>
                {isError && !showClear && <Icon path={mdErrorFill} size={20} className="mr-3 text-error" />}
                {showClear ? (
                    <button
                        type="button"
                        onClick={handleClear}
                        aria-label={accessibleClearLabel}
                        title={accessibleClearLabel}
                        className="state-layer focus-ring mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant"
                    >
                        <Icon path={mdCancel} size={20} />
                    </button>
                ) : (
                    trailingIcon && !isError && <Icon path={trailingIcon} size={20} className="mr-3 text-on-surface-variant" />
                )}
                {trailing}
            </div>
            {(supportingText || errorText || maxLength) && (
                <div id={supportId} className={cn("flex gap-4 px-3 pt-1 type-body-s", isError ? "text-error" : "text-on-surface-variant")}>
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
