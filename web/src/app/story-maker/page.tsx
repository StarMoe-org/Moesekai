import StoryMakerClient from "./client";
import { pageMetadata } from "@/lib/seo-metadata";

export const generateMetadata = pageMetadata("story_maker");

export default function StoryMakerPage() {
    return <StoryMakerClient />;
}
