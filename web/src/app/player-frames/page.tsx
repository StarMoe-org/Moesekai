import PlayerFramesClient from "./client";
import { pageMetadata } from "@/lib/seo-metadata";

export const generateMetadata = pageMetadata("player_frames");

export default function PlayerFramesPage() {
    return <PlayerFramesClient />;
}
