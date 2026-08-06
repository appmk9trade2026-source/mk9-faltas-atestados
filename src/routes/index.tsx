import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    // Redireciona para o dashboard se estiver autenticado, ou para o auth se não
    throw redirect({
      to: "/dashboard",
    });
  },
});
