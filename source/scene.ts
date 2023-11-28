import GUI from 'lil-gui'
import {
  AmbientLight,
  AxesHelper,
  BoxGeometry,
  Clock,
  Color,
  DepthFormat,
  DepthTexture,
  GridHelper,
  Group,
  LoadingManager,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  UnsignedIntType,
  FloatType,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer
} from 'three'
import { WorldInHandControls } from './worldInHandControls'
import Stats from 'three/examples/jsm/libs/stats.module'
import * as animations from './helpers/animations'
import { toggleFullScreen } from './helpers/fullscreen'
import { resizeRendererToDisplaySize } from './helpers/responsiveness'
import './style.css'
import { OrbitControls } from './orbitControls'

const CANVAS_ID = 'scene'

let canvas: HTMLCanvasElement
let context: WebGL2RenderingContext
let renderer: WebGLRenderer
let renderTarget: WebGLRenderTarget
let scene: Scene
let loadingManager: LoadingManager
let ambientLight: AmbientLight
let cubeGroup: Group
let camera: PerspectiveCamera
let cameraControls: WorldInHandControls
let axesHelper: AxesHelper
let clock: Clock
let stats: Stats
let gui: GUI

const animation = { enabled: false, play: true }

init()
animate()

function init() {
  // ===== 🖼️ CANVAS, RENDERER, & SCENE =====
  {
    canvas = document.querySelector(`canvas#${CANVAS_ID}`)! as HTMLCanvasElement
    context = canvas.getContext('webgl2') as WebGL2RenderingContext
    renderer = new WebGLRenderer({ canvas, context, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = PCFSoftShadowMap
    renderTarget = new WebGLRenderTarget(window.innerWidth, window.innerHeight);
    renderTarget.depthTexture = new DepthTexture(window.innerWidth, window.innerHeight, FloatType);
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
    ambientLight = new AmbientLight('white', 5)
    scene.add(ambientLight)
  }

  // ===== 📦 OBJECTS =====
  {
    // plane
    const planeGeometry = new PlaneGeometry(15, 15)
    const planeMaterial = new MeshLambertMaterial({
      color: 'gray',
      emissive: 'white',
      emissiveIntensity: 0.2,
      side: 2,
      transparent: true,
      opacity: 0.4,
    })
    const plane = new Mesh(planeGeometry, planeMaterial)
    plane.rotateX(Math.PI / 2)
    plane.position.y = -0.001
    plane.receiveShadow = true
    scene.add(plane)

    // cubes
    const gridSize = 10;
    const spacing = 1.2;
    const gridCenterOffset = (gridSize - 1) * spacing * 0.5;

    const sideLength = 1;
    const minHeight = 0.2;
    const maxHeight = 2.0;

    cubeGroup = new Group();
    const cubeGeometry = new BoxGeometry(sideLength, sideLength, sideLength);

    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        
        const randomHeight = Math.random() * (maxHeight - minHeight) + minHeight;
        const randomColor = new Color('#ff66a1').lerp(new Color('#ffffff'), Math.random());

        const cubeMaterial = new MeshStandardMaterial({
          color: randomColor,
          metalness: 0.5,
          roughness: 0.7,
        });

        const tmpCube = new Mesh(cubeGeometry, cubeMaterial);
        tmpCube.castShadow = true;

        tmpCube.position.set(i * spacing - gridCenterOffset, randomHeight / 2, j * spacing - gridCenterOffset);
        tmpCube.scale.set(1, randomHeight, 1);

        cubeGroup.add(tmpCube);
      }
    }
  scene.add(cubeGroup);
  }

  // ===== 🎥 CAMERA =====
  {
    camera = new PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 100)
    camera.position.set(14,0, 4)
    camera.lookAt(new Vector3(0, 0, 0))
  }

  // ===== 🕹️ CONTROLS =====
  {
    cameraControls = new WorldInHandControls(camera, canvas as HTMLCanvasElement, renderTarget, renderer)
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

    const gridHelper = new GridHelper(15, 15, 'teal', 'darkgray')
    gridHelper.position.y = -0.01
    scene.add(gridHelper)
  }

  // ===== 📈 STATS & CLOCK =====
  {
    clock = new Clock()
    stats = new Stats()
    document.body.appendChild(stats.dom)
  }

  // ==== 🐞 DEBUG GUI ====
  {
    gui = new GUI({ title: '🐞 Debug GUI', width: 300 })

    const cubesFolder = gui.addFolder('Cubes')

    cubesFolder.add(cubeGroup.position, 'x').min(-10).max(10).step(0.1).name('pos x')
    cubesFolder.add(cubeGroup.position, 'y').min(-10).max(10).step(0.1).name('pos y')
    cubesFolder.add(cubeGroup.position, 'z').min(-10).max(10).step(0.1).name('pos z')

    cubesFolder.add(cubeGroup.rotation, 'x', -Math.PI * 2, Math.PI * 2, Math.PI / 4).name('rotate x')
    cubesFolder.add(cubeGroup.rotation, 'y', -Math.PI * 2, Math.PI * 2, Math.PI / 4).name('rotate y')
    cubesFolder.add(cubeGroup.rotation, 'z', -Math.PI * 2, Math.PI * 2, Math.PI / 4).name('rotate z')
    
    cubesFolder.addColor({ color: '#ff66a1' }, 'color').onChange((color: Color) => {
      cubeGroup.children.forEach((cube: Mesh) => {
        (cube.material as MeshStandardMaterial).color = new Color(color).lerp(new Color('#ffffff'), Math.random())
      })
    });

    cubesFolder.add(animation, 'enabled').name('animated')
    
    const lightsFolder = gui.addFolder('Lights')
    lightsFolder.add(ambientLight, 'visible').name('ambient light')

    const helpersFolder = gui.addFolder('Helpers')
    helpersFolder.add(axesHelper, 'visible').name('axes')

    /*const cameraFolder = gui.addFolder('Camera')
    cameraFolder.add(cameraControls, 'autoRotate')*/

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

  if (animation.enabled && animation.play) {
    animations.rotate(cubeGroup, clock, Math.PI / 3)
    animations.bounce(cubeGroup, clock, 1, 0.5, 0.5)
  }

  if (resizeRendererToDisplaySize(renderer)) {
    const canvas = renderer.domElement
    camera.aspect = canvas.clientWidth / canvas.clientHeight
    camera.updateProjectionMatrix()
  }

  cameraControls.update()

  renderer.setRenderTarget(renderTarget)
  renderer.render(scene, camera)
  renderer.setRenderTarget(null)
  renderer.render(scene, camera)
}