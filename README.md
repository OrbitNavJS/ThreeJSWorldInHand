# World-in-Hand Navigation for Three.js
Developed as part of the course "3D Computer Graphics: Extending the Three.js Framework" at Hasso-Plattner-Institut.

▶️ [Demo](https://orbitnavjs.github.io/ThreeJSWorldInHand/)

The model used in the demo is based on ["City- Shanghai-Sandboxie"](https://sketchfab.com/3d-models/city-shanghai-sandboxie-3eab4438b9b34ceeaa35367429732970) by [Michael Zhang](https://sketchfab.com/beyond.zht) licensed under [CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/)

## Usage example
```javascript
import { WorldInHandControls } from '@world-in-hand-controls/threejs-world-in-hand';
import * as THREE from 'three';

const div = document.createElement('div');
div.style.height = '100%';
div.style.width = '100%';
document.body.style.margin = '0';
document.body.appendChild(div);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
div.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(75, div.clientWidth / div.clientHeight, 0.1, 1000);
// Camera position may NOT be (0, 0, 0).
camera.position.set(0, 1, 1);

/*
WorldInHandControls will NOT change your scene.
The last parameter dictates the amount of MSAA samples to use in the navigationRenderTarget.
If no value is passed, this defaults to 4. Pass 0 to disable anti-aliasing.
For more information, look up:
https://threejs.org/docs/#api/en/renderers/WebGLRenderTarget.samples
 */
const controls = new WorldInHandControls(camera, renderer.domElement, renderer, scene, 16);

/*
We recommend not manually changing anything about the camera after creating WorldInHandControls.
If you still change the camera, we recommend calling this. This should return the controls into a working state
 */
controls.reloadCamera();

/*
Resiliency configuration
 */
controls.allowRotationBelowGroundPlane = false; // default: true
controls.useBottomOfBoundingBoxAsGroundPlane = false; // default: true
controls.rotateAroundMousePosition = false; // default: false

const cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
scene.add(cube);

// Dispatch this event on the scene object passed to WorldInHandControls whenever you make changes to the scene that change its size
scene.dispatchEvent({type: 'change'});

// Rendering whenever the WorldInHandControls change the view
controls.addEventListener('change', requestUpdate);
let renderRequested = false;
requestAnimationFrame(render);

function requestUpdate() {
    if (renderRequested) return;

    renderRequested = true;
    requestAnimationFrame(render);
}

function render() {
    renderRequested = false;

    /*
    Render the finished scene you want to navigate on into this render target
    (for simple scenes, just render like shown here, 
    for multipass rendering you probably want to render the last pass into the render target)
     */
    renderer.setRenderTarget(controls.navigationRenderTarget);
    renderer.render(scene, camera);

    /*
    Call update whenever you have rendered something new into navigationRenderTarget.
    By default, this copies the content rendered into navigationRenderTarget onto the canvas.
    This should always be faster than re-rendering the scene onto the canvas.
    To explicitely disable this behaviour, call controls.update(false)
     */
    controls.update();

    // Render to the canvas if you called controls.update(false)
    /*
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    */
}

// Resize the renderer and WorldInHandControls on canvas resize
window.addEventListener('resize', () => {
    renderer.setSize(div.clientWidth, div.clientHeight);
    camera.aspect = div.clientWidth / div.clientHeight;
    renderer.setPixelRatio(window.devicePixelRatio);
    camera.updateProjectionMatrix();

    // Dispatch this event on the scene to resize everything in WorldInHandControls automatically
    scene.dispatchEvent({type: 'resize'});

    requestUpdate();
});
```