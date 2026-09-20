import ReceiptEntryPage from "./ReceiptEntryPage";
import PriceCoverageSection from "./PriceCoverageSection";
import PricesSection from "./PricesSection";
import ReceiptsSection from "./ReceiptsSection";

export default function PricesPage() {
  return (
    <div className="grid">
      <ReceiptEntryPage />
      <details className="panel">
        <summary>Price coverage</summary>
        <PriceCoverageSection embedded />
      </details>
      <details className="panel">
        <summary>Shopping trips</summary>
        <ReceiptsSection embedded />
      </details>
      <details className="panel">
        <summary>All recorded prices</summary>
        <PricesSection embedded />
      </details>
    </div>
  );
}
