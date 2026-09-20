import ReceiptEntryPage from "./ReceiptEntryPage";
import PriceCoverageSection from "./PriceCoverageSection";
import PricesSection from "./PricesSection";

export default function PricesPage() {
  return (
    <div className="grid">
      <ReceiptEntryPage />
      <details className="panel">
        <summary>Price coverage</summary>
        <PriceCoverageSection embedded />
      </details>
      <details className="panel">
        <summary>All recorded prices</summary>
        <PricesSection embedded />
      </details>
    </div>
  );
}
