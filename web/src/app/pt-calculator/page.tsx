import { pageMetadata } from "@/lib/seo-metadata";
import PtCalculatorClient from "./client";

export const generateMetadata = pageMetadata("pt_calculator");

export default function PtCalculatorPage() {
    return <PtCalculatorClient />;
}
