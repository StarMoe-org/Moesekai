import { Suspense } from "react";
import StorySearchClient from "./client";
import { pageMetadata } from "@/lib/seo-metadata";

export const generateMetadata = pageMetadata("story_search");

export default function StorySearchPage() {
    return (
        <Suspense fallback={null}>
            <StorySearchClient />
        </Suspense>
    );
}
