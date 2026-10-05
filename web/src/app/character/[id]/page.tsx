import MainLayout from "@/components/MainLayout";
import { defineCharacterDetailClientPage } from "@/lib/seo-detail-metadata";
import CharacterDetailClient from "./client";
import { LoadingState } from "@/components/md3/Patterns";

const Page = defineCharacterDetailClientPage(CharacterDetailClient, {
    fallback: <LoadingState className="h-[50vh]" />,
    wrap: (children) => <MainLayout>{children}</MainLayout>,
});

export const generateMetadata = Page.generateMetadata;
export default Page;
