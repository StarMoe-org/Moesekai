import { Suspense } from "react";
import CommunityUserProfileClient from "./client";
import { buildLocalizedMetadata, getRequestSeoLocale, noIndexRobots } from "@/lib/seo-metadata";
import { getPageSeo } from "@/lib/seo-keywords";
import { LoadingIndicator } from "@/components/md3";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const locale = await getRequestSeoLocale();
    const seo = getPageSeo("community_user", locale);

    return buildLocalizedMetadata({
        locale,
        title: seo.title,
        description: seo.description,
        path: `/community/u/${encodeURIComponent(id)}/`,
        robots: noIndexRobots(),
    });
}

export default function CommunityUserProfilePage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-[50vh] items-center justify-center">
                    <LoadingIndicator />
                </div>
            }
        >
            <CommunityUserProfileClient />
        </Suspense>
    );
}
