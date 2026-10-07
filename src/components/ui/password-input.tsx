"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n/client";
import { cn } from "@/lib/utils";

export function PasswordInput({
  className,
  showLabel,
  hideLabel,
  ...props
}: Omit<ComponentProps<"input">, "type" | "ref"> & {
  showLabel?: string;
  hideLabel?: string;
}) {
  const [visible, setVisible] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const field = input.current;
    const form = field?.form;
    const reset = () => {
      setVisible(false);
      field?.setCustomValidity("");
    };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, []);

  return (
    <div className="relative">
      <Input
        {...props}
        ref={input}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        type={visible ? "text" : "password"}
        className={cn("pr-11", className)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute inset-y-0 right-0 h-9 w-10"
        aria-label={
          visible
            ? (hideLabel ?? t("password.ocultar"))
            : (showLabel ?? t("password.mostrar"))
        }
        aria-controls={props.id}
        aria-pressed={visible}
        disabled={props.disabled}
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  );
}
