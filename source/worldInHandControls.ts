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
	Sphere,
	DepthFormat,
	DepthTexture,
	SphereGeometry,
	MeshBasicMaterial,
	Object3D
} from 'three';

export class WorldInHandControls extends EventTarget {
	/**
	 * Render whatever you actually want to navigate on into this RenderTarget.
	 */
	readonly navigationRenderTarget: WebGLRenderTarget;
	protected domElement: HTMLCanvasElement;
	protected renderer: WebGLRenderer;
	protected actualScene: Scene;

	protected camera: PerspectiveCamera;
	protected depthBufferScene: Scene;
	protected copyPlaneScene: Scene;
	protected depthBufferRenderTarget: WebGLRenderTarget;

	protected depthBufferPlaneMaterial: ShaderMaterial;
	protected copyPlaneMaterial: ShaderMaterial;

	/*
	Navigation state
	 */

	protected pointers: Array<PointerEvent> = [];
	protected previousPointers: Array<PointerEvent> = [];

	protected mousePosition = new Vector2();
	protected mouseWorldPosition = new Vector3();
	protected cameraLookAt = new Vector3();

	protected zoomDirection = new Vector3();
	protected rotateStart = new Vector2();
	protected rotateEnd = new Vector2();
	protected rotateDelta = new Vector2();
	protected panStart = new Vector3();
	protected panHeightGuide = new Plane();

	/*
	Configuration variables
	 */

	protected _useBottomOfBoundingBoxAsGroundPlane = true;
	protected _allowRotationBelowGroundPlane = true;
	protected _rotateAroundMousePosition = false;

	/*
	Navigation resiliency
	 */

	protected angleToYAxis!: number;
	protected maxLowerRotationAngle!: number;
	protected maxPanZoomDistance!: number;
	protected groundPlane!: number;
	protected boundingDepthNDC!: number;
	protected sceneBackPoint = new Vector3();
	protected boundingSphere = new Sphere();
	protected nearPlane = new Plane();

	protected sceneHasMesh = false;
	protected hasWarnedAboutEmptyScene = false;

	/*
	Debug
	 */

	protected debug = false;

	protected testSphereMesh: Mesh | undefined;

	/**
	 * @param camera The camera to navigate.
	 * @param domElement The canvas to listen for events on.
	 * @param renderer The renderer to render with.
	 * @param scene The scene to navigate in.
	 * @param lookAtSceneCenter Whether camera lookAt should be scene center. Defaults to false, meaning (0, 0, 0).
	 * @param msaaSamples The number of samples for the navigationRenderTarget. Default is 4.
	 */
	constructor(camera: PerspectiveCamera, domElement: HTMLCanvasElement, renderer: WebGLRenderer, scene: Scene, lookAtSceneCenter: boolean = false, msaaSamples: number = 4) {
		super();

		this.camera = camera;
		this.domElement = domElement;
		this.domElement.style.touchAction = 'none'; // disable scrolling on touch
		this.renderer = renderer;
		this.actualScene = scene;

		this.navigationRenderTarget = new WebGLRenderTarget(1, 1, { samples: msaaSamples });
		this.navigationRenderTarget.depthTexture = new DepthTexture(1, 1, FloatType);
		this.navigationRenderTarget.depthTexture.format = DepthFormat;

		this.depthBufferRenderTarget = new WebGLRenderTarget(1, 1, {format: RGBAFormat, type: FloatType});
		this.updateRenderTargets();

		{
			const planeVertexShader = `
			varying vec2 vUV;
			
			void main() {
				vUV = uv;
				gl_Position = vec4(position, 1.0);
			}
			`;

			const depthPlaneFragmentShader = `
			varying vec2 vUV;
			uniform sampler2D uDepthTexture;
			
			void main() {
				gl_FragColor = texture(uDepthTexture, vUV);
			}
			`;

			const copyPlaneFragmentShader = `
			varying vec2 vUV;
			uniform sampler2D uColorTexture;
			
			void main() {
				gl_FragColor = LinearTosRGB(texture(uColorTexture, vUV));
			}
			`;

			const planeGeometry = new PlaneGeometry(2, 2);

			this.depthBufferPlaneMaterial = new ShaderMaterial();
			this.depthBufferPlaneMaterial.vertexShader = planeVertexShader;
			this.depthBufferPlaneMaterial.fragmentShader = depthPlaneFragmentShader;

			const depthBufferPlane = new Mesh(planeGeometry, this.depthBufferPlaneMaterial);
			depthBufferPlane.frustumCulled = false;

			this.depthBufferScene = new Scene();
			this.depthBufferScene.add(depthBufferPlane);

			this.copyPlaneMaterial = new ShaderMaterial();
			this.copyPlaneMaterial.vertexShader = planeVertexShader;
			this.copyPlaneMaterial.fragmentShader = copyPlaneFragmentShader;

			const copyPlane = new Mesh(planeGeometry, this.copyPlaneMaterial);
			copyPlane.frustumCulled = false;
			
			this.copyPlaneScene = new Scene();
			this.copyPlaneScene.add(copyPlane);
		}

		this.setupResiliency();

		this.actualScene.addEventListener('change', this.setupBoundingSphereBound);
		this.actualScene.addEventListener('resize', this.updateRenderTargetsBound);

		this.domElement.addEventListener('pointerdown', this.onPointerDownBound, { passive: false });
		this.domElement.addEventListener('pointercancel', this.onPointerUpBound);
		this.domElement.addEventListener('wheel', this.onMouseWheelBound, { passive: false });
		this.domElement.addEventListener('contextmenu', this.preventContextMenu);

		if (lookAtSceneCenter)
			this.reloadCamera();
		else 
			this.camera.lookAt(0, 0, 0);

		if (this.debug) {
			const testSphereGeometry = new SphereGeometry(0.25);
			const testSphereMaterial = new MeshBasicMaterial();
			this.testSphereMesh = new Mesh(testSphereGeometry, testSphereMaterial);

			this.actualScene.add(this.testSphereMesh);
		}
	}

	/*
	Actual navigation
	 */

	protected zoom(direction: number): void {
		this.zoomDirection.copy(this.mouseWorldPosition).sub(this.camera.position);

		// prevent zooms that put geometry between camera near plane and camera
		const cameraZAxisWorld = new Vector3(0, 0, 1).unproject(this.camera).normalize();
		this.nearPlane.setFromNormalAndCoplanarPoint(cameraZAxisWorld, this.camera.position.clone().addScaledVector(cameraZAxisWorld, this.camera.near * 1.1));

		const distanceToNearPlane = this.nearPlane.distanceToPoint(this.mouseWorldPosition);

		const nearPlaneRatio = distanceToNearPlane / this.zoomDirection.length();
		this.zoomDirection.multiplyScalar(nearPlaneRatio);

		// make zooming in, then zooming out have the same camera distance as before
		if (direction < 0) this.zoomDirection.multiplyScalar(0.33 * direction);
		else this.zoomDirection.multiplyScalar(0.25 * direction);

		// prevent zooming scene too far away
		const nextCameraPosition = this.camera.position.clone().add(this.zoomDirection);
		if (nextCameraPosition.length() > this.maxPanZoomDistance
			// prevent zoom through ground plane
			|| ((nextCameraPosition.y - this.groundPlane) / (this.camera.position.y - this.groundPlane)) < 0) return;

		this.camera.position.copy(nextCameraPosition);
		this.camera.updateMatrixWorld(true);

		const linearDepth = this.readDepthAtPosition(0, 0);
		this.cameraLookAt.copy(new Vector3(0, 0, linearDepth).unproject(this.camera));

		const scalingFactor = -this.camera.position.y / (this.cameraLookAt.y - this.camera.position.y);
		// Height of camera reference point should not change
		const intersectionXZ = this.camera.position.clone().add(this.cameraLookAt.clone().sub(this.camera.position).multiplyScalar(scalingFactor));
		this.cameraLookAt.copy(intersectionXZ);

		this.updateFurthestSceneDepth();
	}

	protected rotate(delta: Vector2): void {
		const rotationCenter = this._rotateAroundMousePosition ? this.mouseWorldPosition : this.cameraLookAt;
		const rotationCenterToCamera = this.camera.position.clone().sub(rotationCenter);
		this.camera.position.sub(rotationCenterToCamera);

		const cameraXAxis = new Vector3().crossVectors(rotationCenterToCamera, this.camera.up).normalize();
		const rotationMatrix = new Matrix4().makeRotationY(-delta.x);

		// prevent illegal rotation
		let nextAngleToYAxis = this.angleToYAxis - delta.y;
		nextAngleToYAxis = Math.max(Math.min(nextAngleToYAxis, this.maxLowerRotationAngle), 0.001);
		const rotationDelta = this.angleToYAxis - nextAngleToYAxis;
		rotationMatrix.multiply(new Matrix4().makeRotationAxis(cameraXAxis, rotationDelta));
		this.angleToYAxis = nextAngleToYAxis;

		rotationCenterToCamera.applyMatrix4(rotationMatrix);
		this.camera.position.add(rotationCenterToCamera);
		this.camera.lookAt(this.cameraLookAt);

		this.camera.updateMatrixWorld(true);

		this.updateFurthestSceneDepth();
	}

	protected pan(delta: Vector3): void {
		delta.negate();

		// prevent illegal pan
		const nextCameraPosition = this.camera.position.clone().add(delta);
		if (nextCameraPosition.clone().sub(this.boundingSphere.center).length() > this.maxPanZoomDistance) return;
		
		this.camera.position.copy(nextCameraPosition);
		this.cameraLookAt.add(delta);

		this.camera.updateMatrixWorld(true);

		// update furthest scene depth in camera coordinates
		this.updateFurthestSceneDepth();
	}

	/*
	Event handlers
	 */

	protected onMouseWheelBound = this.onMouseWheel.bind(this);
	protected onMouseWheel(event: WheelEvent): void {
		if (!this.sceneHasMesh) this.warnAboutEmptyScene();

		event.preventDefault();
		this.handleMouseWheel( event );
	}

	protected onPointerDownBound = this.onPointerDown.bind(this);
	protected onPointerDown(event: PointerEvent): void {
		if (!this.sceneHasMesh) this.warnAboutEmptyScene();

		this.domElement.removeEventListener('pointermove', this.handlePointerMovePanBound);
		this.domElement.removeEventListener('pointermove', this.handlePointerMoveRotateBound);
		this.domElement.removeEventListener('pointermove', this.handleTouchMoveZoomRotateBound);

		this.domElement.addEventListener('pointerup', this.onPointerUpBound);
		this.domElement.setPointerCapture(event.pointerId);

		if (event.pointerType === 'touch') {
			this.trackPointer(event);

			switch (this.pointers.length) {
			case 1:
				this.handlePointerDownPan(event);
				this.domElement.addEventListener('pointermove', this.handlePointerMovePanBound);
				break;
			case 2:
				this.handlePointerDownRotate(event);
				// no special handling for touch down zoom required
				this.domElement.addEventListener('pointermove', this.handleTouchMoveZoomRotateBound);
				break;
			}
		} else {
			switch (event.button) {
			// left mouse
			case 0:
				this.handlePointerDownRotate(event);
				this.domElement.addEventListener('pointermove', this.handlePointerMoveRotateBound);
				break;

			// right mouse
			case 2:
				this.handlePointerDownPan(event);
				this.domElement.addEventListener('pointermove', this.handlePointerMovePanBound);
				break;
			}
		}
	}

	protected onPointerUpBound = this.onPointerUp.bind(this);
	protected onPointerUp( event: PointerEvent ) {
		if (event.pointerType === 'touch') this.removePointer( event );

		this.domElement.releasePointerCapture( event.pointerId );
		this.domElement.removeEventListener('pointermove', this.handlePointerMovePanBound);
		this.domElement.removeEventListener('pointermove', this.handlePointerMoveRotateBound);
		this.domElement.removeEventListener('pointermove', this.handleTouchMoveZoomRotateBound);

		// always true for mouse events
		if (this.pointers.length === 0) this.domElement.removeEventListener('pointerup', this.onPointerUpBound);
		// call onPointerDown to enable panning when removing only one finger
		else this.onPointerDown(this.pointers[0]);
	}

	protected handleMouseWheelBound = this.handleMouseWheel.bind(this);
	protected handleMouseWheel(event: WheelEvent): void {
		this.updateMouseParameters(event.clientX, event.clientY);

		this.zoom(-(event.deltaY / Math.abs(event.deltaY)));

		this.dispatchEvent(new Event('change'));
	}

	protected handlePointerDownRotateBound = this.handlePointerDownRotate.bind(this);
	protected handlePointerDownRotate(event: PointerEvent): void {
		const averagePointerPosition = this.getAveragePointerPosition(event);
		this.updateMouseParameters(averagePointerPosition.x, averagePointerPosition.y);

		this.rotateStart.copy(averagePointerPosition);
	}

	protected handlePointerMoveRotateBound = this.handlePointerMoveRotate.bind(this);
	protected handlePointerMoveRotate(event: PointerEvent): void {
		this.rotateEnd.copy(this.getAveragePointerPosition(event));
		this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart).multiplyScalar( 0.005 );

		this.rotate(this.rotateDelta);

		this.rotateStart.copy(this.rotateEnd);
		this.dispatchEvent(new Event('change'));
	}

	protected handlePointerDownPanBound = this.handlePointerDownPan.bind(this);
	protected handlePointerDownPan(event: PointerEvent): void {
		this.updateMouseParameters(event.clientX, event.clientY);

		this.panStart.copy(this.mouseWorldPosition);
		// use negative y to make plane have positive y
		this.panHeightGuide.copy(new Plane(new Vector3(0, 1, 0), -this.panStart.y));
	}

	protected handlePointerMovePanBound = this.handlePointerMovePan.bind(this);
	protected handlePointerMovePan(event: PointerEvent): void {
		this.updateMouseParameters(event.clientX, event.clientY);

		const mouseRay = new Ray(this.camera.position, this.mouseWorldPosition.clone().sub(this.camera.position).normalize());
		const panCurrent = new Vector3();

		// ignore if no intersection with height guide plane can be found
		if (mouseRay.intersectPlane(this.panHeightGuide, panCurrent) === null) return;

		this.pan(panCurrent.clone().sub(this.panStart));

		this.dispatchEvent(new Event('change'));
	}

	protected handleTouchMoveZoomRotateBound = this.handleTouchMoveZoomRotate.bind(this);
	protected handleTouchMoveZoomRotate(event: PointerEvent) {
		this.trackPointer(event);

		this.handlePointerMoveRotate(event);
		this.handleTouchMoveZoom(event);
		this.dispatchEvent(new Event('change'));
	}

	protected handleTouchMoveZoomBound = this.handleTouchMoveZoom.bind(this);
	protected handleTouchMoveZoom(event: PointerEvent) {
		const otherPointer = this.getOtherPointer(event);

		const averageX = (event.clientX + otherPointer.clientX) / 2;
		const averageY = (event.clientY + otherPointer.clientY) / 2;
		this.updateMouseParameters(averageX, averageY);

		const currLength = new Vector2(event.clientX - otherPointer.clientX, event.clientY - otherPointer.clientY).length();
		const prevLength = new Vector2(this.previousPointers[0].clientX - this.previousPointers[1].clientX, this.previousPointers[0].clientY - this.previousPointers[1].clientY).length();
		const delta = (currLength - prevLength) / (Math.max(this.domElement.clientWidth, this.domElement.clientHeight)) * 5;

		this.zoom(delta);
		this.dispatchEvent(new Event('change'));
	}

	protected preventContextMenu(event: Event) {
		event.preventDefault();
	}

	/*
	Process helpers
	 */

	/**
	 * Updates the navigation with the current data in navigationRenderTarget.
	 * @param copyToCanvas Whether to copy the navigationRenderTarget to the canvas.
	 */
	public update(copyToCanvas: boolean = true): void {
		this.depthBufferPlaneMaterial.uniforms = { uDepthTexture: { value: this.navigationRenderTarget.depthTexture } };
		this.renderer.setRenderTarget(this.depthBufferRenderTarget);
		this.renderer.render(this.depthBufferScene, this.camera);

		if (!copyToCanvas) return;
		this.copyPlaneMaterial.uniforms = { uColorTexture: { value: this.navigationRenderTarget.texture } };
		this.renderer.setRenderTarget(null);
		this.renderer.render(this.copyPlaneScene, this.camera);
	}

	/**
	 * Cleans up after this navigation. Removes all registered event listeners.
	 */
	public dispose(): void {
		this.domElement.removeEventListener('pointermove', this.handlePointerMovePanBound);
		this.domElement.removeEventListener('pointermove', this.handlePointerMoveRotateBound);
		this.domElement.removeEventListener('pointermove', this.handleTouchMoveZoomRotateBound);
		this.domElement.removeEventListener('pointerup', this.onPointerUpBound);
		this.domElement.removeEventListener( 'pointerdown', this.onPointerDownBound);
		this.domElement.removeEventListener( 'pointercancel', this.onPointerUpBound);
		this.domElement.removeEventListener( 'wheel', this.onMouseWheelBound);
		this.domElement.removeEventListener( 'contextmenu', this.preventContextMenu);
	}

	/**
	* Reloads the camera's look at position. If cameraLookAt is not provided, the look at position is set to the center of the bounding sphere.
	* @param cameraLookAt The new look at position of the camera.
	*/
	public reloadCamera(cameraLookAt?: Vector3): void {
		if (cameraLookAt !== undefined) {
			this.cameraLookAt = cameraLookAt;
		} else {
			const lookAtRay = new Ray(this.camera.position, new Vector3(0, 0, 1).unproject(this.camera).normalize());
			const groundPlane = new Plane(new Vector3(0, 1, 0), -this.groundPlane);

			if (lookAtRay.intersectPlane(groundPlane, this.cameraLookAt) === null) {
				this.cameraLookAt.copy(this.boundingSphere.center);
				console.warn('Could not find a valid look at position for the camera. Using the center of the bounding sphere instead.');
			}
		}

		this.camera.lookAt(this.cameraLookAt);

		this.setupAngleToYAxis();
		this.updateFurthestSceneDepth();
	}

	protected updateRenderTargetsBound = this.updateRenderTargets.bind(this);
	/**
	 * Resizes all RenderTargets to the current dimensions of renderer.
	 * @protected
	 */
	protected updateRenderTargets(): void {
		const size = this.renderer.getSize(new Vector2).multiplyScalar(this.renderer.getPixelRatio());

		this.depthBufferRenderTarget.setSize(size.x, size.y);
		this.navigationRenderTarget.setSize(size.x, size.y);
	}

	/*
	World in hand helpers
	 */

	/**
	 * Sets mousePosition to the current mouse position in NDC and sets
	 * mouseWorldPosition to the current mouse position in world coordinates.<br />
	 * <b>If the depth buffer value at the current mouse position is greater than
	 * boundingDepthNDC, boundingDepthNDC is used instead.</b>
	 */
	protected updateMouseParameters(eventX: number, eventY: number): void {
		const rect = this.domElement.getBoundingClientRect();

		const x = (eventX - rect.left);
		const y = (eventY - rect.top);
		const w = rect.width;
		const h = rect.height;

		this.mousePosition.x = ( x / w ) * 2 - 1;
		this.mousePosition.y = 1 - ( y / h ) * 2;

		this.mousePosition.clamp(new Vector2(-1, -1), new Vector2(1, 1));

		const depth = this.readDepthAtPosition(this.mousePosition.x, this.mousePosition.y);
		const clampedDepth = Math.min(depth, this.boundingDepthNDC);
		this.mouseWorldPosition.set(this.mousePosition.x, this.mousePosition.y, clampedDepth);
		this.mouseWorldPosition.unproject(this.camera);
	}

	/**
	 * Reads the depth at the specified position in NDC. x and y are clamped to [-1, 1].
	 * @param x x position in NDC
	 * @param y y position in NDC
	 * @return NDC depth [-1, 1] at the specified coordinates
	 */
	protected readDepthAtPosition(x: number, y: number): number {
		const w = this.depthBufferRenderTarget.width;
		const h = this.depthBufferRenderTarget.height;

		x = Math.max(Math.min(1, x), -1);
		y = Math.max(Math.min(1, y), -1);

		const xPixel = x * w/2 + w/2;
		const yPixel = y * h/2 + h/2;

		const depthPixel = new Float32Array(4);
		this.renderer.readRenderTargetPixels(this.depthBufferRenderTarget, xPixel, yPixel, 1, 1, depthPixel);

		let linearDepth = depthPixel[0];
		linearDepth = Math.min(1.0, linearDepth);
		linearDepth = Math.max(0.0, linearDepth);
		linearDepth = linearDepth * 2 - 1;

		return linearDepth;
	}

	/*
	Resiliency helpers
	 */

	/**
	 * Sets up all resiliency options according to the set flags.
	 */
	protected setupResiliency(): void {
		this.setupAngleToYAxis();
		this.setupMaxLowerRotationAngle();
		this.setupBoundingSphere();
	}

	protected setupBoundingSphereBound = this.setupBoundingSphere.bind(this);
	/**
	 * Calculates the bounding sphere of the scene and sets resiliency variables accordingly.
	 * @protected
	 */
	protected setupBoundingSphere(): void {
		this.actualScene.traverse((object: Object3D) => {
			if (this.sceneHasMesh) return;
			else if (object instanceof Mesh) this.sceneHasMesh = true;
		});

		const box = new Box3().setFromObject(this.actualScene, true);
		box.getBoundingSphere(this.boundingSphere);

		if (this.boundingSphere.radius <= 0 && this.sceneHasMesh) console.warn('Could not calculate a valid bounding sphere for the given scene. This may break the navigation.');

		this.maxPanZoomDistance = this.boundingSphere.radius * 5;
		this.groundPlane = this._useBottomOfBoundingBoxAsGroundPlane ? box.min.y : 0;

		this.updateFurthestSceneDepth();
	}

	/**
	 * Sets maxLowerRotationAngle according to whether the navigation is allowed to rotate below the set ground plane.
	 * @protected
	 */
	protected setupMaxLowerRotationAngle(): void {
		this.maxLowerRotationAngle = this._allowRotationBelowGroundPlane ? Math.PI - 0.001 : Math.PI / 2;
	}

	/**
	 * Sets angleToYAxis as the current angle between the camera look-to vector (i.e., the vector between the camera and what it's looking at) and the y-axis.
	 * @protected
	 */
	protected setupAngleToYAxis(): void {
		if (this.camera.position.equals(new Vector3(0, 0, 0))) console.warn('Camera is at (0, 0, 0). This will break the navigation resiliency!');

		this.angleToYAxis = this.camera.position.clone().sub(this.cameraLookAt).angleTo(new Vector3(0, 1, 0));
		if (this.angleToYAxis === 0 || this.angleToYAxis === Math.PI) console.warn('Camera position is on y-axis. This will lead to navigation defects. Consider moving your camera.');
	}

	/**
	 * Calculates the furthest scene depth in camera coordinates.
	 * @protected
	 */
	protected updateFurthestSceneDepth(): void {
		const direction = new Vector3(0, 0, 1).unproject(this.camera).normalize();
		this.sceneBackPoint.copy(this.boundingSphere.center.clone().addScaledVector(direction, this.boundingSphere.radius));
		this.boundingDepthNDC = this.sceneBackPoint.clone().project(this.camera).z;
	}

	protected warnAboutEmptyScene(): void {
		if (this.hasWarnedAboutEmptyScene) return;

		this.hasWarnedAboutEmptyScene = true;
		console.warn('The given scene is empty, or was empty at WorldInHandControls creation. This breaks the navigation. If you have added things to the scene since then, dispatch a "change" event on the given scene.');
	}

	/*
	Pointer helpers
	 */

	/**
	 * Tracks up to two pointers. Expressly ignores any additional pointers.
	 * @param event The event to possibly track.
	 * @protected
	 */
	protected trackPointer(event: PointerEvent): void {
		if (this.pointers.length === 0) {
			this.pointers.push(event);
			this.previousPointers.push(event);
			return;
		} else if (this.pointers.length === 1 && this.pointers[0].pointerId !== event.pointerId) {
			this.pointers.push(event);
			this.previousPointers.push(event);
			return;
		}

		let index = 2;
		if (this.pointers[0].pointerId === event.pointerId) index = 0;
		else if (this.pointers[1].pointerId === event.pointerId) index = 1;
		else return;

		this.previousPointers[index] = this.pointers[index];
		this.pointers[index] = event;
	}

	/**
	 * Removes the specified pointer from tracking.
	 * @param event The event to remove from tracking.
	 * @protected
	 */
	protected removePointer(event: PointerEvent): void {
		if (this.pointers.length === 0) return;
		else if (this.pointers.length === 1) {
			this.pointers.splice(0, 1);
			this.previousPointers.splice(0, 1);
			return;
		}

		let index = 2;
		if (this.pointers[0].pointerId === event.pointerId) index = 0;
		else if (this.pointers[1].pointerId === event.pointerId) index = 1;
		else return;

		this.pointers.splice(index, 1);
		this.previousPointers.splice(index, 1);
	}

	/**
	 * Gets the other tracked pointer from pointers.
	 * @param event The pointer NOT to return.
	 * @protected
	 */
	protected getOtherPointer(event: PointerEvent): PointerEvent {
		return (this.pointers[0].pointerId === event.pointerId) ? this.pointers[1] : this.pointers[0];
	}

	protected getAveragePointerPosition(event: PointerEvent): Vector2 {
		const position = new Vector2();

		if (event.pointerType === 'mouse') {
			position.x = event.clientX;
			position.y = event.clientY;
		} else {
			const otherPointer = this.getOtherPointer(event);
			position.x = (event.clientX + otherPointer.clientX) / 2;
			position.y = (event.clientY + otherPointer.clientY) / 2;
		}

		return position;
	}

	/*
	Setter
	 */

	/**
	 * Whether to allow rotation of the camera below the xz-plane.
	 */
	public set allowRotationBelowGroundPlane(value: boolean) {
		this._allowRotationBelowGroundPlane = value;
		this.setupMaxLowerRotationAngle();
	}

	/**
	 * Whether to use the bottom of the scene's bounding box as the ground plane. Uses y = 0 otherwise.
	 */
	public set useBottomOfBoundingBoxAsGroundPlane(value: boolean) {
		this._useBottomOfBoundingBoxAsGroundPlane = value;
	}

	/**
	 * Whether to rotate around the mouse position. Rotates around the screen's center otherwise.
	 */
	public set rotateAroundMousePosition(value: boolean) {
		this._rotateAroundMousePosition = value;
	}
}