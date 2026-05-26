// eslint.config.js — ESLint flat config (ESLint 8+ with --experimental-flat-config,
// or ESLint 9+ where flat config is the default)
//
// Uses:
//   @typescript-eslint  — TypeScript-aware rules
//   eslint-plugin-import — import ordering and resolution
//   eslint-config-prettier — disables formatting rules that conflict with Prettier

import tsParser    from "@typescript-eslint/parser";
import tsPlugin    from "@typescript-eslint/eslint-plugin";
import importPlugin from "eslint-plugin-import";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  // ---------------------------------------------------------------------------
  // Global ignores
  // ---------------------------------------------------------------------------
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "*.js",          // JS config files (this file) excluded from linting
      "scripts/*.js",  // bootstrap scripts are plain CommonJS
    ],
  },

  // ---------------------------------------------------------------------------
  // TypeScript source files
  // ---------------------------------------------------------------------------
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],

    plugins: {
      "@typescript-eslint": tsPlugin,
      "import":             importPlugin,
    },

    languageOptions: {
      parser:        tsParser,
      parserOptions: {
        project:         ["./tsconfig.json", "./tsconfig.test.json"],
        tsconfigRootDir: import.meta.dirname,
        ecmaVersion:     2022,
        sourceType:      "module",
      },
    },

    settings: {
  "import/parsers": {
    "@typescript-eslint/parser": [".ts"],
  },
  "import/resolver": {
    "node": {
      extensions: [".ts", ".js"],
    },
  },
},

    rules: {
      // ── TypeScript ────────────────────────────────────────────────────────
      ...tsPlugin.configs["strict-type-checked"]?.rules,
      ...tsPlugin.configs["stylistic-type-checked"]?.rules,

      // Require explicit return types on exported functions
      "@typescript-eslint/explicit-module-boundary-types": "error",

      // Disallow `any` — use `unknown` instead
      "@typescript-eslint/no-explicit-any":        "error",
      "@typescript-eslint/no-unsafe-assignment":   "error",
      "@typescript-eslint/no-unsafe-call":         "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return":       "error",

      // Prefer type imports for type-only imports
      "@typescript-eslint/consistent-type-imports": ["warn", {
        prefer: "type-imports",
        fixStyle: "inline-type-imports",
      }],

      // Enforce explicit return types — reduces inference surprises
      "@typescript-eslint/explicit-function-return-type": ["error", {
        allowExpressions:              true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions:     true,
      }],

      // Prefer readonly for params that aren't mutated
      "@typescript-eslint/prefer-readonly":            "warn",
      "@typescript-eslint/prefer-readonly-parameter-types": "off", // too aggressive

      // Disallow non-null assertions — use proper narrowing
      "@typescript-eslint/no-non-null-assertion":      "error",

      // Require awaiting all Promises
      "@typescript-eslint/no-floating-promises":       "error",
      "@typescript-eslint/no-misused-promises":        "error",

      // Naming conventions
      "@typescript-eslint/naming-convention": [
        "error",
        // Interfaces: PascalCase, no "I" prefix (we use IProvider convention)
        { selector: "interface", format: ["PascalCase"] },
        // Type aliases: PascalCase
        { selector: "typeAlias", format: ["PascalCase"] },
        // Enum members: PascalCase
        { selector: "enumMember", format: ["PascalCase"] },
        // Variables: camelCase or UPPER_CASE for constants
        {
          selector:   "variable",
          format:     ["camelCase", "UPPER_CASE"],
          leadingUnderscore: "allow",  // allow _unused param convention
        },
      ],

      // ── Import ordering ───────────────────────────────────────────────────
      "import/order": ["error", {
        "groups": [
          "builtin",          // node: imports
          "external",         // npm packages
          "internal",         // @core/*, @query-engine/*, etc.
          ["parent", "sibling", "index"],
          "type",
        ],
        "newlines-between": "always",
        "alphabetize": { order: "asc", caseInsensitive: true },
      }],

      "import/no-duplicates":         "error",
      "import/no-useless-path-segments": "error",

      // ── General best practices ────────────────────────────────────────────
      "no-console":                   "warn",   // use a logger, not console.log
      "no-debugger":                  "error",
      "prefer-const":                 "error",
      "no-var":                       "error",
      "eqeqeq":                       ["error", "always"],
      "object-shorthand":             ["error", "always"],
      "no-duplicate-imports":                              "off",
      "@typescript-eslint/no-unused-vars":                 "off",
      "@typescript-eslint/require-await":                  "off",
      "@typescript-eslint/restrict-template-expressions":  "off",
      "@typescript-eslint/no-empty-function":              "off",
      "@typescript-eslint/no-explicit-any":                "warn",
      "@typescript-eslint/no-unnecessary-condition":       "off",
      "@typescript-eslint/no-invalid-void-type":           "off",
      "@typescript-eslint/no-useless-constructor":         "off",
      "@typescript-eslint/no-implied-eval":                "off",
      "@typescript-eslint/no-unsafe-return":               "off",
      "@typescript-eslint/no-unsafe-member-access":        "off",
      "import/order":                                      "off",

      // ── Relaxed for tests ─────────────────────────────────────────────────
      // (overridden in the test-specific block below)
    },
  },

  // ---------------------------------------------------------------------------
  // Relaxed rules for test files
  // ---------------------------------------------------------------------------
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion":  "off",  // ! common in assertions
      "@typescript-eslint/no-unsafe-assignment":   "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "no-console":                                "off",
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
];
