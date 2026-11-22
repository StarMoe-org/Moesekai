import { Suspense } from "react";
import AccountClient from "./client";
import { pageMetadata } from "@/lib/seo-metadata";

export const generateMetadata = pageMetadata("account");

export default function AccountPage() {
    return (
        <Suspense fallback={null}>
            <AccountClient />
        </Suspense>
    );
}
