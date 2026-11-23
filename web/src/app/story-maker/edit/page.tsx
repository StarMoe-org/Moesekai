import StoryMakerEditClient from "./client";
import { pageMetadata } from "@/lib/seo-metadata";

export const generateMetadata = pageMetadata("story_maker_edit");

export default function StoryMakerEditPage() {
    return <StoryMakerEditClient />;
}
