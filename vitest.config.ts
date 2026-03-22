/** @fileoverview Vitest configuration leveraging Vite aliases for path resolution. */
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
    await viteConfig(),
    defineConfig({
        test: {
            environment: 'happy-dom',
            include: ['src/**/*.{test,spec}.ts'],
            coverage: {
                provider: 'v8',
                reporter: ['text', 'text-summary', 'lcov', 'html'],
                include: [
                    'src/shared/**/*.ts',
                    'src/stores/**/*.ts',
                    'src/composables/**/*.ts',
                    'src/api/**/*.ts',
                    'src/components/**/*.vue',
                ],
                exclude: [
                    'src/**/*.d.ts',
                    'src/**/*.{test,spec}.ts',
                    'src/shared/locales/**',
                    'src/vite-env.d.ts',
                    'src/main.ts',
                ],
                thresholds: {
                    statements: 50,
                    branches: 45,
                    functions: 33,
                    lines: 50,
                },
            },
        },
    }),
)
