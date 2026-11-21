"use client";

import { useCommunitySession } from "@/lib/community-session";
import { useMoesekaiAccount, type MoesekaiUser } from "@/lib/moesekai-account";
import CommunityAvatar from "@/components/community/CommunityAvatar";

export interface PassportAvatarUser extends Pick<MoesekaiUser, "name" | "avatar"> {
    avatarCardId?: number | null;
    avatarCardTrained?: boolean;
}

/**
 * The StarMoe Passport's unified avatar:
 * Uses the user's StarMoe Community card-face avatar when configured (updating live site-wide
 * via useCommunitySession), falling back to the Passport avatar URL or initial letter. Fills its box.
 */
export default function PassportAvatar({
    user,
    className,
}: {
    user: PassportAvatarUser;
    className?: string;
}) {
    const account = useMoesekaiAccount();
    const isSignedIn = account.status === "signed-in";
    const session = useCommunitySession({ eager: isSignedIn });

    const profile = session.authenticated ? session.profile : null;
    const avatarCardId =
        profile && profile.avatar_card_id !== undefined
            ? profile.avatar_card_id
            : (user.avatarCardId ?? null);
    const avatarCardTrained =
        profile && profile.avatar_card_id !== undefined
            ? Boolean(profile.avatar_card_trained)
            : Boolean(user.avatarCardTrained);

    return (
        <CommunityAvatar
            displayName={user.name}
            avatarUrl={profile?.avatar_url || user.avatar}
            avatarCardId={avatarCardId}
            avatarCardTrained={avatarCardTrained}
            sizeClassName="h-full w-full"
            textClassName="type-label-l"
            className={className}
        />
    );
}
