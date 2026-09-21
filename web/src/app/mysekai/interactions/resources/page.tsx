import ResourcesClient from "./client";
import { withPageBreadcrumb } from "@/lib/seo-metadata";

const Page = withPageBreadcrumb("mysekai_interaction_resources", () => <ResourcesClient />);
export const generateMetadata = Page.generateMetadata;
export default Page;
