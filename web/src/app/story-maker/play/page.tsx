import StoryMakerPlayClient from "./client";
import { pageMetadata } from "@/lib/seo-metadata";

export const generateMetadata = pageMetadata("story_maker_play");

export default function StoryMakerPlayPage() {
    return <StoryMakerPlayClient />;
}
