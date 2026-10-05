import React from "react";
import { noIndexPageMetadata } from "@/lib/seo-metadata";

export const generateMetadata = noIndexPageMetadata("blank");

export default function BlankPage() {
    return (
        <main className="min-h-screen bg-surface flex flex-col" />
    );
}
