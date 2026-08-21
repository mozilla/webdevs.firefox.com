import js from '@eslint/js';
import markdown from '@eslint/markdown';
import { defineConfig } from 'eslint/config';
import astro from 'eslint-plugin-astro';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  {
    // `CLAUDE.md` is a symlink to `AGENTS.md`; lint the file itself, once.
    ignores: ['dist/', '.astro/', 'CLAUDE.md'],
  },

  {
    files: codeFiles,

    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      unicorn.configs.recommended,
      astro.configs.recommended,
    ],

    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.astro'],
      },
    },
    rules: {
      // Component files are PascalCase by Astro/Preact convention.
      'unicorn/filename-case': 'off',
      // Single-line JSDoc comments are idiomatic here.
      'unicorn/single-line-block-comment-style': 'off',
      // `Props` is the interface name the Astro compiler looks for.
      'unicorn/name-replacements': [
        'error',
        { replacements: { props: false } },
      ],
    },
  },

  // `astro-eslint-parser` has no `projectService` support, so point it at the
  // tsconfig directly to keep type-aware rules working in `.astro` files.
  {
    files: ['**/*.astro'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: './tsconfig.json',
      },
    },
  },

  // Config files run in Node, not the browser.
  {
    files: ['*.config.{js,ts,mjs}'],
    languageOptions: {
      globals: globals.nodeBuiltin,
    },
  },

  // Type-aware linting can't parse these; lint them syntactically.
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    files: ['**/*.md'],
    plugins: {
      markdown,
    },
    extends: ['markdown/recommended'],
  },
]);
