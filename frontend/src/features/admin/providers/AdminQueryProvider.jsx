import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

const FIVE_MINUTES = 5 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;

function createAdminQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: FIVE_MINUTES,
        gcTime: TEN_MINUTES,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function AdminQueryProvider({ children }) {
  const [queryClient] = useState(createAdminQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
