import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  {
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "public/buildInfo.js",
    ],
  },
  {
    files: ["src/**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2024,
        React: "readonly",
      },
    },
    plugins: {
      js,
      "react-hooks": reactHooks,
    },
    rules: {
      "no-undef": "error",
    },
  },
];
