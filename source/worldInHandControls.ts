import {
  FloatType,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer, 
  RGBAFormat, 
  Matrix4,
  Plane,
  Ray,
  Box3,
  Sphere
} from 'three';


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

class WorldInHandControls extends EventTarget {
  protected domElement: HTMLCanvasElement
  protected camera: PerspectiveCamera // | OrthographicCamera
  protected depthBufferScene: Scene
  protected planeRenderTarget: WebGLRenderTarget

  public update: Function
  public dispose: Function

  constructor (camera: PerspectiveCamera /* | OrthographicCamera */, domElement: HTMLCanvasElement, renderTarget: WebGLRenderTarget, renderer: WebGLRenderer, scene: Scene){
	  super();
    const scope = this;
    this.camera = camera;
    this.domElement = domElement;
    this.domElement.style.touchAction = 'none'; // disable touch scroll

    this.camera.lookAt(0, 0, 0);

    /**
     * Configuration
     */

    const useBottomOfBoundingBoxAsGroundPlane = true; // otherwise assumes ground plane y = 0
    const rotateBelowScene = true;
    const rotateAroundMousePosition = false; // otherwise rotates around center of screen

    /**
     * Internal variables
     */
    
    // Cannot be const because splice wouldn't shrink array size
    let pointers: Array<PointerEvent> = [];
    let previousPointers: Array<PointerEvent> = [];

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
    this.depthBufferScene = new Scene();
    this.depthBufferScene.add(planeMesh);

    this.planeRenderTarget = new WebGLRenderTarget(domElement.clientWidth, domElement.clientHeight, {format: RGBAFormat, type: FloatType});

    /**
     * Navigation resiliency
     */

    // calculate angle between inverse camera lookTo vector and y axis to prevent illegal rotation
    let angleToYAxis = this.camera.position.clone().sub(cameraLookAt).angleTo(new Vector3(0, 1, 0));
    if (angleToYAxis === 0 || angleToYAxis === Math.PI) console.warn("Camera position is on y-axis. This will lead to navigation defects. Consider moving your camera.");
    // pi - 0.001 to prevent rotation onto y-axis
    const maxLowerRotationAngle = rotateBelowScene ? Math.PI - 0.001 : Math.PI / 2;

    // calculate distance from camera to camera lookAt to prevent illegal zoom and pan
    let distanceToCameraLookAt = this.camera.position.length();

    // compute bounding sphere radius and back of scene from camera position
    let boundingSphereRadius: number;
    let boundingHeightMin: number;
    let boundingDepthNDC: number;

    {
      const box = new Box3().setFromObject(scene, true);
      const boundingSphere = box.getBoundingSphere(new Sphere());
      boundingSphereRadius = boundingSphere.radius * 5;
      boundingHeightMin = useBottomOfBoundingBoxAsGroundPlane ? box.min.y : 0;

      const direction = camera.position.clone().negate().normalize();
      const backPoint = boundingSphere.center.clone().addScaledVector(direction, boundingSphere.radius);
      boundingDepthNDC = backPoint.clone().project(camera).z;
    }
    if (distanceToCameraLookAt > boundingSphereRadius) console.warn("Camera is very far from the scene. Consider putting your camera closer to the scene.");

    /**
     * Testing
     */
    
    //const testSphereGeometry = new SphereGeometry(0.25);
    //const testSphereMaterial = new MeshBasicMaterial();
    //const testSphereMesh = new Mesh(testSphereGeometry, testSphereMaterial);

    //scene.add(testSphereMesh);

    /**
     * Utility functions
     */

    this.dispose = function () {
      scope.domElement.removeEventListener('pointermove', handlePointerMovePan);
      scope.domElement.removeEventListener('pointermove', handlePointerMoveRotate);
      scope.domElement.removeEventListener('pointermove', handleTouchMoveZoomRotate);
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
      handleMouseWheel( event );
    }

    function onPointerDown(event: PointerEvent): void {
      scope.domElement.removeEventListener('pointermove', handlePointerMovePan);
      scope.domElement.removeEventListener('pointermove', handlePointerMoveRotate);
      scope.domElement.removeEventListener('pointermove', handleTouchMoveZoomRotate);

      scope.domElement.addEventListener('pointerup', onPointerUp);
      scope.domElement.setPointerCapture(event.pointerId);

      if ( event.pointerType === 'touch' ) {
        trackPointer(event);

        switch (pointers.length) {
          case 1:
            handlePointerDownPan(event);
            scope.domElement.addEventListener('pointermove', handlePointerMovePan);
            break;
          case 2:
            handlePointerDownRotate(event);
            // no special handling for touch down zoom required
            scope.domElement.addEventListener('pointermove', handleTouchMoveZoomRotate);
            break;
        }
      } else { 
        switch (event.button) {
          // left mouse
          case 0:
            handlePointerDownRotate(event);
            scope.domElement.addEventListener('pointermove', handlePointerMoveRotate);
            break;
          
          // right mouse
          case 2:
            handlePointerDownPan(event);
            scope.domElement.addEventListener('pointermove', handlePointerMovePan);
            break;
        }
      }
    }

    function onPointerUp( event: PointerEvent ) {
      if (event.pointerType === 'touch') removePointer( event );

      scope.domElement.releasePointerCapture( event.pointerId );
      scope.domElement.removeEventListener('pointermove', handlePointerMovePan);
      scope.domElement.removeEventListener('pointermove', handlePointerMoveRotate);
      scope.domElement.removeEventListener('pointermove', handleTouchMoveZoomRotate);

      // always true for mouse events
      if (pointers.length === 0) scope.domElement.removeEventListener('pointerup', onPointerUp);
      // call onPointerDown to enable panning when removing only one finger
      else onPointerDown(pointers[0]);
    }
    

    function handleMouseWheel(event: WheelEvent): void {
      updateMouseParameters(event.clientX, event.clientY);

      zoom(-(event.deltaY / Math.abs(event.deltaY)));

      scope.update();
      scope.dispatchEvent(new Event('change'));
    }

    function handlePointerDownRotate(event: PointerEvent): void {
      const averagePointerPosition = getAveragePointerPosition(event);
      updateMouseParameters(averagePointerPosition.x, averagePointerPosition.y)

      rotateStart.copy(averagePointerPosition);
  	}

    function handlePointerMoveRotate(event: PointerEvent): void {
      rotateEnd.copy(getAveragePointerPosition(event));
      rotateDelta.subVectors( rotateEnd, rotateStart ).multiplyScalar( 0.005 );

      rotate(rotateDelta);

      rotateStart.copy( rotateEnd );
      scope.update();
      scope.dispatchEvent(new Event('change'));
    }

    function handlePointerDownPan(event: PointerEvent): void {
      updateMouseParameters(event.clientX, event.clientY);

      panStart.copy(mouseWorldPosition);
      panHeightGuide.copy(new Plane(new Vector3(0, 1, 0), -panStart.y));
    }

    function handlePointerMovePan(event: PointerEvent): void {
      updateMouseParameters(event.clientX, event.clientY);

      const mouseRay = new Ray(camera.position, mouseWorldPosition.clone().sub(camera.position).normalize());
      const panCurrent = new Vector3(); 
      mouseRay.intersectPlane(panHeightGuide, panCurrent);

      pan(panCurrent.clone().sub(panStart));

      scope.update();
      scope.dispatchEvent(new Event('change'));
    }

    function handleTouchMoveZoomRotate(event: PointerEvent) {
      trackPointer(event);

      handlePointerMoveRotate(event);
      handleTouchMoveZoom(event);
      scope.dispatchEvent(new Event('change'));
    }

    function handleTouchMoveZoom(event: PointerEvent) {
      const otherPointer = getOtherPointer(event);

      const averageX = (event.clientX + otherPointer.clientX) / 2;
      const averageY = (event.clientY + otherPointer.clientY) / 2;
      updateMouseParameters(averageX, averageY);

      const currLength = new Vector2(event.clientX - otherPointer.clientX, event.clientY - otherPointer.clientY).length();
      const prevLength = new Vector2(previousPointers[0].clientX - previousPointers[1].clientX, previousPointers[0].clientY - previousPointers[1].clientY).length();
      const delta = (currLength - prevLength);
 
      zoom(delta * 0.01);
      scope.dispatchEvent(new Event('change'));
    }

    function zoom(amount: number): void {
      zoomDirection.copy(mouseWorldPosition).sub(camera.position).normalize();

      // prevent illegal zoom
      const nextCameraPosition = camera.position.clone().addScaledVector(zoomDirection, amount);
      if (nextCameraPosition.length() > boundingSphereRadius || ((nextCameraPosition.y - boundingHeightMin) / (camera.position.y - boundingHeightMin)) < 0) return;

      camera.position.copy(nextCameraPosition);
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
      const rotationCenter = rotateAroundMousePosition ? mouseWorldPosition : cameraLookAt;
      const rotationCenterToCamera = camera.position.clone().sub(rotationCenter);
      camera.position.sub(rotationCenterToCamera);

      const cameraXAxis = new Vector3().crossVectors(rotationCenterToCamera, camera.up).normalize();
      const rotationMatrix = new Matrix4().makeRotationY(-delta.x);

      // prevent illegal rotation
      let nextAngleToYAxis = angleToYAxis - delta.y;
      nextAngleToYAxis = Math.max(Math.min(nextAngleToYAxis, maxLowerRotationAngle), 0.001);
      const rotationDelta = angleToYAxis - nextAngleToYAxis;
      rotationMatrix.multiply(new Matrix4().makeRotationAxis(cameraXAxis, rotationDelta));
      angleToYAxis = nextAngleToYAxis;


      rotationCenterToCamera.applyMatrix4(rotationMatrix);
      camera.position.add(rotationCenterToCamera);
      camera.lookAt(cameraLookAt);

      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    }

    function pan(delta: Vector3): void {  
      delta.negate();

      // prevent illegal pan
      const nextCameraPosition = camera.position.clone().add(delta);
      if (nextCameraPosition.length() > boundingSphereRadius) return;

      camera.position.copy(nextCameraPosition);
      cameraLookAt.add(delta);

      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
    }

    /**
     * Tracks up to two pointers. Expressly ignores any additional pointers.
     * @param event The event to possibly track.
     */
    function trackPointer(event: PointerEvent): void {
      if (pointers.length === 0) {
        pointers.push(event);
        previousPointers.push(event);
        return;
      } else if (pointers.length === 1 && pointers[0].pointerId !== event.pointerId) {
        pointers.push(event);
        previousPointers.push(event);
        return;
      }

      let index = 2;
      if (pointers[0].pointerId === event.pointerId) index = 0;
      else if (pointers[1].pointerId === event.pointerId) index = 1;
      else return;

      previousPointers[index] = pointers[index];
      pointers[index] = event;
    }

    function removePointer(event: PointerEvent): void {
      if (pointers.length === 0) return;
      else if (pointers.length === 1) {
        pointers.splice(0, 1);
        previousPointers.splice(0, 1);
        return;
      }

      let index = 2;
      if (pointers[0].pointerId === event.pointerId) index = 0;
      else if (pointers[1].pointerId === event.pointerId) index = 1;
      else return;

      pointers.splice(index, 1);
      previousPointers.splice(index, 1);
    }

    /**
     * Sets mousePosition to the current mouse position in NDC and sets
     * mouseWorldPosition to the current mouse position in world coordinates.<br />
     * <b>If the depthbuffer value at the current mouse position is greater than
     * boundingDepthNDC, boundingDepthNDC is used instead.</b>
     */
    function updateMouseParameters(eventX: number, eventY: number): void {
      const rect = scope.domElement.getBoundingClientRect();
      
      const x = (eventX - rect.left);
      const y = (eventY - rect.top);
      const w = rect.width;
      const h = rect.height;

      mousePosition.x = ( x / w ) * 2 - 1;
      mousePosition.y = 1 - ( y / h ) * 2;

      const linearDepth = Math.min(readDepthAtPosition(mousePosition.x, mousePosition.y), boundingDepthNDC);
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
      renderer.render(scope.depthBufferScene, camera);

      const depthPixel = new Float32Array(4);
      renderer.readRenderTargetPixels(scope.planeRenderTarget, xPixel, yPixel, 1, 1, depthPixel);

      let linearDepth = depthPixel[0];
      linearDepth = Math.min(1.0, linearDepth);
      linearDepth = Math.max(0.0, linearDepth);
      linearDepth = linearDepth * 2 - 1;

      return linearDepth;
    }

    function getOtherPointer(event: PointerEvent): PointerEvent {
      return (pointers[0].pointerId === event.pointerId) ? pointers[1] : pointers[0];
    }

    function getAveragePointerPosition(event: PointerEvent): Vector2 {
      const position = new Vector2();
    
      if (event.pointerType === "mouse") {
        position.x = event.clientX;
        position.y = event.clientY;
      } else {
        const otherPointer = getOtherPointer(event);
        position.x = (event.clientX + otherPointer.clientX) / 2;
        position.y = (event.clientY + otherPointer.clientY) / 2;
      }

      return position;
    }

    function preventContextMenu(event: Event) {
      event.preventDefault();
    }

    scope.domElement.addEventListener( 'pointerdown', onPointerDown, {passive: false} );
    scope.domElement.addEventListener( 'pointercancel', onPointerUp );
    scope.domElement.addEventListener( 'wheel', onMouseWheel, { passive: false } );
    // prevent context menu when right clicking
    scope.domElement.addEventListener( 'contextmenu', preventContextMenu);
  }
}

export { WorldInHandControls as WorldInHandControls };