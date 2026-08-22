import { defineConfig } from "eslint/config";
import tseslint from "@electron-toolkit/eslint-config-ts";
import eslintConfigPrettier from "@electron-toolkit/eslint-config-prettier";
import eslintPluginReact from "eslint-plugin-react";
import eslintPluginReactHooks from "eslint-plugin-react-hooks";
import eslintPluginReactRefresh from "eslint-plugin-react-refresh";

export default defineConfig(
    { ignores: ["**/node_modules", "**/dist", "**/out"] },
    tseslint.configs.recommended,
    eslintPluginReact.configs.flat.recommended,
    eslintPluginReact.configs.flat["jsx-runtime"],
    {
        settings: {
            react: {
                version: "detect",
            },
        },
    },
    {
        files: ["**/*.{ts,tsx}"],
        plugins: {
            "react-hooks": eslintPluginReactHooks,
            "react-refresh": eslintPluginReactRefresh,
        },
        rules: {
            ...eslintPluginReactHooks.configs.recommended.rules,
            ...eslintPluginReactRefresh.configs.vite.rules,
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],
        },
    },
    {
        files: ["**/*.tsx"],
        rules: {
            "@typescript-eslint/explicit-function-return-type": "off",
        },
    },
    eslintConfigPrettier,
    {
        // Formatting is `npm run format`, not a lint result. Reported here it was 1700 warnings
        // nobody acted on, which buries the ones that mean something.
        rules: {
            "prettier/prettier": "off",
        },
    }
);
