import { Suspense } from "react";
import StarMoeCallbackClient from "./client";
import { noIndexRouteMetadata } from "@/lib/seo-metadata";

export const generateMetadata = noIndexRouteMetadata("/auth/starmoe/callback", "StarMoe Pass");

export default function StarMoeCallbackPage() {
    return (
        <Suspense fallback={null}>
            <StarMoeCallbackClient />
        </Suspense>
    );
}
