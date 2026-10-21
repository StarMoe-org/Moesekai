import Live2DViewerClient from "./client";
import { pageMetadata } from "@/lib/seo-metadata";

export const generateMetadata = pageMetadata("live2d_viewer");

export default function Live2DViewerPage() {
    return <Live2DViewerClient />;
}
