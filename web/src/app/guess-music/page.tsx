import GuessMusicClient from "./client";
import { pageMetadata } from "@/lib/seo-metadata";

export const generateMetadata = pageMetadata("guess_music");

export default function GuessMusicPage() {
    return <GuessMusicClient />;
}
