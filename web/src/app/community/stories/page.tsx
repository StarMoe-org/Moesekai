import { Suspense } from "react";
import CommunityStoriesClient from "./client";
import { pageMetadata } from "@/lib/seo-metadata";
import { LoadingIndicator } from "@/components/md3";

export const generateMetadata = pageMetadata("community_stories");

export default function CommunityStoriesPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-[50vh] items-center justify-center">
                    <LoadingIndicator />
                </div>
            }
        >
            <CommunityStoriesClient />
        </Suspense>
    );
}
