"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { uploadReceipt } from "@/app/actions/receipt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ReceiptUpload({
  orderNumber,
  token,
  remaining,
}: {
  orderNumber: string;
  token: string;
  remaining: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (remaining <= 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Ya subiste el máximo de comprobantes. Si hubo un problema, escribinos por WhatsApp.
      </p>
    );
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const form = event.currentTarget;
        const data = new FormData(form);
        data.set("orderNumber", orderNumber);
        data.set("token", token);

        startTransition(async () => {
          const result = await uploadReceipt(data);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          form.reset();
          toast.success("Comprobante recibido. Lo revisamos y te avisamos.");
          router.refresh();
        });
      }}
    >
      {error ? (
        <p className="border-destructive/40 text-destructive rounded-lg border p-3 text-sm">
          {error}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="file">Comprobante (JPG, PNG o PDF, hasta 5 MB)</Label>
        <Input id="file" name="file" type="file" accept="image/jpeg,image/png,application/pdf" required />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Subiendo…" : "Enviar comprobante"}
      </Button>
    </form>
  );
}
