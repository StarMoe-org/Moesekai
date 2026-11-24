"use client";

import React from "react";
import EntityCommunitySection from "./EntityCommunitySection";

interface CardCommunitySectionProps {
    cardId: number;
    className?: string;
}

export function CardCommunitySection({ cardId, className }: CardCommunitySectionProps) {
    return (
        <EntityCommunitySection
            targetType="card"
            targetId={cardId}
            className={className}
        />
    );
}

export default CardCommunitySection;
