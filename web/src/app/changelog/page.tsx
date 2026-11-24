import ChangelogClient from "./client";
import { getChangelogEntries } from "@/lib/changelog";
import { pageMetadata } from "@/lib/seo-metadata";

export const generateMetadata = pageMetadata("changelog");

export default function ChangelogPage() {
    return <ChangelogClient entries={getChangelogEntries()} />;
}
