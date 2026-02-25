import type { QueryClient } from "@tanstack/react-query";

import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import type { trpc } from "@/utils/trpc";

import Header from "@/components/header";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import "../index.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isDesktop } from "@/lib/platform";
import { lazy, Suspense } from "react";

// Lazy-load Titlebar only on desktop so Tauri imports don't break web builds
const TitlebarDesktop = isDesktop
  ? lazy(() =>
      import("@/components/titlebar").then((m) => ({
        default: m.Titlebar,
      })),
    )
  : null;

export interface RouterAppContext {
  trpc: typeof trpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "file-organizer-2.0",
      },
      {
        name: "description",
        content: "file-organizer-2.0 is a web application",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function RootComponent() {
  return (
    <>
      {isDesktop && TitlebarDesktop && (
        <Suspense fallback={null}>
          <TitlebarDesktop />
        </Suspense>
      )}

      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <TooltipProvider>
          <div className={`h-svh overflow-hidden ${isDesktop ? "pt-10" : ""}`}>
            <Outlet />
          </div>
        </TooltipProvider>

        <Toaster />
      </ThemeProvider>
      {/* <TanStackRouterDevtools position="bottom-left" /> */}
      <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
    </>
  );
}
