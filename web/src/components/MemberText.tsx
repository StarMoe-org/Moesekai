"use client";

import React from "react";
import ExternalLink from "@/components/ExternalLink";
import { MEMBER_LINKS } from "@/lib/team-links";

interface MemberTextProps {
    text: string | null | undefined;
    className?: string;
    linkClassName?: string;
    stripAtPrefix?: boolean;
}

export function renderMemberText(
    text: string | null | undefined,
    linkClassName: string = "text-primary hover:underline type-emphasized transition-colors",
    options?: { stripAtPrefix?: boolean },
): React.ReactNode {
    if (!text) return null;
    const stripAt = options?.stripAtPrefix ?? false;
    const keys = Object.keys(MEMBER_LINKS)
        .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .sort((a, b) => b.length - a.length);
    const pattern = `(@[^\\s@、,，/|]+|${keys.join("|")})`;
    const tokens = text.split(new RegExp(pattern, "g"));
    return tokens.map((token, index) => {
        const link = MEMBER_LINKS[token] || MEMBER_LINKS[`@${token}`] || (token.startsWith("@") ? MEMBER_LINKS[token.slice(1)] : undefined);
        const displayText = stripAt && token.startsWith("@") ? token.slice(1) : token;
        if (link) {
            return (
                <ExternalLink
                    key={index}
                    href={link}
                    target="_blank"
                    bypassLeave={true}
                    className={linkClassName}
                >
                    {displayText}
                </ExternalLink>
            );
        }
        return displayText;
    });
}

export default function MemberText({ text, className, linkClassName, stripAtPrefix }: MemberTextProps) {
    if (!text) return null;
    const content = renderMemberText(text, linkClassName, { stripAtPrefix });
    if (className) {
        return <span className={className}>{content}</span>;
    }
    return <>{content}</>;
}
