import { SharedRecipe } from '../types';

export const MY_RECIPES_KEY = 'smartfridge-my-recipes';

export const loadMyRecipes = (): SharedRecipe[] => [];

export const saveMyRecipes = (_recipes: SharedRecipe[]) => {};

export const addMyRecipe = (recipe: SharedRecipe): SharedRecipe[] => [recipe];

export const hasMyRecipeNamed = (_name: string): boolean => false;
