"use client";

import { cn } from "@/components/md3";
import type { MoesekaiUser } from "@/lib/moesekai-account";

/** The StarMoe Passport's avatar, or the first letter of the name on the primary colour. Fills its box. */
export default function PassportAvatar({ user, className }: { user: Pick<MoesekaiUser, "name" | "avatar">; className?: string }) {
    if (user.avatar) {
        return <img src={user.avatar} alt="" className={cn("h-full w-full object-cover", className)} referrerPolicy="no-referrer" />;
    }
    return (
        <span aria-hidden className={cn("flex h-full w-full items-center justify-center bg-primary type-label-l text-on-primary", className)}>
            {Array.from(user.name)[0]?.toUpperCase() ?? "?"}
        </span>
    );
}
