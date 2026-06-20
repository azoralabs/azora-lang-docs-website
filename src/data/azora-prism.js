/** Azora language definition for Prism / refractor */
export default function azora(Prism) {
  Prism.languages.azora = {
    'doc-comment': {
      pattern: /\/\*\*(?!\/)[\s\S]*?\*\//,
      greedy: true,
      inside: {
        'doc-tag': /\B@(?:param|return|since|throws|file)\b/,
        'doc-param-name': {
          pattern: /(@param\s+)\w+/,
          lookbehind: true,
        },
      },
    },
    comment: [
      { pattern: /\/\/.*/, greedy: true },
      { pattern: /\/\*[\s\S]*?\*\//, greedy: true },
    ],
    decorator: {
      pattern: /@\w+(?::[\w.]+)?(?:\([^)]*\))?/,
      alias: 'annotation',
    },
    preprocessor: {
      pattern: /\$\w+/,
      alias: 'variable',
    },
    string: {
      pattern: /"(?:[^"\\]|\\[\s\S])*"/,
      greedy: true,
      inside: {
        interpolation: {
          pattern: /\$\{[^}]*\}|\$[a-zA-Z_]\w*/,
          inside: {
            'interpolation-punctuation': {
              pattern: /^\$\{?|\}$/,
              alias: 'punctuation',
            },
          },
        },
      },
    },
    number: /\b\d[\d_]*(?:\.[\d_]+)?\b/,
    'type-keyword': {
      pattern: /\b(?:Int|UInt|Long|ULong|Byte|UByte|Short|UShort|Cent|UCent|Float|Real|Decimal|Bool|Char|String|Unit)\b/,
      alias: 'class-name',
    },
    'builtin-fn': {
      pattern: /\b(?:println)\b/,
      alias: 'builtin',
    },
    boolean: /\b(?:true|false)\b/,
    keyword: /\b(?:var|let|fin|func|return|package|if|else|inline|deepinline|noinline|zone|friend|test|assert|trace|for|while|loop|in|break|continue|pack)\b/,
    'type-name': {
      pattern: /\b[A-Z][a-zA-Z0-9_]*\b/,
      alias: 'class-name',
    },
    function: {
      pattern: /\b[a-z_]\w*(?=\s*[\(<])/,
    },
    operator: /\.\.\.?|->|::|[+\-*/%]=?|&&|\|\||[<>!=]=?|!|\?\?|\?=|\?[+\-*/%]=|\?\+\+|\?--/,
    punctuation: /[{}[\]();:.,<>?]/,
  }
}
azora.displayName = 'azora'
azora.aliases = []
