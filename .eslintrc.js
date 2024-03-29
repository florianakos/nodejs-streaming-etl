module.exports = {
    root: true,
    env: { es6: true, node: true, jest: true },
    parserOptions: { ecmaVersion: 'latest' },
    extends: ['eslint:recommended', 'prettier'],
    ignorePatterns: ['dist', 'node_modules']
};