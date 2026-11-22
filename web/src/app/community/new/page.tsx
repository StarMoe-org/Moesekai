import { Suspense } from "react";
import NewPostClient from "./client";
import { noIndexPageMetadata } from "@/lib/seo-metadata";
import { LoadingIndicator } from "@/components/md3";

export const generateMetadata = noIndexPageMetadata("community_new");

export default function CommunityNewPostPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-[50vh] items-center justify-center">
                    <LoadingIndicator />
                </div>
            }
        >
            <NewPostClient />
        </Suspense>
    );
}
