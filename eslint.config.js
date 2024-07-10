import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";


export default [
  {files: ["**/*.{js,mjs,cjs,ts}"]},
  {languageOptions: { globals: globals.browser }},
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    "rules": {
      "@typescript-eslint/semi": "error",
      "@typescript-eslint/array-type": ["error", {"default": "generic"}],
      "@typescript-eslint/consistent-type-assertions": "error"
    }
  }
];