import InteractionsClient from "./client";
import { withPageBreadcrumb } from "@/lib/seo-metadata";

const Page = withPageBreadcrumb("mysekai_interactions", () => <InteractionsClient />);
export const generateMetadata = Page.generateMetadata;
export default Page;
