import React, { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import BaseLayout from "@/layouts/BaseLayout";
import { Outlet, createRootRoute, useMatches } from "@tanstack/react-router";
import { analytics } from "@/helpers/analytics";
import { logger } from "@/helpers/logger";
import { Toaster } from "sonner";

export const RootRoute = createRootRoute({
  component: Root,
  beforeLoad: ({ location }) => {
    // Track page view using the safer analytics helper
    analytics.pageView(location.pathname, {
      params: location.search ? Object.fromEntries(new URLSearchParams(location.search)) : {},
    });

    // Debug log navigation with params to help diagnose routing issues
    try {
      const searchParams = location.search
        ? Object.fromEntries(new URLSearchParams(location.search))
        : {};
      logger.debug("Route beforeLoad", {
        path: location.pathname,
        search: searchParams,
        source: "RootRoute.beforeLoad",
      });
    } catch (e) {
      // Ensure logging never breaks navigation
      logger.error("Failed to log beforeLoad navigation params", e);
    }
  },
  errorComponent: function ErrorComponent({ error }) {
    const { toast } = useToast();
    const err = error instanceof Error ? error : new Error(String(error));

    useEffect(() => {
      logger.error("[ErrorComponent] Navigation error", err);

      // Track error events using the safer analytics helper
      analytics.track("navigation_error", {
        error_message: err.message,
        path: window.location.pathname,
      });

      toast({
        variant: "destructive",
        title: "Error",
        description: err.message,
      });
    }, [err, toast]);

    return <Root />;
  },
});

function Root(): React.JSX.Element {
  const matches = useMatches();
  const isFullScreenRoute = matches.some((match) => match.pathname === "/raining-letters");

  // Log resolved route with extracted params and search when route changes
  useEffect(() => {
    const leaf = matches[matches.length - 1];
    const pathname = leaf?.pathname ?? window.location.pathname;
    const search = Object.fromEntries(new URLSearchParams(window.location.search));

    // Attempt to read params from the leaf match if present
    // TanStack Router match objects have params, but type isn't exposed at this level
    const params: Record<string, unknown> =
      leaf &&
      typeof leaf === "object" &&
      "params" in leaf &&
      typeof leaf.params === "object" &&
      leaf.params !== null
        ? // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          (leaf.params as Record<string, unknown>)
        : {};

    logger.debug("Route navigated", {
      path: pathname,
      params,
      search,
      source: "Root",
    });
  }, [matches]);

  return (
    <>
      {isFullScreenRoute ? (
        <Outlet />
      ) : (
        <BaseLayout>
          <Outlet />
        </BaseLayout>
      )}
      <Toaster />
    </>
  );
}
