import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
    base: '/ThreeJSWorldInHand/',
    plugins: [
        dts({
            include: [ 'source/worldInHandControls.ts' ],
            rollupTypes: true,
            outDir: 'dist',
        })
    ],
    build: {
        copyPublicDir: false,
        lib: {
            entry: 'source/worldInHandControls.ts',
            formats: ['es'],
            fileName: 'three-world-in-hand-controls'
        },
        rollupOptions: {
            external: ['three'],
            output: {
                dir: 'dist'
            }
        }
    }
})