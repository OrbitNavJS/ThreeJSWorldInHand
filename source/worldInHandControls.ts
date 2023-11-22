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
  WebGLRenderer
} from 'three';

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
  }`
;

class WorldInHandControls extends EventDispatcher {
  protected domElement: HTMLCanvasElement
  protected camera: PerspectiveCamera // | OrthographicCamera
  protected scene: Scene
  protected planeRenderTarget: WebGLRenderTarget
  protected planeMaterial: ShaderMaterial

  public update: Function

  constructor (camera: PerspectiveCamera /* | OrthographicCamera */, domElement: HTMLCanvasElement, renderTarget: WebGLRenderTarget, renderer: WebGLRenderer){
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

    this.update = function(this: WorldInHandControls, deltaTime?: number | null): void {
      planeMaterial.uniforms = { uDepthTexture: { value: renderTarget.depthTexture } }
      planeMaterial.vertexShader = vertexShader;
      planeMaterial.fragmentShader = fragmentShader;
      this.scene = new Scene();
      this.scene.add(planeMesh);
  
      this.planeRenderTarget = new WebGLRenderTarget(domElement.width, domElement.height, {format: RedFormat, type: FloatType});
	  }

    function onMouseWheel(event: WheelEvent): void {
      event.preventDefault();
      scope.dispatchEvent( _startEvent );
      handleMouseWheel( event );
      scope.dispatchEvent( _endEvent );
    }

    function onPointerDown(event: PointerEvent): void {
      if (event.button !== 0) return;
      scope.domElement.addEventListener('pointermove', handleMouseMoveRotate(event));
      scope.domElement.addEventListener('pointerup', onPointerUp);

      handleMouseDownRotate(event);
    }

    function onPointerUp( event: PointerEvent ) {
      scope.domElement.removeEventListener('pointermove', handleMouseMoveRotate(event));
      scope.domElement.removeEventListener('pointerup', onPointerUp);

			scope.dispatchEvent( _endEvent );
		}

	// TODO: on window resize, resize buffer

    function handleMouseWheel(event: WheelEvent): void {
      updateMouseParameters(event);

      const zoomSpeed = cameraLookAt.clone().sub(camera.position).length();
      zoomDirection.copy(mouseWorldPosition).sub(camera.position).normalize();

      zoom(-(event.deltaY / Math.abs(event.deltaY)) * zoomSpeed * 0.25);

      scope.update();
    }

    function handleMouseDownRotate(event: PointerEvent): void {
      rotateStart.set(event.clientX, event.clientY);
    }

    function handleMouseMoveRotate(event: PointerEvent): void {
      rotateEnd.set( event.clientX, event.clientY );
			rotateDelta.subVectors( rotateEnd, rotateStart ).multiplyScalar( 1 );

			rotate(rotateDelta);

			rotateStart.copy( rotateEnd );
			scope.update();
    }

    function zoom(amount: number): void {
      camera.position.addScaledVector(zoomDirection, amount);
      camera.updateMatrixWorld();
    }

    function rotate(delta: Vector2): void {
      //console.log(camera.position);
      const lookTo = cameraLookAt.clone().sub(camera.position);
      const lookToLength = lookTo.length();
      //delta x doesnt make sense here
      const x = Math.atan(delta.x * 0.001) * lookToLength;
      camera.translateX(x);
      camera.lookAt(cameraLookAt);
      const y = Math.atan(delta.y * 0.001) * lookToLength;
      camera.translateY(y);
      camera.lookAt(cameraLookAt);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();

      //const worldDelta = new Vector3(delta.x, delta.y, 0.1).unproject(camera);
      /*const worldStart = new Vector3(rotateStart.x, rotateStart.y, 0).unproject(camera);
      const worldEnd = new Vector3(rotateEnd.x, rotateEnd.y, 0).unproject(camera);
      const worldDelta = worldEnd.clone().sub(worldStart).multiplyScalar(0.1);
      //console.log(worldDelta);
      
      const untenRechts = camera.position.clone().add(worldDelta);
      const hin = cameraLookAt.clone().sub(untenRechts);
      const lookTo = cameraLookAt.clone().sub(camera.position);
      hin.multiplyScalar(hin.clone().dot(lookTo)/lookTo.length());
      camera.position.copy(hin.add(cameraLookAt));
      camera.updateMatrixWorld();
      console.log("2");
      console.log(camera.position);*/
    }

    function updateMouseParameters(event: WheelEvent): void {
      const rect = scope.domElement.getBoundingClientRect();
			const x = event.clientX - rect.left;
			const y = event.clientY - rect.top;
			const w = rect.width;
			const h = rect.height;
      
			mousePosition.x = ( x / w ) * 2 - 1;
			mousePosition.y = - ( y / h ) * 2 + 1;

      renderer.setRenderTarget(scope.planeRenderTarget);
      renderer.render(scope.scene, camera);

      const depthPixel = new Float32Array(1);
      renderer.readRenderTargetPixels(scope.planeRenderTarget, x, y, 1, 1, depthPixel);

      mouseWorldPosition.set(mousePosition.x, mousePosition.y, depthPixel[0]).unproject(camera);
    }

    scope.domElement.addEventListener( 'pointerdown', onPointerDown );
		scope.domElement.addEventListener( 'pointercancel', onPointerUp );
    scope.domElement.addEventListener( 'wheel', onMouseWheel, { passive: false } );
	//addEventListener( 'resize', onWindowResize );
  }
}

export { WorldInHandControls as WorldInHandControls };