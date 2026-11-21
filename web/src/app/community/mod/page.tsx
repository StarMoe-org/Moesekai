import { Suspense } from "react";
import CommunityModClient from "./client";
import { noIndexPageMetadata } from "@/lib/seo-metadata";
import { LoadingIndicator } from "@/components/md3";

export const generateMetadata = noIndexPageMetadata("community_mod");

export default function CommunityModPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-[50vh] items-center justify-center">
                    <LoadingIndicator />
                </div>
            }
        >
            <CommunityModClient />
        </Suspense>
    );
}
