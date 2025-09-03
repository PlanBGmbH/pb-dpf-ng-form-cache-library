// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const prettier = require('eslint-config-prettier');

module.exports = tseslint.config(
	{
		files: ['**/*.ts'],
		ignores: ['**/*.spec.ts', '**/*.d.ts'],
		extends: [
			eslint.configs.recommended,
			...tseslint.configs.recommended,
			...tseslint.configs.stylistic,
			...angular.configs.tsRecommended,
			prettier,
		],
		processor: angular.processInlineTemplates,
		rules: {
			// Angular selector rules
			'@angular-eslint/directive-selector': [
				'error',
				{
					type: 'attribute',
					prefix: 'fc',
					style: 'camelCase',
				},
			],
			'@angular-eslint/component-selector': [
				'error',
				{
					type: 'element',
					prefix: 'fc',
					style: 'kebab-case',
				},
			],

			// Good practices
			'no-console': ['warn', { allow: ['warn', 'error'] }],
			'no-debugger': 'error',

			// TypeScript
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/no-inferrable-types': 'off',

			// Style
			'@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
			'@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'explicit' }],
		},
	},
	{
		files: ['**/*.html'],
		extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
		rules: {},
	},
);
