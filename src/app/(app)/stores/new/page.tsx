import { StoreForm } from "@/components/StoreForm";
import { PageHeader } from "@/components/ui";

export default function NewStore() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nueva tienda" />
      <StoreForm />
    </div>
  );
}
