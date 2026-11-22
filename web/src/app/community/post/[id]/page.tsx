import { Suspense } from "react";
import CommunityPostClient from "./client";
import { generateCommunityPostMetadata } from "@/lib/seo-detail-metadata";
import { LoadingIndicator } from "@/components/md3";

export const generateMetadata = generateCommunityPostMetadata;

export default function CommunityPostPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-[50vh] items-center justify-center">
                    <LoadingIndicator />
                </div>
            }
        >
            <CommunityPostClient />
        </Suspense>
    );
}
