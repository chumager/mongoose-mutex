module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true,
    commonjs: true,
    mocha: true
  },
  plugins: ["prettier", "mocha"],
  extends: ["eslint:recommended", "plugin:mocha/recommended"],
  rules: {
    strict: 0,
    "no-console": 0,
    "max-len": [
      "error",
      {
        code: 120,
        ignoreComments: true
      }
    ],
    "prettier/prettier": [
      "warn",
      {
        printWidth: 120,
        tabWidth: 2,
        bracketSpacing: false,
        trailingComma: "none",
        arrowParens: "avoid"
      }
    ]
  },
  // "parser": "babel-eslint",
  parserOptions: {
    ecmaVersion: 2021,
    ecmaFeatures: {
      es6: true
    },
    sourceType: "module"
  }
};
