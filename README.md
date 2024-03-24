# World-in-Hand Navigation for Three.js
World-In-Hand Navigation is an innovative extension developed as part of a university seminar at Hasso-Plattner-Institut aimed at enhancing the capabilities of the Three.js framework. The primary goal was to introduce a novel navigation approach called "World-In-Hand" navigation to Three.js.

## Introduction 
This navigation method aims to enhance the user experience by allowing users to interact with the virtual world as if it were a tangible object in their hands. By bridging the gap between the user's interaction and the virtual camera's movement, World-In-Hand Navigation offers a more intuitive, robust, and user-friendly navigation experience compared to the traditional navigation controls provided by Three.js

▶️ [Demo](https://orbitnavjs.github.io/ThreeJSWorldInHand/)

Learn more about the project and visit our [Behind-the-project Website](https://github.com/OrbitNavJS/WIHNavigationWebsite)!

## Features
- **Precise Interaction**: Based on the exact mouse position projected onto the scene, allowing users to grab a point or an object to pan, rotate, or zoom with precision.
  
- **Enhanced User Experience**: Implements several basic enhancements to improve the navigation experience, such as:
  - Limiting the camera's distance from the scene
  - Preventing the camera from flipping upside down
  - Clamping the possible scene depth for the mouse
  - Adjusting the camera's movement speed when zooming based on the scene's depth
  - Optionally prohibiting rotation below the ground plane
  - Providing an option to reset the camera to its initial position
  
- **World-In-Hand-Controls Visualiser**: A visualiser class to help developers understand and adapt the navigation to their needs, displaying constraints and other helpful information like mouse position and rotation axes.

- **Easy Integration**: Straightforward integration into Three.js projects with minimal additional steps compared to standard OrbitControls (see usage).

- **Flexible Usage**: Compatible with both mouse and touch interactions.


## Usage
The usage of World-In-Hand Navigation is mostly similar to Three.js's OrbitControls class. You can install our navigation using a [package manager](https://www.npmjs.com/package/@world-in-hand-controls/threejs-world-in-hand).

```javascript
import { WorldInHandControls } from '@world-in-hand-controls/threejs-world-in-hand';

// Last parameter is the amount of MSAA samples to use for the exposed render target
const controls = new WorldInHandControls(perspectiveCamera, renderer.domElement, renderer, scene, 4);

// Resilience configuration
controls.allowRotationBelowGroundPlane = false; // default: true
controls.useBottomOfBoundingBoxAsGroundPlane = false; // default: true
controls.rotateAroundMousePosition = false; // default: false

// When scene changes its size
scene.dispatchEvent({type: 'change'});

// If rendering on demand, listen to change events
controls.addEventListener('change', render);

// If the renderer.domElement was resized
scene.dispatchEvent({type: 'resize'});

// If manually changing camera, call this afterwards
controls.reloadCamera();

function render() {
    // Render into the exposed render target
    renderer.setRenderTarget(controls.navigationRenderTarget);
    renderer.render(scene, perspectiveCamera);
    
    // Tell the controls a render has taken place and
    // by default copy the render target to the canvas
    controls.update();
}
```

## Full usage example
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
const controls = new WorldInHandControls(camera, renderer.domElement, renderer, scene, 4);

/*
We recommend not manually changing anything about the camera after creating WorldInHandControls.
If you still change the camera, we recommend calling this. This should return the controls into a working state
 */
controls.reloadCamera();

/*
Resilience configuration
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

## Attribution
The model used in the deployed demo is based on ["City- Shanghai-Sandboxie"](https://sketchfab.com/3d-models/city-shanghai-sandboxie-3eab4438b9b34ceeaa35367429732970) by [Michael Zhang](https://sketchfab.com/beyond.zht) licensed under [CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/)
