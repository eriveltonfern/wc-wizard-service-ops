import { createFileRoute, redirect } from "@tanstack/react-router";
import { getToken } from "@/lib/api";
import { meQuery, homeFor } from "@/lib/auth";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "WCCheck 2.0" },
      { name: "description", content: "Gestão operacional de limpeza e manutenção de banheiros." },
      { property: "og:title", content: "WCCheck 2.0" },
      { property: "og:description", content: "Gestão operacional de limpeza e manutenção de banheiros." },
    ],
  }),
  beforeLoad: async ({ context }) => {
    if (!getToken()) throw redirect({ to: "/login" });
    try {
      const u = await context.queryClient.ensureQueryData(meQuery);
      throw redirect({ to: homeFor(u.role) });
    } catch (e) {
      if (e && typeof e === "object" && "isRedirect" in e) throw e;
      if (e instanceof Response) throw e;
      throw redirect({ to: "/login" });
    }
  },
  component: () => null,
});
