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
  WebGLRenderer, RGBAFormat
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
    const zoomDirection = new Vector3();
    const cameraLookAt = new Vector3();

    const planeGeometry = new PlaneGeometry(2, 2);
    const planeMaterial = new ShaderMaterial();
    const planeMesh = new Mesh(planeGeometry, planeMaterial);

    this.update = function(this: WorldInHandControls, deltaTime?: number | null): void {
      planeMaterial.uniforms = { uDepthTexture: { value: renderTarget.depthTexture } }
      planeMaterial.vertexShader = vertexShader;
      planeMaterial.fragmentShader = fragmentShader;
      this.scene = new Scene();
      this.scene.add(planeMesh);
  
      this.planeRenderTarget = new WebGLRenderTarget(domElement.width, domElement.height, {format: RGBAFormat, type: FloatType});
	  }

    function onMouseWheel(event: WheelEvent): void {
      event.preventDefault();
      scope.dispatchEvent( _startEvent );
      handleMouseWheel( event );
      scope.dispatchEvent( _endEvent );
    }

	// TODO: on window resize, resize buffer

    function handleMouseWheel(event: WheelEvent): void {
      updateMouseParameters(event);

      const zoomSpeed = cameraLookAt.clone().sub(camera.position).length()

      zoom(-(event.deltaY / Math.abs(event.deltaY)) * zoomSpeed * 0.25);

      scope.update();
    }

    function zoom(amount: number): void {
      camera.position.addScaledVector(zoomDirection, amount);
      camera.updateMatrixWorld();
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

      const depthPixel = new Float32Array(4);
      renderer.readRenderTargetPixels(scope.planeRenderTarget, x, y, 1, 1, depthPixel);

      zoomDirection.set(mousePosition.x, mousePosition.y, depthPixel[0]).unproject(camera).sub(camera.position).normalize();
    }

    scope.domElement.addEventListener( 'wheel', onMouseWheel, { passive: false } );
	//addEventListener( 'resize', onWindowResize );
  }
}

export { WorldInHandControls as WorldInHandControls };