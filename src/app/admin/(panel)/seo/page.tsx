import { notFound } from "next/navigation";
import { EDITORIAL_TOOLS } from "@/config/editorial-tools";
import { requireCapabilityPage } from "@/lib/admin-guard";
import { KeywordCoverage } from "@/components/admin/keyword-coverage";
export default async function EditorialToolsPage() {
  await requireCapabilityPage("usuarios");
  if (!EDITORIAL_TOOLS.enabled) notFound();
  return (
    <section>
      <h1 className="mb-4 text-2xl font-semibold">Plan editorial y SEO</h1>
      <KeywordCoverage keywords={EDITORIAL_TOOLS.keywords} />
    </section>
  );
}
