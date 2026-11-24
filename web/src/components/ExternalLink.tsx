
"use client";

import React from 'react';
import Link from "@/components/LocalizedLink";
import { MOESEKAI_BILIBILI_SPACE_URL, MEMBER_LINKS } from "@/lib/team-links";

interface ExternalLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
    href: string;
    className?: string;
    children: React.ReactNode;
    bypassLeave?: boolean;
}

const SAFE_DOMAINS = [
    'exmeaning.com',
    'pjsk.moe',
    // StarMoe's own services: the account (passport.star.moe) and StarMoe Connect (connect.star.moe).
    'star.moe',
];

const SAFE_URL_PREFIXES = Array.from(
    new Set([
        'https://space.bilibili.com/5441521',
        MOESEKAI_BILIBILI_SPACE_URL,
        ...Object.values(MEMBER_LINKS),
    ])
);

const isSafeTarget = (url: string): boolean => {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        const isSafeDomain = SAFE_DOMAINS.some(domain =>
            hostname === domain || hostname.endsWith('.' + domain)
        );
        if (isSafeDomain) return true;

        const normalizedUrl = (urlObj.origin + urlObj.pathname.replace(/\/+$/, '')).toLowerCase();
        return SAFE_URL_PREFIXES.some(prefix => {
            const normalizedPrefix = prefix.replace(/\/+$/, '').toLowerCase();
            return normalizedUrl === normalizedPrefix || normalizedUrl.startsWith(normalizedPrefix + '/');
        });
    } catch (_e) {
        return false;
    }
};

const ExternalLink: React.FC<ExternalLinkProps> = ({
    href,
    children,
    className,
    bypassLeave,
    onClick,
    ...props
}) => {
    const isAbsoluteUrl = href.startsWith('http://') || href.startsWith('https://');

    const isExternal = (url: string) => {
        if (!url) return false;
        if (bypassLeave) return false;

        if (isAbsoluteUrl) {
            return !isSafeTarget(url);
        }
        return false;
    };

    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        if (onClick) onClick(e);
        if (e.defaultPrevented) return;

        // If it's an external link requiring leave confirmation for human users
        if (isExternal(href)) {
            // Only intercept primary left-clicks without modifier keys
            if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                const encodedTarget = encodeURIComponent(href);
                window.open(`/leave?target=${encodedTarget}`, '_blank', 'noopener,noreferrer');
            }
        }
    };

    // For all absolute external links:
    // Render direct target href in HTML so search engines (SEO crawlers) read & index the destination URL directly.
    if (isAbsoluteUrl) {
        const defaultRel = props.target === '_blank' || !props.target ? (props.rel || 'noopener') : props.rel;
        return (
            <a
                href={href}
                className={className}
                target={props.target || '_blank'}
                rel={defaultRel}
                onClick={handleClick}
                {...props}
            >
                {children}
            </a>
        );
    }

    // Internal routes
    return (
        <Link href={href} className={className} onClick={onClick} {...props}>
            {children}
        </Link>
    );
};

export default ExternalLink;
