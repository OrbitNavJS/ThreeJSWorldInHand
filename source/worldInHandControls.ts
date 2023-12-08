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
  MeshBasicMaterial
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
  protected planeMaterial: ShaderMaterial

  public update: Function

  constructor (camera: PerspectiveCamera /* | OrthographicCamera */, domElement: HTMLCanvasElement, renderTarget: WebGLRenderTarget, renderer: WebGLRenderer, scene: Scene){
	  super();
    const scope = this;
    this.camera = camera;
    this.domElement = domElement;
    
    const mousePosition = new Vector2();
    const mouseWorldPosition = new Vector3();
    const zoomDirection = new Vector3();
    const cameraLookAt = new Vector3();
    const rotateStart = new Vector2();
    const rotateEnd = new Vector2();
    const rotateDelta = new Vector2();

    const planeGeometry = new PlaneGeometry(2, 2);
    const planeMaterial = new ShaderMaterial();
    const planeMesh = new Mesh(planeGeometry, planeMaterial);

    const testSphereGeometry = new SphereGeometry(0.25);
    const testSphereMaterial = new MeshBasicMaterial();
    const testSphere = new Mesh(testSphereGeometry, testSphereMaterial);

    scene.add(testSphere);

    //let depthBufferArray = new Float32Array(0);

    this.update = function(this: WorldInHandControls, deltaTime?: number | null): void {
      planeMaterial.uniforms = { uDepthTexture: { value: renderTarget.depthTexture } }
      planeMaterial.vertexShader = vertexShader;
      planeMaterial.fragmentShader = fragmentShader;
      this.scene = new Scene();
      this.scene.add(planeMesh);
  
      this.planeRenderTarget = new WebGLRenderTarget(domElement.width, domElement.height, {format: RGBAFormat, type: FloatType});
      
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
      if (event.button !== 0) return;
      scope.domElement.addEventListener('pointermove', handleMouseMoveRotate);
      scope.domElement.addEventListener('pointerup', onPointerUp);

      handleMouseDownRotate(event);
    }

    function onPointerUp( event: PointerEvent ) {
      scope.domElement.removeEventListener('pointermove', handleMouseMoveRotate);
      scope.domElement.removeEventListener('pointerup', onPointerUp);

      scope.dispatchEvent( _endEvent );
    }


    function handleMouseWheel(event: WheelEvent): void {
      updateMouseParameters(event);

      const zoomSpeed = mouseWorldPosition.clone().sub(camera.position).length();
      zoomDirection.copy(mouseWorldPosition).sub(camera.position).normalize();

      //console.log(zoomSpeed);

      zoom(-(event.deltaY / Math.abs(event.deltaY)) * zoomSpeed * 0.5);

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

    function zoom(amount: number): void {
      //amount = Math.min(amount, 0.5);
      camera.position.addScaledVector(zoomDirection, amount);

      /*renderer.setRenderTarget(scope.planeRenderTarget);
      renderer.render(scope.scene, camera);

      const depthPixel = new Float32Array(4);
      renderer.readRenderTargetPixels(scope.planeRenderTarget, width/2, height/2, 1, 1, depthPixel);

      const linearDepth = -(camera.projectionMatrixInverse.elements[10] * depthPixel[0] + camera.projectionMatrixInverse.elements[14])
                        / ((camera.projectionMatrixInverse.elements[11] * depthPixel[0] + camera.projectionMatrixInverse.elements[15]) * camera.far);


      // TODO: update cameralookAt
      //console.log(linearDepth);
      cameraLookAt.copy(new Vector3(0.5, 0.5, linearDepth).unproject(camera));*/

      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    }

    function rotate(delta: Vector2): void {
      const lookTo = camera.position.clone().sub(cameraLookAt);

      camera.position.sub(lookTo);
      lookTo.sub(cameraLookAt);

      const screenX = new Vector3().crossVectors(lookTo, camera.up).normalize();
      const rotationMatrix = new Matrix4().makeRotationY(-delta.x);
      rotationMatrix.multiply(new Matrix4().makeRotationAxis(screenX, delta.y));

      lookTo.applyMatrix4(rotationMatrix);
      lookTo.add(cameraLookAt);
      camera.position.add(lookTo);
      camera.lookAt(cameraLookAt);

      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    }

    function updateMouseParameters(event: WheelEvent): void {
      const rect = scope.domElement.getBoundingClientRect();
      const x = window.devicePixelRatio * (event.clientX - rect.left);
      const y = window.devicePixelRatio * (event.clientY - rect.top);
      const w = window.devicePixelRatio * rect.width;
      const h = window.devicePixelRatio * rect.height;

      mousePosition.x = ( x / w ) * 2 - 1;
      mousePosition.y = 1 - ( y / h ) * 2;

      renderer.setRenderTarget(scope.planeRenderTarget);
      renderer.render(scope.scene, camera);

      const depthPixel = new Float32Array(4);
      renderer.readRenderTargetPixels(scope.planeRenderTarget, x, h-y, 1, 1, depthPixel);

      let linearDepth = depthPixel[0];

      linearDepth = Math.min(1.0, linearDepth);
      linearDepth = Math.max(0.0, linearDepth);

      console.log("Linear depth", linearDepth);
                     
      linearDepth = linearDepth * 2 - 1;

      mouseWorldPosition.set(mousePosition.x, mousePosition.y, linearDepth)
      console.log("Mouse ndc position", mouseWorldPosition);
      mouseWorldPosition.unproject(camera);
      console.log("Mouse world position", mouseWorldPosition);

      testSphere.position.copy(mouseWorldPosition);
    }

    scope.domElement.addEventListener( 'pointerdown', onPointerDown );
		scope.domElement.addEventListener( 'pointercancel', onPointerUp );
    scope.domElement.addEventListener( 'wheel', onMouseWheel, { passive: false } );
    scope.domElement.addEventListener( 'mousedown', updateMouseParameters );
  }
}

export { WorldInHandControls as WorldInHandControls };