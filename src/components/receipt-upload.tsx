"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { uploadReceipt } from "@/app/actions/receipt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";

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
      <p className="text-muted-foreground text-sm">{t("pedido.subirComprobante.maximo")}</p>
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
          toast.success(t("pedido.subirComprobante.recibido"));
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
        <Label htmlFor="file">{t("pedido.subirComprobante.campo")}</Label>
        <Input id="file" name="file" type="file" accept="image/jpeg,image/png,application/pdf" required />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? t("pedido.subirComprobante.enviando") : t("pedido.subirComprobante.enviar")}
      </Button>
    </form>
  );
}
