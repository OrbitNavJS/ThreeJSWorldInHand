import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig((configEnv) => {
    console.log(configEnv.mode);

    if (configEnv.mode === 'library') {
        return {
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
        };
    } else if (configEnv.mode === 'production') {
        return {
            base: '/ThreeJSWorldInHand/'
        };
    } else {
        return {};
    }
})