import GachaSimulatorClient from "./client";
import { pageMetadata } from "@/lib/seo-metadata";

export const generateMetadata = pageMetadata("gacha_simulator");

export default function GachaSimulatorPage() {
    return <GachaSimulatorClient />;
}
