export default {
  plugins: ["prettier-plugin-astro"],
  overrides: [{ files: "*.astro", options: { parser: "astro" } }],
  singleQuote: false,
  semi: true,
  trailingComma: "all",
  tabWidth: 2,
  printWidth: 80,
  endOfLine: "lf",
};
