import {
  RedFormat,
  EventDispatcher,
  FloatType,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  TypedArray,
  UnsignedByteType,
  UnsignedIntType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer, 
  RGBAFormat, 
  Matrix4,
  SphereGeometry,
  MeshBasicMaterial,
  Plane,
  Ray
} from 'three';
import {cameraPosition} from "three/examples/jsm/nodes/shadernode/ShaderNodeBaseElements";

const _startEvent = {type: 'start'}
const _endEvent = {type: 'end'}

const vertexShader =
  `varying vec2 vUV;

  void main() {
    vUV = uv;
    gl_Position = vec4(position, 1.0);
  }`

const fragmentShader = 
  `varying vec2 vUV;
  uniform sampler2D uDepthTexture;

  void main() {
    gl_FragColor = texture(uDepthTexture, vUV);
    //gl_FragColor = vec4(vUV, 0., 1.);
  }`
;

class WorldInHandControls extends EventDispatcher {
  protected domElement: HTMLCanvasElement
  protected camera: PerspectiveCamera // | OrthographicCamera
  protected scene: Scene
  protected planeRenderTarget: WebGLRenderTarget

  public update: Function
  public dispose: Function

  constructor (camera: PerspectiveCamera /* | OrthographicCamera */, domElement: HTMLCanvasElement, renderTarget: WebGLRenderTarget, renderer: WebGLRenderer, scene: Scene){
	  super();
    const scope = this;
    this.camera = camera;
    this.domElement = domElement;

    this.camera.lookAt(0, 0, 0);

    const mousePosition = new Vector2();
    const mouseWorldPosition = new Vector3();
    const zoomDirection = new Vector3();
    const cameraLookAt = new Vector3();
    const rotateStart = new Vector2();
    const rotateEnd = new Vector2();
    const rotateDelta = new Vector2();
    const panStart = new Vector3();
    const panHeightGuide = new Plane();

    const planeGeometry = new PlaneGeometry(2, 2);
    const planeMaterial = new ShaderMaterial();
    const planeMesh = new Mesh(planeGeometry, planeMaterial);

    planeMaterial.vertexShader = vertexShader;
    planeMaterial.fragmentShader = fragmentShader;
    this.scene = new Scene();
    this.scene.add(planeMesh);

    this.planeRenderTarget = new WebGLRenderTarget(domElement.clientWidth, domElement.clientHeight, {format: RGBAFormat, type: FloatType});

    /*const testSphereGeometry = new SphereGeometry(0.25);
    const testSphereMaterial = new MeshBasicMaterial();
    const testSphereMesh = new Mesh(testSphereGeometry, testSphereMaterial);

    scene.add(testSphereMesh);*/

    this.dispose = () => {
      scope.domElement.removeEventListener('pointermove', handleMouseMovePan);
      scope.domElement.removeEventListener('pointermove', handleMouseMoveRotate);
      scope.domElement.removeEventListener('pointerup', onPointerUp);
      scope.domElement.removeEventListener( 'pointerdown', onPointerDown );
      scope.domElement.removeEventListener( 'pointercancel', onPointerUp );
      scope.domElement.removeEventListener( 'wheel', onMouseWheel );
      scope.domElement.removeEventListener( 'contextmenu', preventContextMenu);
    }

    this.update = function(this: WorldInHandControls, deltaTime?: number | null): void {
      planeMaterial.uniforms = { uDepthTexture: { value: renderTarget.depthTexture } }

      // SHOW FRAMEBUFFER
      /*renderer.setRenderTarget(scope.planeRenderTarget);
      renderer.render(scope.scene, camera);

      let canvas = document.getElementById("scene") as HTMLCanvasElement;

      const depthBufferArray = new Float32Array(canvas.width * canvas.height * 4);
      renderer.readRenderTargetPixels(scope.planeRenderTarget, 0, 0, canvas.width, canvas.height, depthBufferArray);

      for (let i = 0; i < depthBufferArray.length; i+=4) {
        const linearDepth = (camera.projectionMatrixInverse.elements[10] * depthBufferArray[i] + camera.projectionMatrixInverse.elements[14])
                          / ((camera.projectionMatrixInverse.elements[11] * depthBufferArray[i] + camera.projectionMatrixInverse.elements[15]) * camera.far);
        depthBufferArray[i] = -linearDepth;

        depthBufferArray[i] *= 255;
        depthBufferArray[i+1] = depthBufferArray[i];
        depthBufferArray[i+2] = depthBufferArray[i];
        depthBufferArray[i+3] = 255;
      }

      let canvas2 = document.getElementById("copy") as HTMLCanvasElement;
      canvas2.width = canvas.width;
      canvas2.height = canvas.height;
      let imageData = (canvas2.getContext('2d') as CanvasRenderingContext2D).createImageData(canvas.width, canvas.height)
      imageData.data.set(depthBufferArray); // copy here
      // invert y axis of image data
      const bytesPerRow = canvas.width * 4;
      const halfHeight = canvas.height / 2;
      for (let y = 0; y < halfHeight; ++y) {
        const topOffset = y * bytesPerRow;
        const bottomOffset = (canvas.height - y - 1) * bytesPerRow;
        for (let i = 0; i < bytesPerRow; ++i) {
          const temp = imageData.data[topOffset + i];
          imageData.data[topOffset + i] = imageData.data[bottomOffset + i];
          imageData.data[bottomOffset + i] = temp;
        }
      }

      (canvas2.getContext('2d') as CanvasRenderingContext2D).putImageData(imageData, 0, 0);*/
	  }

    function onMouseWheel(event: WheelEvent): void {
      event.preventDefault();
      scope.dispatchEvent( _startEvent );
      handleMouseWheel( event );
      scope.dispatchEvent( _endEvent );
    }

    function onPointerDown(event: PointerEvent): void {
      scope.domElement.addEventListener('pointerup', onPointerUp);
      
      switch (event.button) {
        // left mouse
        case 0:
          handleMouseDownRotate(event);
          scope.domElement.addEventListener('pointermove', handleMouseMoveRotate);
          break;
        
        // right mouse
        case 2:
          handleMouseDownPan(event);
          scope.domElement.addEventListener('pointermove', handleMouseMovePan);
          break;
      }
    }

    function onPointerUp( event: PointerEvent ) {
      scope.domElement.removeEventListener('pointermove', handleMouseMovePan);
      scope.domElement.removeEventListener('pointermove', handleMouseMoveRotate);
      scope.domElement.removeEventListener('pointerup', onPointerUp);
    }


    function handleMouseWheel(event: WheelEvent): void {
      updateMouseParameters(event);

      const zoomSpeed = mouseWorldPosition.clone().sub(camera.position).length() * 0.25;
      zoomDirection.copy(mouseWorldPosition).sub(camera.position).normalize();

      zoom(-(event.deltaY / Math.abs(event.deltaY)) * zoomSpeed);

      scope.update();
    }

    function handleMouseDownRotate(event: PointerEvent): void {
      rotateStart.set(event.clientX, event.clientY);
    }

    function handleMouseMoveRotate(event: PointerEvent): void {
      rotateEnd.set( event.clientX, event.clientY );
      rotateDelta.subVectors( rotateEnd, rotateStart ).multiplyScalar( 0.005 );

      rotate(rotateDelta);

      rotateStart.copy( rotateEnd );
      scope.update();
    }

    function handleMouseDownPan(event: PointerEvent): void {
      updateMouseParameters(event);
      panStart.copy(mouseWorldPosition);
      panHeightGuide.copy(new Plane(new Vector3(0, 1, 0), -panStart.y));
    }

    function handleMouseMovePan(event: PointerEvent): void {
      updateMouseParameters(event);

      const mouseRay = new Ray(camera.position, mouseWorldPosition.clone().sub(camera.position).normalize());
      const panCurrent = new Vector3(); 
      mouseRay.intersectPlane(panHeightGuide, panCurrent);

      pan(panCurrent.clone().sub(panStart));

      scope.update();
    }

    function zoom(amount: number): void {
      camera.position.addScaledVector(zoomDirection, amount);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();

      const linearDepth = readDepthAtPosition(0, 0);
      cameraLookAt.copy(new Vector3(0, 0, linearDepth).unproject(camera));
      
      const scalingFactor = -camera.position.y / (cameraLookAt.y - camera.position.y);
      // Height of camera reference point should not change
      const intersectionXZ = camera.position.clone().add(cameraLookAt.clone().sub(camera.position).multiplyScalar(scalingFactor));
      cameraLookAt.copy(intersectionXZ);
    }

    function rotate(delta: Vector2): void {
      const lookToInverse = camera.position.clone().sub(cameraLookAt);
      camera.position.sub(lookToInverse);

      const screenX = new Vector3().crossVectors(lookToInverse, camera.up).normalize();
      const rotationMatrix = new Matrix4().makeRotationY(-delta.x);
      rotationMatrix.multiply(new Matrix4().makeRotationAxis(screenX, delta.y));

      lookToInverse.applyMatrix4(rotationMatrix);
      camera.position.add(lookToInverse);
      camera.lookAt(cameraLookAt);

      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    }

    function pan(delta: Vector3): void {  
      delta.negate();
      delta.multiplyScalar(window.devicePixelRatio);

      camera.position.add(delta);
      cameraLookAt.add(delta);

      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
    }

    function updateMouseParameters(event: WheelEvent | PointerEvent): void {
      const rect = scope.domElement.getBoundingClientRect();

      const x = (event.clientX - rect.left);
      const y = (event.clientY - rect.top);
      const w = rect.width;
      const h = rect.height;

      mousePosition.x = ( x / w ) * 2 - 1;
      mousePosition.y = 1 - ( y / h ) * 2;

      const linearDepth = readDepthAtPosition(mousePosition.x, mousePosition.y);
      mouseWorldPosition.set(mousePosition.x, mousePosition.y, linearDepth);
      mouseWorldPosition.unproject(camera);
    }

    /**
     * @param x x position in NDC
     * @param y y position in NDC
     * @return NDC depth [-1, 1] at the specified coordinates
     */
    function readDepthAtPosition(x: number, y: number): number {
      const rect = scope.domElement.getBoundingClientRect();

      const w = rect.width;
      const h = rect.height;

      const xPixel = x * w/2 + w/2;
      const yPixel = y * h/2 + h/2;

      renderer.setRenderTarget(scope.planeRenderTarget);
      renderer.render(scope.scene, camera);

      const depthPixel = new Float32Array(4);
      renderer.readRenderTargetPixels(scope.planeRenderTarget, xPixel, yPixel, 1, 1, depthPixel);

      let linearDepth = depthPixel[0];
      linearDepth = Math.min(1.0, linearDepth);
      linearDepth = Math.max(0.0, linearDepth);
      linearDepth = linearDepth * 2 - 1;

      return linearDepth;
    }

    function preventContextMenu(event: Event) {
      event.preventDefault();
    }

    scope.domElement.addEventListener( 'pointerdown', onPointerDown );
    scope.domElement.addEventListener( 'pointercancel', onPointerUp );
    scope.domElement.addEventListener( 'wheel', onMouseWheel, { passive: false } );
    // prevent context menu when right clicking
    scope.domElement.addEventListener( 'contextmenu', preventContextMenu);
  }
}

export { WorldInHandControls as WorldInHandControls };