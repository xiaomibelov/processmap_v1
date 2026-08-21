import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchRecipes,
  fetchIngredients,
  createRecipe,
  calculateRecipe,
} from "./recipeApi.js";

const RECIPES_KEY = ["recipes"];
const INGREDIENTS_KEY = ["ingredients"];

export function useRecipes() {
  return useQuery({
    queryKey: RECIPES_KEY,
    queryFn: fetchRecipes,
  });
}

export function useIngredients() {
  return useQuery({
    queryKey: INGREDIENTS_KEY,
    queryFn: fetchIngredients,
  });
}

export function useCreateRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createRecipe,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECIPES_KEY });
    },
  });
}

export function useCalculateRecipe() {
  return useMutation({
    mutationFn: calculateRecipe,
  });
}
