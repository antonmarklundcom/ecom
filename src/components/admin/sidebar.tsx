"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  Activity,
  BookOpen,
  ArrowDown,
  ArrowUp,
  Banknote,
  Boxes,
  ChevronRight,
  ClipboardList,
  GripVertical,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Package,
  Plug,
  RotateCcw,
  Settings,
  ShoppingBag,
  Tags,
  Ticket,
  Truck,
  Users,
  UsersRound,
} from "lucide-react";

import { LogoutButton } from "@/components/admin/logout-button";
import {
  isActiveAdminSection,
  orderedAdminMenu,
  type AdminMenuItem,
} from "@/components/admin/menu";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

const icons = {
  dashboard: LayoutDashboard,
  orders: ClipboardList,
  products: Package,
  reviews: MessageSquare,
  returns: RotateCcw,
  customers: UsersRound,
  coupons: Ticket,
  activity: Activity,
  categories: Tags,
  shipping: Truck,
  bank: Banknote,
  settings: Settings,
  integrations: Plug,
  users: Users,
  guide: BookOpen,
};
const storageEvent = "ecom-admin-menu-change";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(storageEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(storageEvent, callback);
  };
}
const serverSnapshot = () => null;

export function AdminWorkspace({
  userId,
  items,
  children,
}: {
  userId: number;
  items: AdminMenuItem[];
  children: ReactNode;
}) {
  return (
    <WorkspaceContent key={userId} userId={userId} items={items}>
      {children}
    </WorkspaceContent>
  );
}

function WorkspaceContent({
  userId,
  items,
  children,
}: {
  userId: number;
  items: AdminMenuItem[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const storageKey = `ecom:admin-menu:v1:${userId}`;
  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  }, [storageKey]);
  const saved = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const ordered = orderedAdminMenu(items, saved);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AdminMenuItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const dragged = useRef<string | null>(null);
  const displayed = editing
    ? orderedAdminMenu(items, JSON.stringify(draft.map((item) => item.href)))
    : ordered;
  const current = items.find((item) =>
    isActiveAdminSection(pathname, item.href)
  );

  function move(href: string, destination: number) {
    const from = displayed.findIndex((item) => item.href === href);
    if (
      from < 0 ||
      destination < 0 ||
      destination >= displayed.length ||
      from === destination
    )
      return;
    const next = [...displayed];
    const [item] = next.splice(from, 1);
    next.splice(destination, 0, item!);
    setDraft(next);
    setFeedback(
      t("panel.menu.moved", { nombre: item!.label, n: destination + 1 })
    );
  }

  const navigation = (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={items[0]?.href ?? "/admin/pedidos"}
          className="flex items-center gap-2 font-semibold"
          onClick={() => setDrawerOpen(false)}
        >
          <ShoppingBag className="size-5" aria-hidden="true" />
          {t("panel.titulo")}
        </Link>
        {!editing ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(ordered);
              setFeedback(null);
              setEditing(true);
            }}
          >
            {t("panel.menu.edit")}
          </Button>
        ) : null}
      </div>
      {editing ? (
        <p className="text-muted-foreground text-xs">
          {t("panel.menu.editHelp")}
        </p>
      ) : null}
      <nav
        aria-label={t("panel.menu.label")}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <ul className="space-y-1">
          {displayed.map((item, index) => {
            const Icon = icons[item.icon];
            const active = isActiveAdminSection(pathname, item.href);
            return (
              <li
                key={item.href}
                draggable={editing}
                onDragStart={(event) => {
                  dragged.current = item.href;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", item.href);
                }}
                onDragEnd={() => {
                  dragged.current = null;
                }}
                onDragOver={(event) => {
                  if (editing) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (editing && dragged.current) move(dragged.current, index);
                  dragged.current = null;
                }}
              >
                {editing ? (
                  <div className="bg-muted/50 flex items-center gap-2 rounded-lg p-2">
                    <GripVertical
                      className="text-muted-foreground size-4 shrink-0 cursor-grab"
                      aria-hidden="true"
                    />
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-sm">{item.label}</span>
                    <div className="flex shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        disabled={index === 0}
                        aria-label={t("panel.menu.up", { nombre: item.label })}
                        onClick={() => move(item.href, index - 1)}
                      >
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        disabled={index === displayed.length - 1}
                        aria-label={t("panel.menu.down", {
                          nombre: item.label,
                        })}
                        onClick={() => move(item.href, index + 1)}
                      >
                        <ArrowDown aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Link
                    href={item.href}
                    data-testid={item.testId}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                      active
                        ? "bg-primary text-primary-foreground font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1">{item.label}</span>
                    {active ? (
                      <ChevronRight
                        className="size-4 shrink-0"
                        aria-hidden="true"
                      />
                    ) : null}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      {editing ? (
        <div className="grid gap-2">
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              onClick={() => {
                try {
                  window.localStorage.setItem(
                    storageKey,
                    JSON.stringify(displayed.map((item) => item.href))
                  );
                  window.dispatchEvent(new Event(storageEvent));
                  setEditing(false);
                  setFeedback(t("panel.menu.saved"));
                } catch {
                  setFeedback(t("panel.menu.saveError"));
                }
              }}
            >
              {t("panel.menu.save")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => {
                setEditing(false);
                setDraft([]);
                setFeedback(null);
              }}
            >
              {t("panel.menu.cancel")}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto whitespace-normal"
            onClick={() => {
              setDraft(items);
              setFeedback(t("panel.menu.restoreHelp"));
            }}
          >
            <RotateCcw aria-hidden="true" />
            {t("panel.menu.restore")}
          </Button>
        </div>
      ) : null}
      {feedback ? (
        <p role="status" className="text-xs">
          {feedback}
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">{t("panel.menu.storage")}</p>
      <div className="border-border flex items-center justify-between border-t pt-3">
        <Link
          href="/"
          className="text-muted-foreground flex items-center gap-2 text-xs hover:underline"
        >
          <Boxes className="size-4" aria-hidden="true" />
          {t("panel.menu.store")}
        </Link>
        <LogoutButton />
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh print:block">
      <a
        href="#admin-content"
        className="bg-background fixed top-2 left-2 z-50 rounded-lg p-3 not-focus:sr-only print:hidden"
      >
        {t("panel.menu.skip")}
      </a>
      <aside className="border-border bg-background sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r lg:flex print:hidden">
        {navigation}
      </aside>
      <div className="bg-muted/20 print:bg-background flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-background flex items-center gap-3 border-b px-4 py-3 print:hidden">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="lg:hidden"
                aria-label={t("panel.menu.open")}
              >
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[min(90vw,22rem)] gap-0 overflow-y-auto lg:hidden print:hidden"
            >
              <SheetHeader className="border-border border-b pr-12">
                <SheetTitle>{t("panel.menu.label")}</SheetTitle>
                <SheetDescription>
                  {t("panel.menu.mobileHelp")}
                </SheetDescription>
              </SheetHeader>
              {navigation}
            </SheetContent>
          </Sheet>
          <span className="text-sm font-medium">
            {current?.label ?? t("panel.titulo")}
          </span>
        </header>
        <main
          id="admin-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 outline-none sm:px-6 print:m-0 print:max-w-none print:p-0"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
