import React from "react";

interface ColorPreviewProps {
    colorCode: string;
    size?: number;
    className?: string;
}

export default function ColorPreview({ colorCode, size = 24, className = "" }: ColorPreviewProps) {
    // Ensure color code starts with #
    const color = colorCode.startsWith("#") ? colorCode : `#${colorCode}`;

    return (
        <div
            className={`rounded-full border border-outline-variant shadow-elev-1 ${className}`}
            style={{
                backgroundColor: color,
                width: size,
                height: size,
            }}
            title={color}
            aria-label={`Color preview: ${color}`}
        />
    );
}
