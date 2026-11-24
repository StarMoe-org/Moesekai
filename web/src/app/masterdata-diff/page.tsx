import { pageMetadata } from "@/lib/seo-metadata";
import MasterdataDiffClient from "./client";

export const generateMetadata = pageMetadata("masterdata_diff");

export default function MasterdataDiffPage() {
    return <MasterdataDiffClient />;
}
