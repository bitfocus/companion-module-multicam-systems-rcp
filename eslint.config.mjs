import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

export default [
	...(await generateEslintConfig({
		enableTypescript: true,
	})),
	{ files: ['test-*.mjs'], rules: { 'n/no-unpublished-import': 'off' } },
]
