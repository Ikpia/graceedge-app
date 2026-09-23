import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const commonRules = {
  "array-callback-return": "error",
  curly: ["error", "multi-line"],
  eqeqeq: ["error", "always", { null: "ignore" }],
  "no-console": ["warn", { allow: ["warn", "error"] }],
  "no-duplicate-imports": "error",
  "no-else-return": ["error", { allowElseIf: false }],
  "no-empty": ["error", { allowEmptyCatch: true }],
  "no-implicit-coercion": "error",
  "no-return-await": "error",
  "no-template-curly-in-string": "error",
  "no-undef": "error",
  "no-unneeded-ternary": "error",
  "no-unused-vars": [
    "warn",
    {
      argsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
      varsIgnorePattern: "^(React|_)",
    },
  ],
  "object-shorthand": ["error", "always"],
  "prefer-const": ["error", { destructuring: "all" }],
};

export default [
  {
    ignores: ["node_modules/**", "dist/**", ".vite/**", "coverage/**"],
  },

  js.configs.recommended,

  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2024,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...commonRules,
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      "jsx-a11y/media-has-caption": "off",
      "react/prop-types": "off",
    },
  },

  {
    files: ["vite.config.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },
  },

  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx}"],
  })),

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
    },
  },

  prettier,
];
