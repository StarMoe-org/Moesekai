import StoryPlayerClient from "./client";
import { pageMetadata } from "@/lib/seo-metadata";

export const generateMetadata = pageMetadata("story_player");

export default function StoryPlayerPage() {
    return <StoryPlayerClient />;
}
