import {
	EventDispatcher,
	PerspectiveCamera,
	OrthographicCamera,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
  UnsignedByteType,
  TypedArray,
  FloatType,
  UnsignedIntType
} from 'three';

const _startEvent = {type: 'start'}
const _endEvent = {type: 'end'}

class WorldInHandControls extends EventDispatcher {
  protected domElement: HTMLCanvasElement
  protected camera: PerspectiveCamera // | OrthographicCamera

  public update: Function

  constructor (camera: PerspectiveCamera /* | OrthographicCamera */, domElement: HTMLCanvasElement, renderTarget: WebGLRenderTarget, renderer: WebGLRenderer){
	  super();
    const scope = this;
    this.camera = camera;
    this.domElement = domElement;
    
    const mousePosition = new Vector2()
    const zoomDirection = new Vector3()
    const cameraLookAt = new Vector3()

	  this.update = function(this: WorldInHandControls, deltaTime?: number | null): void {
	  }

    function onMouseWheel(event: WheelEvent): void {
      event.preventDefault();
      scope.dispatchEvent( _startEvent );
      handleMouseWheel( event );
      scope.dispatchEvent( _endEvent );

      /*const rendererSize = renderer.getSize(new Vector2());
      const depthTextureType = renderTarget.depthTexture.type;
      let depthTexture: TypedArray;
      if (depthTextureType === UnsignedIntType) depthTexture = new Uint8Array(rendererSize.x * rendererSize.y * 4);
      else depthTexture = new Float32Array(rendererSize.x * rendererSize.y);
      renderer.readRenderTargetPixels(renderTarget.depth, 0, 0, rendererSize.x, rendererSize.y, depthTexture);

      const actual = new Uint32Array(rendererSize.x * rendererSize.y);
      for (let i = 0; i < depthTexture.length / 4; i++) actual[i] = depthTexture[i * 4] << 24 | depthTexture[i * 4 + 1] << 16 | depthTexture[i * 4 + 2] << 8 | depthTexture[i * 4 + 3];
      console.log(actual)

      for (let i = 0; i < depthTexture.length; i++) {
        if (depthTexture[i] !== 0) {
          console.log(i)
          break;
        }
      }*/
    }

	// TODO: on window resize, resize buffer

    function handleMouseWheel(event: WheelEvent): void {
      updateMouseParameters(event);

      const zoomSpeed = cameraLookAt.clone().sub(camera.position).length()

      zoom(-(event.deltaY / Math.abs(event.deltaY)) * zoomSpeed * 0.25);
      //console.log(-(event.deltaY / Math.abs(event.deltaY)))

      /*if ( event.deltaY < 0 ) {
        zoom
      } else if ( event.deltaY > 0 ) {
        zoomOut();
      }*/

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

      zoomDirection.set(mousePosition.x, mousePosition.y, 0).unproject(camera).sub(camera.position).normalize();
    }

    scope.domElement.addEventListener( 'wheel', onMouseWheel, { passive: false } );
	//addEventListener( 'resize', onWindowResize );
  }
}

export { WorldInHandControls as WorldInHandControls };