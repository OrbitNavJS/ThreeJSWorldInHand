import GUI from 'lil-gui'
import {
  AmbientLight,
  AxesHelper,
  DepthFormat,
  DepthTexture,
  DirectionalLightHelper,
  LoadingManager,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  FloatType,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
  DirectionalLight
} from 'three'
import { WorldInHandControls } from './worldInHandControls'
import Stats from 'three/examples/jsm/libs/stats.module'
import { toggleFullScreen } from './helpers/fullscreen'
import { resizeRendererToDisplaySize } from './helpers/responsiveness'
import './style.css'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {GLTF, GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';


const CANVAS_ID = 'scene'

let canvas: HTMLCanvasElement
let context: WebGL2RenderingContext
let renderer: WebGLRenderer
let renderTarget: WebGLRenderTarget
let scene: Scene
let loadingManager: LoadingManager
let ambientLight: AmbientLight
let directionalLight: DirectionalLight
let directionalLightHelper: DirectionalLightHelper
let camera: PerspectiveCamera
let cameraControls: WorldInHandControls | OrbitControls
let axesHelper: AxesHelper
let stats: Stats
let gui: GUI


init()
animate()

function init() {
  // ===== 🖼️ CANVAS, RENDERER, & SCENE =====
  {
    canvas = document.querySelector(`canvas#${CANVAS_ID}`)! as HTMLCanvasElement
    context = canvas.getContext('webgl2') as WebGL2RenderingContext
    renderer = new WebGLRenderer({ canvas, context, antialias: true, alpha: true, logarithmicDepthBuffer: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = PCFSoftShadowMap
    renderTarget = new WebGLRenderTarget(canvas.clientWidth * window.devicePixelRatio, canvas.clientHeight * window.devicePixelRatio);
    renderTarget.depthTexture = new DepthTexture(renderTarget.width, renderTarget.height, FloatType);
    renderTarget.depthTexture.format = DepthFormat
    scene = new Scene()
  }

  // ===== 👨🏻‍💼 LOADING MANAGER =====
  {
    loadingManager = new LoadingManager()

    loadingManager.onStart = () => {
      console.log('loading started')
    }
    loadingManager.onProgress = (url, loaded, total) => {
      console.log('loading in progress:')
      console.log(`${url} -> ${loaded} / ${total}`)
    }
    loadingManager.onLoad = () => {
      console.log('loaded!')
    }
    loadingManager.onError = () => {
      console.log('❌ error while loading')
    }
  }

  // ===== 💡 LIGHTS =====
  {
    ambientLight = new AmbientLight(0xffffff, 1.5)
    scene.add(ambientLight)

    // add directional light
    directionalLight = new DirectionalLight(0xf5f5f5, 1)
    directionalLight.position.set(0, 10, 0)
    scene.add(directionalLight)
  }

  // ===== 📦 OBJECTS =====
  {
    // load city model
    const loader = new GLTFLoader();

    loader.load( '/models/scene.gltf', function ( gltf: GLTF ) {
      let model = gltf.scene;
      model.scale.set(10, 10, 10);
      model.rotation.set(0, 1, 0);
      model.position.set(10, 0, -6);
      scene.add( model );

    }, undefined, function ( error: unknown ) {
      console.error( error );
    });
  }

  // ===== 🎥 CAMERA =====
  {
    camera = new PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 100)
    camera.position.set(14,5, 4)
    camera.lookAt(new Vector3(0, 0, 0))
  }

  // ===== 🕹️ CONTROLS =====
  {
    //cameraControls = new WorldInHandControls(camera, canvas as HTMLCanvasElement, renderTarget, renderer, scene)
    //cameraControls = new OrbitControls(camera, canvas);

    // Full screen
    window.addEventListener('dblclick', (event) => {
      if (event.target === canvas) {
        toggleFullScreen(canvas)
      }
    })
  }

  // ===== 🪄 HELPERS =====
  {
    axesHelper = new AxesHelper(4)
    axesHelper.visible = false
    scene.add(axesHelper)

    directionalLightHelper = new DirectionalLightHelper(directionalLight, 5);
    directionalLightHelper.visible = false
    scene.add(directionalLightHelper)
  }

  // ===== 📈 STATS & CLOCK =====
  {
    stats = new Stats()
    document.body.appendChild(stats.dom)
  }

  // ==== 🐞 DEBUG GUI ====
  {
    gui = new GUI({ title: '🐞 Debug GUI', width: 300 })

    const navigationFolder = gui.addFolder('Navigation')
    const navigationModes = ['world-in-hand', 'orbit']
    const navigationMode = { current: null }
    navigationFolder.add(navigationMode, 'current', navigationModes).name('mode').onChange((value: string) => {
      if (value === 'world-in-hand') {
        if (cameraControls !== undefined) cameraControls.dispose();
        cameraControls = new WorldInHandControls(camera, canvas as HTMLCanvasElement, renderTarget, renderer, scene)
      } else if (value === 'orbit') {
        if (cameraControls !== undefined) cameraControls.dispose();
        cameraControls = new OrbitControls(camera, canvas);
      }
    })

    const lightsFolder = gui.addFolder('Lights')
    lightsFolder.add(ambientLight, 'visible').name('ambient light')
    lightsFolder.add(directionalLight, 'visible').name('directional light')

    const helpersFolder = gui.addFolder('Helpers')
    helpersFolder.add(axesHelper, 'visible').name('axes')

    // persist GUI state in local storage on changes
    gui.onFinishChange(() => {
      const guiState = gui.save()
      localStorage.setItem('guiState', JSON.stringify(guiState))
    })

    // load GUI state if available in local storage
    const guiState = localStorage.getItem('guiState')
    if (guiState) gui.load(JSON.parse(guiState))

    // reset GUI state button
    const resetGui = () => {
      localStorage.removeItem('guiState')
      gui.reset()
    }
    gui.add({ resetGui }, 'resetGui').name('RESET')

    gui.close()
  }
}

function animate() {
  requestAnimationFrame(animate)

  stats.update()

  if (resizeRendererToDisplaySize(renderer)) {
    const canvas = renderer.domElement;
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    renderTarget.setSize(canvas.clientWidth * window.devicePixelRatio, canvas.clientHeight * window.devicePixelRatio);
  }

  cameraControls.update()

  renderer.setRenderTarget(renderTarget)
  renderer.render(scene, camera)
  renderer.setRenderTarget(null)
  renderer.render(scene, camera)
}