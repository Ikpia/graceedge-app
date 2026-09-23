import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

const commonRules = {
  "array-callback-return": "error",
  curly: ["error", "multi-line"],
  eqeqeq: ["error", "always", { null: "ignore" }],
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
      varsIgnorePattern: "^_",
    },
  ],
  "object-shorthand": ["error", "always"],
  "prefer-const": ["error", { destructuring: "all" }],
};

export default [
  {
    ignores: ["node_modules/**", ".wrangler/**", "coverage/**"],
  },

  js.configs.recommended,

  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },
    rules: commonRules,
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
  },

  prettier,
];
