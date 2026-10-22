import Costume3dClient from "./client";
import { pageMetadata } from "@/lib/seo-metadata";

export const generateMetadata = pageMetadata("costume_3d");

export default function Costume3dPage() {
    return <Costume3dClient />;
}
