"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Contact,
  GripVertical,
  ExternalLink,
  Landmark,
  LayoutDashboard,
  Menu,
  Package,
  Plug,
  RotateCcw,
  Settings,
  ShoppingBag,
  Star,
  Tags,
  Ticket,
  Truck,
  Users,
  X,
} from "lucide-react";
import { LogoutButton } from "@/components/admin/logout-button";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import {
  adminMenuStorageKey,
  isAdminSectionActive,
  moveAdminItem,
  normalizeAdminOrder,
  parseAdminOrder,
  type AdminNavigationItem,
} from "@/lib/admin-navigation";
import { TESTIDS } from "@/lib/testids";

const ICONS = {
  Activity,
  BookOpen,
  Contact,
  Landmark,
  LayoutDashboard,
  Package,
  Plug,
  RotateCcw,
  Settings,
  ShoppingBag,
  Star,
  Tags,
  Ticket,
  Truck,
  Users,
};

type NavigationProps = {
  userId: number;
  items: AdminNavigationItem[];
  homeHref: string;
};
const preferenceEvent = "admin-menu-change";
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(preferenceEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(preferenceEvent, onChange);
  };
}
export function AdminNavigation(props: NavigationProps) {
  // A different account cannot inherit an unsaved draft or an open drawer.
  return <NavigationContent key={props.userId} {...props} />;
}
function NavigationContent({ userId, items, homeHref }: NavigationProps) {
  const pathname = usePathname();
  const [temporaryOrder, setTemporaryOrder] = useState<string[] | null>(null);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const dragged = useRef<string | null>(null);
  const ids = items.map((item) => item.id);
  const storageKey = adminMenuStorageKey(userId);
  const preference = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(storageKey);
      } catch {
        return null;
      }
    },
    () => null
  );
  const saved = temporaryOrder ?? parseAdminOrder(preference, ids);

  function cancel() {
    setDraft(null);
    dragged.current = null;
    setNotice("");
  }
  function save() {
    const order = normalizeAdminOrder(draft, ids);
    setDraft(null);
    try {
      localStorage.setItem(storageKey, JSON.stringify(order));
      setTemporaryOrder(null);
      window.dispatchEvent(new Event(preferenceEvent));
      setNotice(t("panel.menu.guardado"));
    } catch {
      setTemporaryOrder(order);
      setNotice(t("panel.menu.sinAlmacenamiento"));
    }
  }
  const order = normalizeAdminOrder(draft ?? saved, ids);
  const content = (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Link
        href={homeHref}
        prefetch={false}
        onClick={() => {
          setOpen(false);
          cancel();
        }}
        className="text-lg font-semibold"
      >
        {t("panel.titulo")}
      </Link>
      <nav
        aria-label={t("panel.menu.navegacion")}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <ul className="grid gap-1">
          {order.map((id, index) => {
            const item = items.find((candidate) => candidate.id === id)!;
            const Icon = ICONS[item.icon];
            const active = isAdminSectionActive(pathname, item.href);
            return (
              <li
                key={id}
                draggable={draft !== null}
                onDragStart={(event) => {
                  if (!draft) return;
                  dragged.current = id;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", id);
                }}
                onDragEnd={() => {
                  dragged.current = null;
                }}
                onDragOver={(event) => {
                  if (draft && dragged.current) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draft && dragged.current)
                    setDraft(moveAdminItem(order, dragged.current, index));
                  dragged.current = null;
                }}
                className="flex items-center gap-1"
              >
                {draft ? (
                  <GripVertical
                    aria-hidden="true"
                    className="text-muted-foreground size-4 shrink-0"
                  />
                ) : null}
                <Link
                  href={item.href}
                  prefetch={false}
                  aria-current={active ? "page" : undefined}
                  data-testid={
                    item.id === "pedidos" ? TESTIDS.adminNavOrders : undefined
                  }
                  onClick={(event) => {
                    if (draft) event.preventDefault();
                    else setOpen(false);
                  }}
                  className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm ${active ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  <span>{item.label}</span>
                  {item.count ? (
                    <span
                      aria-label={t("panel.menu.pendientes", { n: item.count })}
                      className="ml-auto rounded-full border px-2 text-xs"
                    >
                      {item.count}
                    </span>
                  ) : null}
                </Link>
                {draft ? (
                  <div className="flex shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("panel.menu.subir", { item: item.label })}
                      disabled={index === 0}
                      onClick={() =>
                        setDraft(moveAdminItem(order, id, index - 1))
                      }
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("panel.menu.bajar", { item: item.label })}
                      disabled={index === order.length - 1}
                      onClick={() =>
                        setDraft(moveAdminItem(order, id, index + 1))
                      }
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="grid gap-2 border-t pt-3">
        {draft ? (
          <>
            <p className="text-muted-foreground text-xs">
              {t("panel.menu.ayuda")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={save}>
                {t("panel.menu.guardar")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={cancel}
              >
                {t("panel.menu.cancelar")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setDraft([...ids])}
              >
                {t("panel.menu.restaurar")}
              </Button>
            </div>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft(order);
              setNotice("");
            }}
          >
            {t("panel.menu.editar")}
          </Button>
        )}
        <p className="text-muted-foreground text-xs">{t("panel.menu.local")}</p>
        <p role="status" className="text-xs">
          {notice}
        </p>
        <Link
          href="/"
          prefetch={false}
          className="inline-flex items-center justify-center gap-2 text-sm underline underline-offset-4"
        >
          <ExternalLink aria-hidden="true" className="size-4" />
          {t("panel.menu.verTienda")}
        </Link>
        <LogoutButton />
      </div>
    </div>
  );
  return (
    <>
      <aside
        aria-label={t("panel.menu.navegacion")}
        className="s9-no-print bg-background sticky top-0 hidden h-dvh w-72 shrink-0 border-r p-5 lg:block"
      >
        {!open ? content : null}
      </aside>
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) cancel();
        }}
      >
        <Dialog.Trigger asChild>
          <Button
            type="button"
            variant="outline"
            className="s9-no-print fixed top-3 left-3 z-40 lg:hidden"
          >
            <Menu aria-hidden="true" className="size-4" />
            {t("panel.menu.abrir")}
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="s9-no-print fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="s9-no-print bg-background fixed inset-y-0 left-0 z-50 flex w-[min(94vw,22rem)] flex-col p-5 pt-14 shadow-xl">
            <Dialog.Title className="sr-only">
              {t("panel.menu.navegacion")}
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              {t("panel.menu.local")}
            </Dialog.Description>
            <Dialog.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-3 right-3"
                aria-label={t("panel.menu.cerrar")}
              >
                <X aria-hidden="true" className="size-5" />
              </Button>
            </Dialog.Close>
            {content}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
