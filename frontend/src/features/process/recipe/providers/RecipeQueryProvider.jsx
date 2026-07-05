import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

const ONE_MINUTE = 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;

function createRecipeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: ONE_MINUTE,
        gcTime: FIVE_MINUTES,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function RecipeQueryProvider({ children }) {
  const [queryClient] = useState(createRecipeQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
