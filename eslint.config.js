const browserGlobals = Object.fromEntries(
  [
    'window',
    'document',
    'navigator',
    'location',
    'localStorage',
    'alert',
    'self',
    'caches',
    'Image',
    'FileReader',
    'Option',
    'Blob',
    'URL',
    'Request',
    'Response',
    'Headers',
    'AbortController',
    'Storage',
    'console',
    'fetch',
    'setTimeout',
    'clearTimeout',
    'requestAnimationFrame',
    'structuredClone',
    'crypto',
    'createImageBitmap',
    'AbortSignal',
    'queueMicrotask',
    'innerWidth',
    'getComputedStyle',
  ].map((name) => [name, 'readonly'])
);

export default [
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...browserGlobals, process: 'readonly', Buffer: 'readonly' },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
    },
  },
];
