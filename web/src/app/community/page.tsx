import { Suspense } from "react";
import CommunityFeedClient from "./client";
import { pageMetadata } from "@/lib/seo-metadata";
import { LoadingIndicator } from "@/components/md3";

export const generateMetadata = pageMetadata("community");

export default function CommunityPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-[50vh] items-center justify-center">
                    <LoadingIndicator />
                </div>
            }
        >
            <CommunityFeedClient />
        </Suspense>
    );
}
